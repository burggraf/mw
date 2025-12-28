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

                                let info = PeerInfo {
                                    id: pid.to_string(),
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
