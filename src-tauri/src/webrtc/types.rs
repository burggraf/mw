use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Device type in the live control network
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PeerType {
    Controller,
    Display,
}

/// Display class for display-type peers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayClass {
    Audience,
    Stage,
    Lobby,
}

/// Peer information for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub id: String,
    pub peer_type: PeerType,
    pub display_name: String,
    pub is_connected: bool,
    pub is_leader: bool,
}

/// Leader status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderStatus {
    pub leader_id: Option<String>,
    pub am_i_leader: bool,
    pub peer_count: usize,
}

/// Signaling message types (WebSocket)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SignalingMessage {
    #[serde(rename = "register")]
    Register {
        peer_id: Uuid,
        peer_type: PeerType,
        display_name: String,
        display_class: Option<DisplayClass>,
        priority: Option<(u8, u64)>,
    },
    #[serde(rename = "offer")]
    Offer {
        from_peer_id: Uuid,
        to_peer_id: Uuid,
        sdp: String,
    },
    #[serde(rename = "answer")]
    Answer {
        from_peer_id: Uuid,
        to_peer_id: Uuid,
        sdp: String,
    },
    #[serde(rename = "ice_candidate")]
    IceCandidate {
        from_peer_id: Uuid,
        to_peer_id: Uuid,
        candidate: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sdp_mid: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        sdp_mline_index: Option<u16>,
    },
    #[serde(rename = "peer_list")]
    PeerList { peers: Vec<PeerInfo> },
    #[serde(rename = "heartbeat")]
    Heartbeat { peer_id: Uuid },
    /// Data message relayed through signaling (for MVP, replaces full WebRTC data channel)
    #[serde(rename = "data")]
    Data {
        from_peer_id: Uuid,
        to_peer_id: Uuid,
        message: String,
    },
}

/// Data channel message types (WebRTC)
pub type DataChannelMessage = String;

/// Priority for leader election
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Priority {
    pub device_type_score: u8,  // Controller=2, Display=1
    pub startup_time_ms: u64,   // Lower is better (earlier startup)
}

impl PartialOrd for Priority {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Priority {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // First compare by device_type_score (higher is better)
        match self.device_type_score.cmp(&other.device_type_score) {
            std::cmp::Ordering::Equal => {
                // If equal, compare by startup_time_ms (lower is better, so reverse)
                other.startup_time_ms.cmp(&self.startup_time_ms)
            }
            other => other,
        }
    }
}
