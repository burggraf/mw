use crate::webrtc::{PeerInfo, SignalingMessage};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

/// Connected client in the signaling server
struct ConnectedClient {
    peer_id: Uuid,
    sender: mpsc::UnboundedSender<Message>,
    peer_info: PeerInfo,
}

/// Callback type for handling incoming WebRTC signaling messages locally
pub type OnSignalingMessage = Arc<Mutex<Option<Box<dyn Fn(SignalingMessage) + Send + Sync>>>>;

/// WebSocket signaling server
pub struct SignalingServer {
    clients: Arc<RwLock<HashMap<Uuid, ConnectedClient>>>,
    running: Arc<Mutex<bool>>,
    leader_id: Arc<Mutex<Option<Uuid>>>,
    local_peer: Arc<Mutex<Option<PeerInfo>>>,
    local_peer_id: Arc<Mutex<Option<Uuid>>>,
    on_offer: OnSignalingMessage,
    on_answer: OnSignalingMessage,
    on_ice_candidate: OnSignalingMessage,
}

impl SignalingServer {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
            leader_id: Arc::new(Mutex::new(None)),
            local_peer: Arc::new(Mutex::new(None)),
            local_peer_id: Arc::new(Mutex::new(None)),
            on_offer: Arc::new(Mutex::new(None)),
            on_answer: Arc::new(Mutex::new(None)),
            on_ice_candidate: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the local peer ID (the Tauri app's peer ID)
    pub async fn set_local_peer_id(&self, peer_id: Uuid) {
        *self.local_peer_id.lock().await = Some(peer_id);
    }

    /// Set callback for handling incoming Offer messages
    pub async fn on_offer<F>(&self, callback: F)
    where
        F: Fn(SignalingMessage) + Send + Sync + 'static,
    {
        *self.on_offer.lock().await = Some(Box::new(callback));
    }

    /// Set callback for handling incoming Answer messages
    pub async fn on_answer<F>(&self, callback: F)
    where
        F: Fn(SignalingMessage) + Send + Sync + 'static,
    {
        *self.on_answer.lock().await = Some(Box::new(callback));
    }

    /// Set callback for handling incoming ICE candidates
    pub async fn on_ice_candidate<F>(&self, callback: F)
    where
        F: Fn(SignalingMessage) + Send + Sync + 'static,
    {
        *self.on_ice_candidate.lock().await = Some(Box::new(callback));
    }

    /// Set the local peer (Tauri app itself) that runs this server
    pub async fn set_local_peer(&self, peer_info: PeerInfo) {
        let leader_id = Uuid::parse_str(&peer_info.id).unwrap();
        *self.local_peer.lock().await = Some(peer_info);
        *self.leader_id.lock().await = Some(leader_id);
        Self::broadcast_peer_list(&self.clients, &self.local_peer).await;
    }

    /// Get the current leader ID
    pub async fn get_leader_id(&self) -> Option<Uuid> {
        *self.leader_id.lock().await
    }

    /// Start the signaling server on the given port
    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr).await?;
        tracing::info!("Signaling server listening on {}", addr);

        *self.running.lock().await = true;

        let clients = self.clients.clone();
        let running = self.running.clone();
        let local_peer = self.local_peer.clone();
        let local_peer_id = self.local_peer_id.clone();
        let on_offer = self.on_offer.clone();
        let on_answer = self.on_answer.clone();
        let on_ice_candidate = self.on_ice_candidate.clone();

