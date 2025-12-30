use serde::{Deserialize, Serialize};

/// NATS configuration for spawning a server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatsConfig {
    /// Server port (0 = random port assigned by OS)
    pub server_port: u16,
    /// Cluster name for mesh networking
    pub cluster_name: String,
    /// Directory for JetStream persistence
    pub jetstream_dir: String,
}

impl Default for NatsConfig {
    fn default() -> Self {
        Self {
            server_port: 0, // 0 = random port
            cluster_name: "mobile_worship".to_string(),
            jetstream_dir: "./nats-jetstream".to_string(),
        }
    }
}

/// A discovered NATS node via mDNS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredNode {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub platform: String,
}

/// Lyrics message sent over NATS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsMessage {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub title: String,
    pub lyrics: String,
    pub background_url: Option<String>,
    pub timestamp: i64,
}

/// Slide update message sent over NATS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideMessage {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub slide_index: usize,
    pub timestamp: i64,
}

/// Display state for tracking connected displays
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayState {
    pub display_id: String,
    pub name: String,
    pub connected: bool,
    pub last_heartbeat: i64,
    pub current_slide: Option<SlideMessage>,
}

/// mDNS service name for NATS discovery
pub const NATS_SERVICE_NAME: &str = "_nats-cluster._tcp.local";
pub const DISCOVERY_TIMEOUT_SEC: u64 = 3;
