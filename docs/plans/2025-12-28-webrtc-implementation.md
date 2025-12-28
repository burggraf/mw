# WebRTC Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement WebRTC peer-to-peer communication layer with leader election for local-network live control

**Architecture:**
- Each Tauri app runs mDNS discovery to find existing leader
- Leader election uses bully algorithm (priority = device type + startup time)
- Leader runs WebSocket signaling server (port 3010)
- Peers establish direct WebRTC data channels for P2P messaging
- Frontend communicates via Tauri commands/events

**Tech Stack:** Rust, webrtc-rs, tokio-tungstenite, mdns crate, Tauri 2.0

---

## Prerequisites

Read these documents before starting:
- `docs/plans/2025-12-28-webrtc-design.md` - Full architecture spec
- `docs/plans/milestone-0-webrtc-foundation.md` - Milestone overview

---

## Task 1: Add Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add WebRTC dependencies to Cargo.toml**

Add to `[dependencies]` section:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# WebRTC dependencies
webrtc = "0.11"
tokio-tungstenite = "0.24"
mdns = "3.0"
uuid = { version = "1", features = ["v4", "serde"] }
tokio = { version = "1", features = ["full"] }
futures-util = "0.3"
```

**Step 2: Verify dependencies compile**

Run: `cd src-tauri && cargo check`

Expected: No errors, dependencies resolve successfully

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat: add WebRTC dependencies"
```

---

## Task 2: Create WebRTC Module Structure

**Files:**
- Create: `src-tauri/src/webrtc/mod.rs`
- Create: `src-tauri/src/webrtc/types.rs`
- Create: `src-tauri/src/webrtc/peer.rs`
- Create: `src-tauri/src/webrtc/discovery.rs`
- Create: `src-tauri/src/webrtc/election.rs`
- Create: `src-tauri/src/webrtc/signaling.rs`
- Create: `src-tauri/src/webrtc/channel.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create webrtc/mod.rs**

Create `src-tauri/src/webrtc/mod.rs`:

```rust
mod types;
mod peer;
mod discovery;
mod election;
mod signaling;
mod channel;

pub use types::*;
pub use peer::Peer;
```

**Step 2: Create webrtc/types.rs**

Create `src-tauri/src/webrtc/types.rs`:

```rust
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
    pub id: Uuid,
    pub peer_type: PeerType,
    pub display_name: String,
    pub is_connected: bool,
    pub is_leader: bool,
}

/// Leader status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderStatus {
    pub leader_id: Option<Uuid>,
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
    #[serde(rename = "ice")]
    IceCandidate {
        from_peer_id: Uuid,
        to_peer_id: Uuid,
        candidate: String,
    },
    #[serde(rename = "peer_list")]
    PeerList { peers: Vec<PeerInfo> },
    #[serde(rename = "heartbeat")]
    Heartbeat { peer_id: Uuid },
}

/// Data channel message types (WebRTC)
pub type DataChannelMessage = String;

/// Priority for leader election
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Priority {
    pub device_type_score: u8,  // Controller=2, Display=1
    pub startup_time_ms: u64,   // Lower is better (earlier startup)
}
```

**Step 3: Create stub files for remaining modules**

Create `src-tauri/src/webrtc/peer.rs`:

```rust
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
```

Create `src-tauri/src/webrtc/discovery.rs`:

```rust
// mDNS discovery implementation placeholder
pub struct DiscoveryService {
    // TODO: Implement mDNS discovery
}

impl DiscoveryService {
    pub fn new() -> Self {
        Self {}
    }
}
```

Create `src-tauri/src/webrtc/election.rs`:

```rust
// Leader election implementation placeholder
pub struct ElectionService {
    // TODO: Implement leader election
}

impl ElectionService {
    pub fn new() -> Self {
        Self {}
    }
}
```

Create `src-tauri/src/webrtc/signaling.rs`:

```rust
// WebSocket signaling server implementation placeholder
pub struct SignalingServer {
    // TODO: Implement signaling server
}

impl SignalingServer {
    pub fn new() -> Self {
        Self {}
    }
}
```

Create `src-tauri/src/webrtc/channel.rs`:

```rust
// WebRTC data channel implementation placeholder
pub struct DataChannelManager {
    // TODO: Implement data channel management
}

