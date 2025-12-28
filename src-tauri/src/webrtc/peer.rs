use crate::webrtc::types::{PeerInfo, PeerType};

/// Represents a peer in the WebRTC network
pub struct Peer {
    pub id: uuid::Uuid,
    pub peer_type: PeerType,
    pub display_name: String,
    pub is_leader: bool,
}

impl Peer {
    pub fn new(peer_type: PeerType, display_name: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4(),
            peer_type,
            display_name,
            is_leader: false,
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
