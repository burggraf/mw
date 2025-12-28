use crate::webrtc::{Peer, PeerType};
use mdns::{Error, RecordKind};
use std::collections::HashMap;
use std::time::Duration;
use uuid::Uuid;
use futures_util::{pin_mut, stream::StreamExt};

const SERVICE_NAME: &str = "_mobile-worship._tcp.local";
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(3);

/// Discovered leader information
#[derive(Debug, Clone)]
pub struct DiscoveredLeader {
    pub peer_id: Uuid,
    pub display_name: String,
    pub peer_type: PeerType,
    pub priority: (u8, u64), // (device_type_score, startup_time_ms)
}

/// mDNS discovery service
pub struct DiscoveryService {
    self_peer: Option<Peer>,
}

impl DiscoveryService {
    pub fn new() -> Self {
        Self {
            self_peer: None,
        }
    }

    /// Start announcing this peer as a potential leader
    ///
    /// Note: The mdns crate we're using only supports browsing/discovery,
    /// not announcing/advertising. For a production system, we'd need to use
    /// a different crate or implement mDNS announcing ourselves.
    /// For now, this just stores the peer info for potential future use.
    pub fn announce(&mut self, peer: &Peer) -> Result<(), Error> {
        self.self_peer = Some(peer.clone());

        tracing::info!("Would announce {} as leader candidate (mDNS announcing not yet implemented)", peer.display_name);
        Ok(())
    }

    /// Browse for existing leaders
    pub fn browse_for_leaders(&self) -> Result<Vec<DiscoveredLeader>, Error> {
        // Use tokio runtime for async discovery
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|e| Error::Io(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create runtime: {}", e))))?;

        let leaders = runtime.block_on(async {
            self.discover_leaders_async().await
        })?;

        Ok(leaders)
    }

    /// Stop announcing
    pub fn stop_announcing(&self) -> Result<(), Error> {
        if let Some(peer) = &self.self_peer {
            tracing::info!("Stopped announcing {}", peer.display_name);
        }
        Ok(())
    }

    /// Async discovery implementation
    async fn discover_leaders_async(&self) -> Result<Vec<DiscoveredLeader>, Error> {
        let stream = mdns::discover::all(SERVICE_NAME, Duration::from_secs(5))?.listen();
        pin_mut!(stream);

        let mut leaders = Vec::new();
        let timeout = tokio::time::sleep(DISCOVERY_TIMEOUT);
        pin_mut!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => {
                    break;
                }
                result = stream.next() => {
                    match result {
                        Some(Ok(response)) => {
                            if let Some(leader) = parse_leader_from_response(&response) {
                                // Avoid duplicates
                                if !leaders.iter().any(|l: &DiscoveredLeader| l.peer_id == leader.peer_id) {
                                    tracing::info!("Discovered leader: {} ({})", leader.display_name, leader.peer_id);
                                    leaders.push(leader);
                                }
                            }
                        }
                        Some(Err(e)) => {
                            tracing::warn!("mDNS discovery error: {:?}", e);
                        }
                        None => {
                            break;
                        }
                    }
                }
            }
        }

        Ok(leaders)
    }
}

/// Parse leader info from mDNS response
fn parse_leader_from_response(response: &mdns::Response) -> Option<DiscoveredLeader> {
    // Collect TXT records from the response
    let mut props = HashMap::new();

    for record in response.records() {
        if let RecordKind::TXT(ref txt_vec) = record.kind {
            for txt_entry in txt_vec {
                if let Some((key, val)) = txt_entry.split_once('=') {
                    props.insert(key.to_string(), val.to_string());
                }
            }
        }
    }

    // Extract peer_id
    let peer_id = props.get("peer_id")
        .and_then(|s| Uuid::parse_str(s).ok())?;

    // Extract display_name
    let display_name = props.get("display_name")
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string());

    // Extract peer_type
    let peer_type = match props.get("peer_type").map(|s| s.as_str()) {
        Some("controller") => PeerType::Controller,
        Some("display") | _ => PeerType::Display,
    };

    // Extract priority
    let priority_type = props.get("priority_type")
        .and_then(|s| s.parse::<u8>().ok())
        .unwrap_or(1);

    let priority_time = props.get("priority_time")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Some(DiscoveredLeader {
        peer_id,
        display_name,
        peer_type,
        priority: (priority_type, priority_time),
    })
}