impl DataChannelManager {
    pub fn new() -> Self {
        Self {}
    }
}
```

**Step 4: Update lib.rs to include webrtc module**

Modify `src-tauri/src/lib.rs`:

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod webrtc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Verify code compiles**

Run: `cd src-tauri && cargo check`

Expected: No errors

**Step 6: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: create WebRTC module structure with types"
```

---

## Task 3: Implement Priority Calculation for Leader Election

**Files:**
- Modify: `src-tauri/src/webrtc/election.rs`
- Modify: `src-tauri/src/webrtc/types.rs`

**Step 1: Add startup time tracking to Peer**

Modify `src-tauri/src/webrtc/peer.rs`:

```rust
use crate::webrtc::types::{PeerInfo, PeerType, Priority};
use std::time::{SystemTime, UNIX_EPOCH};

/// Represents a peer in the WebRTC network
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
```

**Step 2: Add unit test for priority calculation**

Create `src-tauri/src/webrtc/election_test.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::webrtc::{Peer, PeerType};
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_controller_has_higher_priority_than_display() {
        let controller = Peer::new(PeerType::Controller, "Controller".to_string());
        let display = Peer::new(PeerType::Display, "Display".to_string());

        assert!(controller.priority() > display.priority());
    }

    #[test]
    fn test_earlier_startup_has_higher_priority() {
        let peer1 = Peer::new(PeerType::Controller, "Peer1".to_string());
        thread::sleep(Duration::from_millis(10));
        let peer2 = Peer::new(PeerType::Controller, "Peer2".to_string());

        assert!(peer1.priority() > peer2.priority());
    }

    #[test]
    fn test_priority_ordering() {
        let p1 = Peer::new(PeerType::Display, "Display".to_string());
        thread::sleep(Duration::from_millis(10));
        let p2 = Peer::new(PeerType::Controller, "Controller".to_string());

        assert!(p2.priority() > p1.priority());
    }
}
```

**Step 3: Update election.rs with tests module**

Modify `src-tauri/src/webrtc/election.rs`:

```rust
#[cfg(test)]
mod tests;

// Leader election implementation placeholder
pub struct ElectionService {
    // TODO: Implement leader election
}

impl ElectionService {
    pub fn new() -> Self {
        Self {}
    }
}
```

**Step 4: Run tests**

Run: `cd src-tauri && cargo test election::tests -- --nocapture`

Expected: All 3 tests pass

**Step 5: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: implement priority calculation with tests"
```

---

## Task 4: Implement mDNS Discovery

**Files:**
- Modify: `src-tauri/src/webrtc/discovery.rs`
- Create: `src-tauri/src/webrtc/discovery_test.rs`

**Step 1: Implement mDNS discovery service**

Modify `src-tauri/src/webrtc/discovery.rs`:

```rust
use crate::webrtc::{Peer, PeerType};
use mdns::::{Error, Recorder, ServiceDaemon};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

const SERVICE_NAME: &str = "_mobile-worship._tcp.local";
const BROWSER_TIMEOUT: Duration = Duration::from_secs(3);

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
    daemon: ServiceDaemon,
    self_peer: Option<Peer>,
}

impl DiscoveryService {
    pub fn new() -> Result<Self, Error> {
        Ok(Self {
            daemon: ServiceDaemon::new()?,
            self_peer: None,
        })
    }

    /// Start announcing this peer as a potential leader
    pub fn announce(&mut self, peer: &Peer) -> Result<(), Error> {
        self.self_peer = Some(peer.clone());

        let priority = peer.priority();
        let peer_type_str = match peer.peer_type {
            PeerType::Controller => "controller",
            PeerType::Display => "display",
        };

        // Create TXT record with peer info
        let txt_vars = vec![
            format!("peer_id={}", peer.id),
            format!("display_name={}", peer.display_name),
            format!("peer_type={}", peer_type_str),
            format!("priority_type={}", priority.device_type_score),
            format!("priority_time={}", priority.startup_time_ms),
        ];

        self.daemon.start(
            SERVICE_NAME,
            port3010(), // Default port
            &txt_vars,
        )?;

        tracing::info!("Announcing {} as leader candidate", peer.display_name);
        Ok(())
    }

    /// Browse for existing leaders
    pub fn browse_for_leaders(&self) -> Result<Vec<DiscoveredLeader>, Error> {
        let mut recorder = Recorder::new();
        let receiver = self.daemon.browse(SERVICE_NAME, &mut recorder)?;

        // Wait for responses
        std::thread::sleep(BROWSER_TIMEOUT);

        let leaders: Vec<DiscoveredLeader> = recorder
            .get_records()
            .iter()
            .filter_map(|(name, values)| {
                parse_leader_from_mdns(name, values).ok()
            })
            .collect();

        Ok(leaders)
    }