        tokio::spawn(async move {
            while *running.lock().await {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let clients = clients.clone();
                        let local_peer = local_peer.clone();
                        let local_peer_id = local_peer_id.clone();
                        let on_offer = on_offer.clone();
                        let on_answer = on_answer.clone();
                        let on_ice_candidate = on_ice_candidate.clone();
                        tokio::spawn(async move {
                            Self::handle_connection(
                                stream,
                                addr,
                                clients,
                                local_peer,
                                local_peer_id,
                                on_offer,
                                on_answer,
                                on_ice_candidate,
                            )
                            .await;
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

    /// Get the full peer list (including local peer and all connected clients)
    pub async fn get_peer_list(&self) -> Vec<PeerInfo> {
        let mut peer_list: Vec<PeerInfo> = self.clients
            .read()
            .await
            .values()
            .map(|c| c.peer_info.clone())
            .collect();

        // Add local peer (Tauri app) to the list
        if let Some(ref local) = *self.local_peer.lock().await {
            peer_list.insert(0, local.clone());
        }

        peer_list
    }

    /// Get all connected peers
    pub async fn get_peers(&self) -> Vec<PeerInfo> {
        let clients = self.clients.read().await;
        clients.values().map(|c| c.peer_info.clone()).collect()
    }

    /// Send a data message to a specific peer (for Tauri -> browser communication)
    pub async fn send_data(&self, from_peer_id: Uuid, to_peer_id: Uuid, message: String) {
        let msg = SignalingMessage::Data {
            from_peer_id,
            to_peer_id,
            message,
        };
        self.send_to(to_peer_id, msg).await;
    }

    /// Send a signaling message from the local peer (leader) to a specific client
    /// This is used when the local peer's PeerConnectionManager needs to send offers/answers/ICE
    pub async fn send_message_as_local(&self, msg_json: String, to_peer_id: Uuid) {
        let clients = self.clients.read().await;
        if let Some(client) = clients.get(&to_peer_id) {
            let _ = client.sender.send(Message::Text(msg_json));
        }
    }

    /// Handle a new WebSocket connection
    async fn handle_connection(
        stream: TcpStream,
        addr: SocketAddr,
        clients: Arc<RwLock<HashMap<Uuid, ConnectedClient>>>,
        local_peer: Arc<Mutex<Option<PeerInfo>>>,
        local_peer_id: Arc<Mutex<Option<Uuid>>>,
        on_offer: OnSignalingMessage,
        on_answer: OnSignalingMessage,
        on_ice_candidate: OnSignalingMessage,
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
                                tracing::info!("Registered: {} ({:?})", display_name, peer_type);

                                // First peer becomes leader, but only if there's no local peer (Tauri app)
                                let has_local_peer = local_peer.lock().await.is_some();
                                let is_leader = clients.read().await.is_empty() && !has_local_peer;

                                let info = PeerInfo {
                                    id: pid.to_string(),
                                    peer_type,
                                    display_name: display_name.clone(),
                                    is_connected: true,
                                    is_leader,
                                };

                                let client = ConnectedClient {
                                    peer_id: pid,
                                    sender: tx.clone(),
                                    peer_info: info.clone(),
                                };

                                clients.write().await.insert(pid, client);
                                peer_id = Some(pid);

                                // Send current peer list to all clients
                                Self::broadcast_peer_list(&clients, &local_peer).await;
                            }
                            SignalingMessage::Offer { to_peer_id, .. } => {
                                // Check if this is for the local peer (Tauri app)
                                let local_id = *local_peer_id.lock().await;
                                if Some(to_peer_id) == local_id {
                                    // This is for us - invoke the callback
                                    if let Ok(msg) = serde_json::from_str::<SignalingMessage>(&text) {
                                        if let Some(ref cb) = *on_offer.lock().await {
                                            cb(msg);
                                        }
                                    }
                                } else if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::Answer { to_peer_id, .. } => {
                                // Check if this is for the local peer (Tauri app)
                                let local_id = *local_peer_id.lock().await;
                                if Some(to_peer_id) == local_id {
                                    // This is for us - invoke the callback
                                    if let Ok(msg) = serde_json::from_str::<SignalingMessage>(&text) {
                                        if let Some(ref cb) = *on_answer.lock().await {
                                            cb(msg);
                                        }
                                    }
                                } else if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::IceCandidate { to_peer_id, .. } => {
                                // Check if this is for the local peer (Tauri app)
                                let local_id = *local_peer_id.lock().await;
                                if Some(to_peer_id) == local_id {
                                    // This is for us - invoke the callback
                                    if let Ok(msg) = serde_json::from_str::<SignalingMessage>(&text) {
                                        if let Some(ref cb) = *on_ice_candidate.lock().await {
                                            cb(msg);
                                        }
                                    }
                                } else if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
                            }
                            SignalingMessage::Heartbeat { .. } => {
                                // Heartbeat received, connection is alive
                            }
                            SignalingMessage::Data { to_peer_id, .. } => {
                                // Relay data message to target peer
                                if let Some(target) = clients.read().await.get(&to_peer_id) {
                                    let _ = target.sender.send(Message::Text(text.clone()));
                                }
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
            Self::broadcast_peer_list(&clients, &local_peer).await;
        }
    }

    /// Broadcast updated peer list to all clients
    async fn broadcast_peer_list(
        clients: &Arc<RwLock<HashMap<Uuid, ConnectedClient>>>,
        local_peer: &Arc<Mutex<Option<PeerInfo>>>,
    ) {
        let mut peer_list: Vec<PeerInfo> = clients
            .read()
            .await
            .values()
            .map(|c| c.peer_info.clone())
            .collect();

        // Add local peer (Tauri app) to the list
        if let Some(ref local) = *local_peer.lock().await {
            peer_list.insert(0, local.clone());
        }

        let msg = SignalingMessage::PeerList { peers: peer_list };
        let msg_json = serde_json::to_string(&msg).unwrap();

        for client in clients.read().await.values() {
            let _ = client.sender.send(Message::Text(msg_json.clone()));
        }
    }
}
