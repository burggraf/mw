use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, error, warn};
use std::net::Ipv4Addr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDevice {
    pub name: String,
    pub host: String,
    pub port: u16,
    #[serde(rename = "serviceType")]
    pub service_type: String,
    #[serde(rename = "deviceId")]
    pub device_id: Option<String>, // Extracted from TXT records
}

/// Extract IPv4 address from mDNS service info
/// On Android, we use direct IP addresses to avoid .local DNS resolution issues
fn extract_ipv4_address(info: &mdns_sd::ServiceInfo) -> Option<String> {
    let localhost = Ipv4Addr::new(127, 0, 0, 1);
    let unspecified = Ipv4Addr::new(0, 0, 0, 0);

    // Try to get IPv4 addresses directly
    let addrs = info.get_addresses_v4();
    for addr in addrs {
        // Filter out localhost and unspecified addresses
        if !addr.eq(&localhost) && !addr.eq(&unspecified) {
            return Some(addr.to_string());
        }
    }

    // Fallback to any address (including IPv6)
    info.get_addresses()
        .iter()
        .filter(|a| {
            // Filter out link-local and loopback addresses that won't work
            let ip_str = a.to_string();
            !ip_str.starts_with("fe80::") && !ip_str.starts_with("127.") && !ip_str.starts_with("::1")
        })
        .next()
        .map(|a| a.to_string())
}

/// Discover Mobile Worship display devices via mDNS
pub async fn discover_disdevices(timeout_secs: u64) -> Vec<DiscoveredDevice> {
    info!("=== Starting mDNS Discovery ===");
    info!("Timeout: {} seconds", timeout_secs);

    // Log all network interfaces for debugging
    use if_addrs::get_if_addrs;
    if let Ok(interfaces) = get_if_addrs() {
        info!("=== Network Interfaces (Discovery Side) ===");
        for iface in &interfaces {
            info!("  Interface: {} -> {}", iface.name, iface.ip());
        }
    }

    let service_type = "_mw-display._tcp.local.";
    info!("Browsing for service type: {}", service_type);

    // Create a service daemon for browsing
    let daemon = match mdns_sd::ServiceDaemon::new() {
        Ok(d) => {
            info!("Created mDNS daemon for discovery");
            d
        }
        Err(e) => {
            error!("Failed to create mDNS daemon for discovery: {}", e);
            return Vec::new();
        }
    };

    // Browse for services
    let receiver = match daemon.browse(service_type) {
        Ok(r) => {
            info!("Successfully started browsing for service type: {}", service_type);
            r
        }
        Err(e) => {
            error!("Failed to browse mDNS services: {}", e);
            return Vec::new();
        }
    };

    let mut devices = Vec::new();
    let mut seen_fullnames = std::collections::HashSet::new();
    let timeout = Duration::from_secs(timeout_secs);
    let start = std::time::Instant::now();
    let mut event_count = 0;
    let mut found_count = 0;
    let mut resolved_count = 0;

    info!("Listening for mDNS events...");

    // Collect devices for the specified timeout
    while start.elapsed() < timeout {
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) => {
                event_count += 1;
                resolved_count += 1;
                info!("=== ServiceResolved event #{} ===", event_count);
                info!("  Fullname: {}", info.get_fullname());
                info!("  Hostname: {}", info.get_hostname());
                info!("  Port: {}", info.get_port());
                info!("  All addresses: {:?}", info.get_addresses());

                // Extract device_id from TXT records
                let txt_properties = info.get_properties();
                info!("  TXT records: {:?}", txt_properties);

                let device_id = txt_properties
                    .iter()
                    .find(|prop| prop.key() == "device_id")
                    .map(|prop| prop.val_str().to_string());

                if let Some(ref id) = device_id {
                    info!("  ✓ Found device_id in TXT records: {}", id);
                } else {
                    info!("  ⚠ No device_id in TXT records (legacy display?)");
                }

                // Skip if we've already seen this service (deduplication)
                let fullname = info.get_fullname().to_string();
                if seen_fullnames.contains(&fullname) {
                    info!("  Skipping duplicate service: {}", fullname);
                    continue;
                }
                seen_fullnames.insert(fullname.clone());

                let host = match extract_ipv4_address(&info) {
                    Some(a) => {
                        info!("  ✓ Using IPv4 address: {}", a);
                        a
                    }
                    None => {
                        warn!("  No valid IP address found, using hostname (may fail)");
                        info.get_hostname().to_string()
                    }
                };

                found_count += 1;
                info!("  ★ Discovered device #{}: {} at {}:{} (device_id: {:?})",
                      found_count, info.get_fullname(), host, info.get_port(), device_id);

                devices.push(DiscoveredDevice {
                    name: fullname,
                    host,
                    port: info.get_port(),
                    service_type: service_type.to_string(),
                    device_id,
                });
            }
            Ok(mdns_sd::ServiceEvent::ServiceFound(name, typ)) => {
                event_count += 1;
                info!("ServiceFound event #{}: {} (type: {})", event_count, name, typ);
                info!("  Querying for more details...");
            }
            Ok(mdns_sd::ServiceEvent::ServiceRemoved(name, typ)) => {
                event_count += 1;
                info!("ServiceRemoved event #{}: {} (type: {})", event_count, name, typ);
            }
            Ok(other) => {
                event_count += 1;
                info!("Other mDNS event #{}: {:?}", event_count, other);
            }
            Err(_e) => {
                // Timeout is expected, continue checking total timeout
            }
        }
    }

    // Shutdown the browser
    let _ = daemon.shutdown();

    info!("=== Discovery Complete ===");
    info!("Total events received: {}", event_count);
    info!("Services found: {}", found_count);
    info!("Services resolved: {}", resolved_count);
    info!("Devices discovered: {}", devices.len());
    for (i, device) in devices.iter().enumerate() {
        info!("  Device {}: {} at {}:{}", i + 1, device.name, device.host, device.port);
    }

    devices
}