    /// Stop announcing
    pub fn stop_announcing(&self) -> Result<(), Error> {
        if let Some(peer) = &self.self_peer {
            self.daemon.stop(SERVICE_NAME)?;
            tracing::info!("Stopped announcing {}", peer.display_name);
        }
        Ok(())
    }
}

fn port3010() -> u16 {
    3010
}

/// Parse leader info from mDNS record
fn parse_leader_from_mdns(
    _name: &str,
    values: &[String],
) -> Result<DiscoveredLeader, Box<dyn std::error::Error>> {
    let mut props = HashMap::new();
    for value in values {
        if let Some((key, val)) = value.split_once('=') {
            props.insert(key, val);
        }
    }

    let peer_id = props.get("peer_id")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or("Missing or invalid peer_id")?;

    let display_name = props.get("display_name")
        .unwrap_or(&"Unknown".to_string())
        .to_string();

    let peer_type = match props.get("peer_type").map(|s| s.as_str()) {
        Some("controller") => PeerType::Controller,
        Some("display") => PeerType::Display,
        _ => PeerType::Display, // Default
    };

    let priority_type = props.get("priority_type")
        .and_then(|s| s.parse::<u8>().ok())
        .unwrap_or(1);

    let priority_time = props.get("priority_time")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(DiscoveredLeader {
        peer_id,
        display_name,
        peer_type,
        priority: (priority_type, priority_time),
    })
}
```

**Step 2: Update mod.rs to export discovery types**

Modify `src-tauri/src/webrtc/mod.rs`:

```rust
mod types;
mod peer;
mod discovery;
mod election;
mod signaling;
mod channel;

pub use types::*;
pub use peer::Peer;
pub use discovery::{DiscoveryService, DiscoveredLeader};
```

**Step 3: Verify code compiles**

Run: `cd src-tauri && cargo check`

Expected: No errors (mdns crate may need verification)

**Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: implement mDNS discovery service"
```

---

## Task 5: Implement Leader Election Logic

**Files:**
- Modify: `src-tauri/src/webrtc/election.rs`
- Modify: `src-tauri/src/webrtc/mod.rs`

**Step 1: Implement election service**

Modify `src-tauri/src/webrtc/election.rs`:

```rust
use crate::webrtc::{DiscoveryService, Peer, PeerType};
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
        let discovered_leaders = discovery.browse_for_leaders().unwrap_or_default();
        drop(discovery);

        let self_peer = self.self_peer.lock().await;
        let peer = self_peer.as_ref().ok_or("Peer not set")?;
        let self_priority = peer.priority();

        // Check if we have the highest priority
        let mut is_leader = true;
        let mut leader_id = None;

        for other in &discovered_leaders {
            let other_priority = (
                other.priority.0,
                other.priority.1,
            );

            // Compare priorities
            if other_priority > (self_priority.device_type_score, self_priority.startup_time_ms) {
                is_leader = false;
                leader_id = Some(other.peer_id);
            } else if other_priority == (self_priority.device_type_score, self_priority.startup_time_ms) {
                // Tie-breaker: use UUID comparison (deterministic)
                if other.peer_id > peer.id {
                    is_leader = false;
                    leader_id = Some(other.peer_id);
                }
            }
        }

        if discovered_leaders.is_empty() {
            return Ok(ElectionResult::NoPeers);
        }

        let result = if is_leader {
            *self.current_leader.lock().await = Some(peer.id);
            Ok(ElectionResult::BecameLeader)
        } else {
            *self.current_leader.lock().await = leader_id;
            Ok(ElectionResult::Follower { leader_id: leader_id.unwrap() })
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
```

**Step 2: Update mod.rs exports**

Modify `src-tauri/src/webrtc/mod.rs`:

```rust
mod types;
mod peer;
mod discovery;
mod election;
mod signaling;
mod channel;

pub use types::*;
pub use peer::Peer;
pub use discovery::{DiscoveryService, DiscoveredLeader};
pub use election::{ElectionService, ElectionResult};
```

**Step 3: Verify code compiles**

Run: `cd src-tauri && cargo check`

Expected: No errors

**Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: implement leader election logic"
```

---

## Task 6: Implement WebSocket Signaling Server

**Files:**
- Modify: `src-tauri/src/webrtc/signaling.rs`
- Modify: `src-tauri/src/webrtc/mod.rs`

**Step 1: Implement signaling server**

Modify `src-tauri/src/webrtc/signaling.rs`:

```rust
use crate::webrtc::{PeerInfo, SignalingMessage};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;
use uuid::Uuid;

/// Connected client in the signaling server
struct ConnectedClient {
    peer_id: Uuid,
    sender: mpsc::UnboundedSender<Message>,
    peer_info: PeerInfo,
}

/// WebSocket signaling server
pub struct SignalingServer {
    clients: Arc<RwLock<HashMap<Uuid, ConnectedClient>>>,
    running: Arc<Mutex<bool>>,
}

impl SignalingServer {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Start the signaling server on the given port
    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr).await?;
        tracing::info!("Signaling server listening on {}", addr);

        *self.running.lock().await = true;

        let clients = self.clients.clone();
        let running = self.running.clone();

        tokio::spawn(async move {
            while *running.lock().await {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let clients = clients.clone();
                        tokio::spawn(async move {
                            Self::handle_connection(stream, addr, clients).await;
                        });
                    }
                    Err(e) => {
                        tracing::error!("Error accepting connection: {}", e);
                    }
                }
            }
        });

        Ok(())
    }

    /// Stop the signaling server
    pub async fn stop(&self) {
        *self.running.lock().await = false;
    }

    /// Broadcast a message to all connected clients
    pub async fn broadcast(&self, message: SignalingMessage) {
        let msg_json = serde_json::to_string(&message).unwrap();
        let clients = self.clients.read().await;

        for client in clients.values() {
            let _ = client.sender.send(Message::Text(msg_json.clone()));
        }
    }

    /// Send a message to a specific peer
    pub async fn send_to(&self, peer_id: Uuid, message: SignalingMessage) {
        let msg_json = serde_json::to_string(&message).unwrap();
        let clients = self.clients.read().await;

        if let Some(client) = clients.get(&peer_id) {
            let _ = client.sender.send(Message::Text(msg_json));
        }
    }

    /// Get all connected peers
    pub async fn get_peers(&self) -> Vec<PeerInfo> {
        let clients = self.clients.read().await;
        clients.values().map(|c| c.peer_info.clone()).collect()
    }

    /// Handle a new WebSocket connection
    async fn handle_connection(
        stream: TcpStream,
        addr: SocketAddr,
        clients: Arc<RwLock<HashMap<Uuid, ConnectedClient>>>,
    ) {
        let ws_stream = match tokio_tungstenite::accept_async(stream).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Error during WebSocket handshake: {}", e);
                return;
            }
        };

        tracing::info!("New WebSocket connection from {}", addr);

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

        // Task to forward messages from channel to WebSocket
        let clients_clone = clients.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Handle incoming messages
        let mut peer_id: Option<Uuid> = None;

        while let Some(msg_result) = ws_receiver.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    if let Ok(signaling_msg) = serde_json::from_str::<SignalingMessage>(&text) {
                        match signaling_msg {
                            SignalingMessage::Register { peer_id: pid, peer_type, display_name, .. } => {
                                tracing::info!("Registered: {} ({})", display_name, peer_type);

                                let info = PeerInfo {
                                    id: pid,
                                    peer_type,
                                    display_name: display_name.clone(),
                                    is_connected: true,
                                    is_leader: false,
                                };

                                let client = ConnectedClient {
                                    peer_id: pid,
                                    sender: tx.clone(),
                                    peer_info: info.clone(),
                                };

                                clients.write().await.insert(pid, client);
                                peer_id = Some(pid);

                                // Send current peer list to all clients
                                Self::broadcast_peer_list(&clients).await;
                            }
                            SignalingMessage::Offer { to_peer_id, .. } => {
                                if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::Answer { to_peer_id, .. } => {
                                if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::IceCandidate { to_peer_id, .. } => {
                                if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::Heartbeat { .. } => {
                                // Heartbeat received, connection is alive
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        // Client disconnected
        if let Some(pid) = peer_id {
            tracing::info!("Client {} disconnected", pid);
            clients.write().await.remove(&pid);
            Self::broadcast_peer_list(&clients).await;
        }
    }

    /// Broadcast updated peer list to all clients
    async fn broadcast_peer_list(clients: &Arc<RwLock<HashMap<Uuid, ConnectedClient>>>) {
        let peer_list: Vec<PeerInfo> = clients
            .read()
            .await
            .values()
            .map(|c| c.peer_info.clone())
            .collect();

        let msg = SignalingMessage::PeerList { peers: peer_list };
        let msg_json = serde_json::to_string(&msg).unwrap();

        for client in clients.read().await.values() {
            let _ = client.sender.send(Message::Text(msg_json.clone()));
        }
    }
}
```

**Step 2: Update mod.rs**

Modify `src-tauri/src/webrtc/mod.rs`:

```rust
mod types;
mod peer;
mod discovery;
mod election;
mod signaling;
mod channel;

pub use types::*;
pub use peer::Peer;
pub use discovery::{DiscoveryService, DiscoveredLeader};
pub use election::{ElectionService, ElectionResult};
pub use signaling::SignalingServer;
```

**Step 3: Verify code compiles**

Run: `cd src-tauri && cargo check`

Expected: No errors

**Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: implement WebSocket signaling server"
```

---

## Task 7: Integrate Tauri Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands.rs`

**Step 1: Create commands module**

Create `src-tauri/src/commands.rs`:

```rust
use crate::webrtc::{Peer, PeerType};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Global WebRTC state
pub struct WebrtcState {
    pub peer: Arc<Mutex<Option<Peer>>>,
    pub is_running: Arc<Mutex<bool>>,
}

impl WebrtcState {
    pub fn new() -> Self {
        Self {
            peer: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }
}

/// Start the WebRTC peer
#[tauri::command]
pub async fn start_peer(
    peer_type: PeerType,
    display_name: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let peer = Peer::new(peer_type, display_name);
    let peer_id = peer.id.to_string();

    // TODO: Initialize discovery, election, and signaling
    // For now, just store the peer
    let state = app_handle.state::<WebrtcState>();
    *state.peer.lock().await = Some(peer.clone());

    tracing::info!("Started peer: {} ({:?})", peer.display_name, peer.peer_type);

    // Emit event
    let _ = app_handle.emit("webrtc:started", peer_id.clone());

    Ok(peer_id)
}

/// Send a control message to a peer
#[tauri::command]
pub async fn send_control_message(
    target_peer_id: String,
    message: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // TODO: Implement actual data channel sending
    tracing::info!("Sending message to {}: {}", target_peer_id, message);
    Ok(())
}

/// Get all connected peers
#[tauri::command]
pub async fn get_connected_peers(app_handle: AppHandle) -> Result<Vec<crate::webrtc::PeerInfo>, String> {
    // TODO: Return actual connected peers
    Ok(vec![])
}

/// Get leader status
#[tauri::command]
pub async fn get_leader_status(app_handle: AppHandle) -> Result<crate::webrtc::LeaderStatus, String> {
    // TODO: Return actual leader status
    Ok(crate::webrtc::LeaderStatus {
        leader_id: None,
        am_i_leader: false,
        peer_count: 0,
    })
}
```

**Step 2: Update lib.rs with commands and state**

Modify `src-tauri/src/lib.rs`:

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod webrtc;

use commands::WebrtcState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WebrtcState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_peer,
            commands::send_control_message,
            commands::get_connected_peers,
            commands::get_leader_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify code compiles**

Run: `cd src-tauri && cargo check`

Expected: No errors

**Step 4: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: add Tauri commands for WebRTC"
```

---

## Task 8: Create Frontend Hook

**Files:**
- Create: `src/hooks/useWebRTC.ts`
- Create: `src/hooks/useWebRTC.test.ts`

**Step 1: Create useWebRTC hook**

Create `src/hooks/useWebRTC.ts`:

```typescript
import { invoke, type EventEmitter } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback } from 'react';
import type { PeerType } from '@/types/live';

export interface PeerInfo {
  id: string;
  peerType: 'controller' | 'display';
  displayName: string;
  isConnected: boolean;
  isLeader: boolean;
}

export interface LeaderStatus {
  leaderId: string | null;
  amILeader: boolean;
  peerCount: number;
}

export interface UseWebRTCReturn {
  // State
  peers: PeerInfo[];
  leaderStatus: LeaderStatus;
  isConnected: boolean;
  myPeerId: string | null;
  isLeader: boolean;

  // Actions
  startPeer: (peerType: PeerType, displayName: string) => Promise<string>;
  sendMessage: (targetPeerId: string, message: string) => Promise<void>;

  // Connection status
  connectionState: 'disconnected' | 'discovering' | 'connected' | 'error';
  error: string | null;
}

export function useWebRTC(): UseWebRTCReturn {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [leaderStatus, setLeaderStatus] = useState<LeaderStatus>({
    leaderId: null,
    amILeader: false,
    peerCount: 0,
  });
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'discovering' | 'connected' | 'error'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectionState === 'connected';
  const isLeader = leaderStatus.amILeader;

  // Start peer
  const startPeer = useCallback(async (peerType: PeerType, displayName: string) => {
    try {
      setConnectionState('discovering');
      setError(null);

      const peerId = await invoke<string>('start_peer', {
        peerType,
        displayName,
      });

      setMyPeerId(peerId);
      setConnectionState('connected');
      return peerId;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setConnectionState('error');
      throw e;
    }
  }, []);

  // Send message
  const sendMessage = useCallback(async (targetPeerId: string, message: string) => {
    try {
      await invoke('send_control_message', {
        targetPeerId,
        message,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  // Listen for peer list changes
  useEffect(() => {
    const unbind = listen<PeerInfo[]>('webrtc:peer_list_changed', (event) => {
      setPeers(event.payload);
    });

    return () => {
      unbind.then(fn => fn());
    };
  }, []);

  // Listen for leader changes
  useEffect(() => {
    const unbind = listen<string>('webrtc:leader_changed', (event) => {
      setLeaderStatus(prev => ({
        ...prev,
        leaderId: event.payload,
        amILeader: event.payload === myPeerId,
      }));
    });

    return () => {
      unbind.then(fn => fn());
    };
  }, [myPeerId]);

  // Poll for leader status
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(async () => {
      try {
        const status = await invoke<LeaderStatus>('get_leader_status');
        setLeaderStatus(status);
      } catch (e) {
        // Ignore polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    peers,
    leaderStatus,
    isConnected,
    myPeerId,
    isLeader,
    startPeer,
    sendMessage,
    connectionState,
    error,
  };
}
```

**Step 2: Update live.ts types**

Modify `src/types/live.ts`:

```typescript
// Live state managed by operator
export interface LiveState {
  eventId: string
  currentItemId: string | null
  currentSlideIndex: number
  isBlack: boolean
}

// Individual slide for rendering
export interface Slide {
  text: string
  sectionLabel?: string
  backgroundId?: string
}

// Broadcast message types
export type BroadcastMessage =
  | { type: 'slide'; eventId: string; itemId: string; slideIndex: number }
  | { type: 'black'; eventId: string; isBlack: boolean }

// Display class for future use
export type DisplayClass = 'audience' | 'stage' | 'lobby'

// Display component props
export interface DisplayProps {
  eventId: string
  displayClass?: DisplayClass
}

// Peer type for WebRTC
export type PeerType = 'controller' | 'display'
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add useWebRTC hook for frontend"
```

---

## Task 9: Create Test UI Component

**Files:**
- Create: `src/components/webrtc/WebRTCDebugPanel.tsx`

**Step 1: Create debug panel component**

Create `src/components/webrtc/WebRTCDebugPanel.tsx`:

```typescript
import { useState } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import type { PeerType } from '@/types/live';

export function WebRTCDebugPanel() {
  const {
    peers,
    leaderStatus,
    isConnected,
    myPeerId,
    isLeader,
    startPeer,
    connectionState,
    error,
  } = useWebRTC();

  const [peerType, setPeerType] = useState<PeerType>('controller');
  const [displayName, setDisplayName] = useState('Test Device');

  const handleStart = async () => {
    try {
      await startPeer(peerType, displayName);
    } catch (e) {
      console.error('Failed to start peer:', e);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card">
      <h2 className="text-lg font-semibold mb-4">WebRTC Debug Panel</h2>

      {/* Connection Status */}
      <div className="mb-4 p-2 bg-muted rounded">
        <div className="text-sm font-medium">Connection State: {connectionState}</div>
        {isConnected && (
          <>
            <div className="text-sm">My Peer ID: {myPeerId}</div>
            <div className="text-sm">Is Leader: {isLeader ? 'Yes' : 'No'}</div>
            <div className="text-sm">Leader ID: {leaderStatus.leaderId || 'None'}</div>
            <div className="text-sm">Peer Count: {leaderStatus.peerCount}</div>
          </>
        )}
        {error && <div className="text-sm text-destructive">Error: {error}</div>}
      </div>

      {/* Start Controls */}
      {!isConnected && (
        <div className="mb-4 space-y-2">
          <select
            value={peerType}
            onChange={(e) => setPeerType(e.target.value as PeerType)}
            className="w-full p-2 border rounded"
          >
            <option value="controller">Controller</option>
            <option value="display">Display</option>
          </select>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display Name"
            className="w-full p-2 border rounded"
          />
          <button
            onClick={handleStart}
            className="w-full p-2 bg-primary text-primary-foreground rounded"
          >
            Start Peer
          </button>
        </div>
      )}

      {/* Peer List */}
      <div>
        <h3 className="text-md font-semibold mb-2">Connected Peers</h3>
        {peers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No peers connected</p>
        ) : (
          <ul className="space-y-1">
            {peers.map((peer) => (
              <li
                key={peer.id}
                className={`text-sm p-2 rounded ${
                  peer.id === myPeerId ? 'bg-accent' : 'bg-muted'
                }`}
              >
                <div className="font-medium">{peer.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {peer.peerType} {peer.isLeader && '(Leader)'}
                </div>
                <div className="text-xs">
                  Status: {peer.isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create webrtc components index**

Create `src/components/webrtc/index.ts`:

```typescript
export { WebRTCDebugPanel } from './WebRTCDebugPanel';
```

**Step 3: Add debug route**

Create `src/routes/webrtc-debug.tsx`:

```typescript
import { WebRTCDebugPanel } from '@/components/webrtc';

export default function WebRTCDebugPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">WebRTC Debug</h1>
      <WebRTCDebugPanel />
    </div>
  );
}
```

**Step 4: Update router to include debug route**

Modify your router configuration (location varies, find where routes are defined):

Add the debug route:
```typescript
import WebRTCDebugPage from '@/routes/webrtc-debug';

// In your routes configuration:
<Route path="/webrtc-debug" element={<WebRTCDebugPage />} />
```

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: add WebRTC debug UI component"
```

---

## Task 10: Manual Testing

**Step 1: Build and run the app**

Run: `pnpm tauri:dev`

Expected: App opens in development mode

**Step 2: Navigate to debug page**

Open browser to: `http://localhost:1420/webrtc-debug` (or your Tauri dev port)

Expected: Debug panel displays

**Step 3: Test single peer**

1. Enter display name "Test Controller"
2. Select "Controller" as peer type
3. Click "Start Peer"

Expected:
- Connection state changes to "connected"
- Peer ID is displayed
- Is Leader shows "Yes" (first peer becomes leader)
- Peer count shows 1

**Step 4: Test two peers**

1. Open a second instance of the app (different terminal or separate window)
2. Navigate to `/webrtc-debug`
3. Enter display name "Test Display"
4. Select "Display" as peer type
5. Click "Start Peer"

Expected:
- Second peer connects
- First peer remains leader (controller priority)
- Both peers show peer count of 2
- Leader ID is the same on both

**Step 5: Test peer discovery**

Check console logs for:
- mDNS announcements
- Peer discovery messages
- Signaling server startup

Expected: Logs show discovery and connection process

**Step 6: Document results**

Create test results file if issues found, or proceed if tests pass:

```bash
echo "Manual testing completed: $(date)" >> docs/plans/webrtc-test-results.txt
```

---

## Completion Checklist

- [ ] All tasks completed
- [ ] Code compiles without errors (`cargo check` + `pnpm tsc`)
- [ ] Manual testing successful
- [ ] Documentation updated

## Known Limitations (MVP)

- No WebRTC data channel implementation yet (signaling only)
- No reconnection logic on leader failure
- No TURN/STUN servers (local network only)
- iOS platform not yet tested

## Next Steps After MVP

1. Implement WebRTC data channels for P2P messaging
2. Add reconnection and failure recovery
3. Implement live control messages on top of data channels
4. Test on iOS platform
5. Add state persistence and sync

---

## References

- [WebRTC Design](./2025-12-28-webrtc-design.md)
- [Milestone 0](./milestone-0-webrtc-foundation.md)
- [webrtc-rs documentation](https://github.com/webrtc-rs/webrtc)
- [Tauri 2.0 docs](https://v2.tauri.app/)
