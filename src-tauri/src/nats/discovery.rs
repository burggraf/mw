use crate::nats::types::{DiscoveredNode, DISCOVERY_TIMEOUT_SEC, NATS_SERVICE_NAME};
use std::time::Duration;
use futures_util::{pin_mut, stream::StreamExt};
use mdns::RecordKind;
use std::net::IpAddr;
use tracing::{info, debug, warn};

/// Discover NATS cluster nodes via mDNS
pub async fn discover_cluster_nodes() -> Vec<DiscoveredNode> {
    info!("Starting mDNS discovery for NATS nodes...");

    // Use a shorter timeout for discovery
    let discovery_duration = Duration::from_secs(DISCOVERY_TIMEOUT_SEC);

    match mdns_discover(discovery_duration).await {
        Ok(nodes) => {
            info!("Discovered {} NATS nodes", nodes.len());
            for node in &nodes {
                debug!("  - {} @ {}:{} (platform: {})", node.name, node.host, node.port, node.platform);
            }
            nodes
        }
        Err(e) => {
            warn!("mDNS discovery failed: {}, returning empty list", e);
            Vec::new()
        }
    }
}

/// Internal mDNS discovery using the mdns crate
/// This runs in a blocking task since mdns uses async-std internally
async fn mdns_discover(duration: Duration) -> Result<Vec<DiscoveredNode>, String> {
    // Spawn a blocking task since mdns::discover uses async-std networking
    tokio::task::spawn_blocking(move || {
        // Use async_std's runtime for mdns discovery
        async_std::task::block_on(async {
            let stream = mdns::discover::all(NATS_SERVICE_NAME, duration)
                .map_err(|e| format!("Failed to create mDNS discoverer: {}", e))?
                .listen();

            pin_mut!(stream);

            let mut discovered = std::collections::HashMap::new();
            let start = std::time::Instant::now();
            let timeout_duration = duration;

            // Collect responses for the duration
            while start.elapsed() < timeout_duration {
                // Use async_std's timeout since we're in async_std context
                match async_std::future::timeout(timeout_duration, stream.next()).await {
                    Ok(Some(Ok(response))) => {
                        process_response(response, &mut discovered);
                    }
                    Ok(Some(Err(e))) => {
                        debug!("mDNS response error: {}", e);
                    }
                    Ok(None) => {
                        break; // Stream ended
                    }
                    Err(_) => {
                        break; // Timeout
                    }
                }
            }

            Ok(discovered.into_values().collect())
        })
    })
    .await
    .map_err(|e| format!("Failed to spawn mDNS task: {}", e))?
}

/// Process a single mDNS response and extract node information
fn process_response(response: mdns::Response, discovered: &mut std::collections::HashMap<String, DiscoveredNode>) {
    let mut addr: Option<IpAddr> = None;
    let mut port: Option<u16> = None;
    let mut device_name: Option<String> = None;
    let mut platform: Option<String> = None;

    // Extract information from DNS records
    for record in response.records() {
        match &record.kind {
            RecordKind::A(ip) => {
                addr = Some((*ip).into());
                debug!("Found A record: {}", ip);
            }
            RecordKind::AAAA(ip) => {
                addr = Some((*ip).into());
                debug!("Found AAAA record: {}", ip);
            }
            RecordKind::TXT(txt_strings) => {
                // TXT records contain a Vec<String> where each string is a key=value pair
                debug!("Found TXT record with {} entries", txt_strings.len());

                for txt_entry in txt_strings {
                    debug!("  TXT entry: {}", txt_entry);
                    if let Some((key, value)) = txt_entry.split_once('=') {
                        match key {
                            "port" => {
                                port = value.parse().ok();
                            }
                            "name" | "device_name" => {
                                device_name = Some(value.to_string());
                            }
                            "platform" => {
                                platform = Some(value.to_string());
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {
                // Ignore other record types
            }
        }
    }

    // Create discovered node if we have the minimum required info
    if let Some(ip) = addr {
        let node_id = format!("{}", ip);
        let node = DiscoveredNode {
            id: node_id.clone(),
            name: device_name.unwrap_or_else(|| format!("NATS Node @ {}", ip)),
            host: ip.to_string(),
            port: port.unwrap_or(4222), // Default NATS port
            platform: platform.unwrap_or_else(|| "unknown".to_string()),
        };

        debug!("Discovered node: {:?}", node);
        discovered.insert(node_id, node);
    }
}

/// Advertise our NATS server via mDNS
///
/// Note: The mdns crate we're using is primarily for discovery (browsing).
/// Full advertising/registering would require additional service registration
/// which may need a different approach (e.g., using libavahi directly on Linux,
/// Bonjour on macOS, or the mdns-sd crate which supports both).
///
/// For MVP, controllers can discover displays by:
/// 1. Manual IP entry
/// 2. Full mDNS advertising when we switch to mdns-sd crate
pub async fn advertise_nats_service(port: u16, device_name: &str) -> Result<(), String> {
    info!("Advertising NATS service on port {} as '{}'", port, device_name);

    // TODO: Implement mDNS advertising
    // Options:
    // 1. Switch to mdns-sd crate which supports both browsing and advertising
    // 2. Use platform-specific APIs (Bonjour/Avahi)
    // 3. For now, rely on other discovery methods

    warn!("mDNS advertising not yet implemented - service discovery will rely on other methods");
    Ok(())
}

/// Resolve a NATS node by hostname
pub async fn resolve_node(host: &str, port: u16) -> Option<DiscoveredNode> {
    info!("Resolving NATS node at {}:{}", host, port);

    // For MVP, just return the node directly
    Some(DiscoveredNode {
        id: format!("{}:{}", host, port),
        name: host.to_string(),
        host: host.to_string(),
        port,
        platform: "unknown".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_discover_nodes() {
        let nodes = discover_cluster_nodes().await;
        println!("Discovered {} nodes", nodes.len());
        for node in &nodes {
            println!("  - {} @ {}:{}", node.name, node.host, node.port);
        }
    }

    #[tokio::test]
    async fn test_resolve_node() {
        let node = resolve_node("192.168.1.100", 4222).await;
        assert!(node.is_some());
        println!("Resolved node: {:?}", node);
    }
}
