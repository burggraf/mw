use crate::webrtc::types::{PeerInfo, PeerType, Priority};
use std::time::{SystemTime, UNIX_EPOCH};

/// Represents a peer in the WebRTC network
#[derive(Clone)]
pub struct Peer {
    pub id: uuid::Uuid,
    pub peer_type: PeerType,
    pub display_name: String,
    pub is_leader: bool,
    pub startup_time_ms: u64,
}

impl Peer {
    pub fn new(peer_type: PeerType, display_name: String) -> Self {
        let startup_time_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            id: uuid::Uuid::new_v4(),
            peer_type,
            display_name,
            is_leader: false,
            startup_time_ms,
        }
    }

    pub fn priority(&self) -> Priority {
        let device_type_score = match self.peer_type {
            PeerType::Controller => 2,
            PeerType::Display => 1,
        };
        Priority {
            device_type_score,
            startup_time_ms: self.startup_time_ms,
        }
    }

    pub fn to_info(&self, is_connected: bool) -> PeerInfo {
        PeerInfo {
            id: self.id,
            peer_type: self.peer_type,
            display_name: self.display_name.clone(),
            is_connected,
            is_leader: self.is_leader,
        }
    }
}
