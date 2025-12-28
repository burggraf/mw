use crate::webrtc::{DiscoveryService, Peer};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Leader election result
#[derive(Debug, Clone)]
pub enum ElectionResult {
    BecameLeader,
    Follower { leader_id: Uuid },
    NoPeers,
}

/// Leader election service
pub struct ElectionService {
    discovery: Arc<Mutex<DiscoveryService>>,
    self_peer: Arc<Mutex<Option<Peer>>>,
    current_leader: Arc<Mutex<Option<Uuid>>>,
}

impl ElectionService {
    pub fn new(discovery: DiscoveryService) -> Self {
        Self {
            discovery: Arc::new(Mutex::new(discovery)),
            self_peer: Arc::new(Mutex::new(None)),
            current_leader: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the peer for this device
    pub async fn set_peer(&self, peer: Peer) {
        let mut self_peer = self.self_peer.lock().await;
        *self_peer = Some(peer);
    }

    /// Run leader election
    pub async fn elect_leader(&self) -> Result<ElectionResult, Box<dyn std::error::Error>> {
        let discovery = self.discovery.lock().await;
        let discovered_leaders = discovery.browse_for_leaders().await.unwrap_or_default();
        drop(discovery);

        let self_peer = self.self_peer.lock().await;
        let peer = self_peer.as_ref().ok_or("Peer not set")?;
        let self_priority = peer.priority();

        // If no other peers, we become leader
        if discovered_leaders.is_empty() {
            *self.current_leader.lock().await = Some(peer.id);
            return Ok(ElectionResult::BecameLeader);
        }

        // Find the highest priority peer among all (self + discovered)
        let mut highest_priority = self_priority;
        let mut highest_peer_id = peer.id;

        for other in &discovered_leaders {
            let other_priority = crate::webrtc::types::Priority {
                device_type_score: other.priority.0,
                startup_time_ms: other.priority.1,
            };

            if other_priority > highest_priority {
                highest_priority = other_priority;
                highest_peer_id = other.peer_id;
            } else if other_priority == highest_priority && other.peer_id > highest_peer_id {
                // Tiebreaker: higher UUID wins (deterministic)
                highest_peer_id = other.peer_id;
            }
        }

        let result = if highest_peer_id == peer.id {
            *self.current_leader.lock().await = Some(peer.id);
            Ok(ElectionResult::BecameLeader)
        } else {
            *self.current_leader.lock().await = Some(highest_peer_id);
            Ok(ElectionResult::Follower { leader_id: highest_peer_id })
        };

        result
    }

    /// Get the current leader ID
    pub async fn get_leader(&self) -> Option<Uuid> {
        *self.current_leader.lock().await
    }

    /// Check if we are the leader
    pub async fn am_i_leader(&self) -> bool {
        let self_peer = self.self_peer.lock().await;
        let leader = self.current_leader.lock().await;
        match (self_peer.as_ref(), leader.as_ref()) {
            (Some(peer), Some(leader_id)) => peer.id == *leader_id,
            _ => false,
        }
    }
}

#[cfg(test)]
#[path = "election_test.rs"]
mod tests;
