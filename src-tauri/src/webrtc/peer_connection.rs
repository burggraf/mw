/// WebRTC Peer Connection Manager
///
/// Handles true P2P WebRTC connections using the webrtc-rs crate.
/// Manages peer connections, data channels, and ICE candidate exchange.

use crate::webrtc::types::{PeerInfo, PeerType, SignalingMessage};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

/// Callback for when a data channel message is received
pub type OnDataChannelMessage = Arc<Mutex<Option<Box<dyn Fn(String) + Send + Sync>>>>;

/// Callback for when a data channel opens
pub type OnDataChannelOpen = Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>;

/// Callback for when a data channel closes
pub type OnDataChannelClose = Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>;

/// Represents an active WebRTC peer connection
pub struct ActivePeerConnection {
    pub peer_id: Uuid,
    pub peer_info: PeerInfo,
    pub pc: Arc<webrtc::peer_connection::RTCPeerConnection>,
    pub data_channel: Option<Arc<webrtc::data_channel::RTCDataChannel>>,
}

/// WebRTC Peer Connection Manager
///
/// Manages true P2P WebRTC connections between Tauri apps.
pub struct PeerConnectionManager {
    /// Active peer connections
    connections: Arc<RwLock<Vec<ActivePeerConnection>>>,

    /// WebSocket sender for signaling (to send offers/answers/ICE)
    message_tx: Arc<Mutex<Option<mpsc::UnboundedSender<Message>>>>,

    /// My peer ID
    my_peer_id: Uuid,

    /// My peer type (controller or display)
    my_peer_type: PeerType,

    /// WebRTC API instance
    api: Arc<webrtc::api::API>,

    /// Callbacks for data channel events
    on_data_channel_message: OnDataChannelMessage,
    on_data_channel_open: OnDataChannelOpen,
    on_data_channel_close: OnDataChannelClose,
}

impl PeerConnectionManager {
    pub fn new(my_peer_id: Uuid, my_peer_type: PeerType) -> Self {
        // Create the WebRTC API
        let api = APIBuilder::new().build();

        Self {
            connections: Arc::new(RwLock::new(Vec::new())),
            message_tx: Arc::new(Mutex::new(None)),
            my_peer_id,
            my_peer_type,
            api: Arc::new(api),
            on_data_channel_message: Arc::new(Mutex::new(None)),
            on_data_channel_open: Arc::new(Mutex::new(None)),
            on_data_channel_close: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the WebSocket sender for signaling messages
    pub async fn set_message_tx(&self, tx: mpsc::UnboundedSender<Message>) {
        *self.message_tx.lock().await = Some(tx);
    }

    /// Set callback for data channel messages
    pub async fn set_on_data_channel_message(&self, callback: Box<dyn Fn(String) + Send + Sync>) {
        *self.on_data_channel_message.lock().await = Some(callback);
    }

    /// Set callback for when data channel opens
    pub async fn set_on_data_channel_open(&self, callback: Box<dyn Fn() + Send + Sync>) {
        *self.on_data_channel_open.lock().await = Some(callback);
    }

    /// Set callback for when data channel closes
    pub async fn set_on_data_channel_close(&self, callback: Box<dyn Fn() + Send + Sync>) {
        *self.on_data_channel_close.lock().await = Some(callback);
    }

    /// Create a new peer connection and initiate as controller
    /// Returns the SDP offer to send via signaling
    pub async fn create_offer_to(
        &self,
        peer_id: Uuid,
        peer_info: PeerInfo,
    ) -> Result<String, Box<dyn std::error::Error>> {
        tracing::info!("Creating offer to peer {} ({})", peer_id, peer_info.display_name);

        // Create RTCPeerConnection with STUN for NAT traversal
        // Using multiple public STUN servers for better connectivity
        let config = RTCConfiguration {
            ice_servers: vec![
                RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                },
                RTCIceServer {
                    urls: vec!["stun:stun1.l.google.com:19302".to_string()],
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let pc = Arc::new(self.api.new_peer_connection(config).await?);

        // Set up ICE candidate handler
        let tx_guard = self.message_tx.clone();
        let my_id = self.my_peer_id;
        let target_id = peer_id;

        pc.on_ice_candidate(Box::new(move |candidate| {
            if let Some(candidate) = candidate {
                let tx_guard = tx_guard.clone();
                tokio::spawn(async move {
                    if let Some(tx) = tx_guard.lock().await.as_ref() {
                        // Convert RTCIceCandidate to RTCIceCandidateInit for proper serialization
                        if let Ok(candidate_init) = candidate.to_json() {
                            if let Ok(candidate_json) = serde_json::to_string(&candidate_init) {
                                let msg = SignalingMessage::IceCandidate {
                                    from_peer_id: my_id,
                                    to_peer_id: target_id,
                                    candidate: candidate_json,
                                    sdp_mid: candidate_init.sdp_mid.clone(),
                                    sdp_mline_index: candidate_init.sdp_mline_index,
                                };
                                if let Ok(msg_json) = serde_json::to_string(&msg) {
                                    let _ = tx.send(Message::Text(msg_json));
                                }
                            }
                        }
                    }
                });
            }
            Box::pin(async {})
        }));

        // Create data channel (initiator side)
        let dc = pc
            .create_data_channel("control", Some(RTCDataChannelInit {
                ordered: Some(true),
                ..Default::default()
            }))
            .await?;

        // Set up data channel callbacks
        let dc_arc = dc;
        let on_msg = self.on_data_channel_message.clone();
        let on_open = self.on_data_channel_open.clone();
        let on_close = self.on_data_channel_close.clone();

        // Message handler
        let dc_clone = dc_arc.clone();
        dc_clone.on_message(Box::new(move |msg| {
            let on_msg = on_msg.clone();
            tokio::spawn(async move {
                if msg.is_string {
                    let text = String::from_utf8(msg.data.to_vec())
                        .unwrap_or_else(|_| String::from("<invalid UTF-8>"));
                    let guard = on_msg.lock().await;
                    if let Some(ref callback) = *guard {
                        callback(text);
                    }
                }
            });
            Box::pin(async {})
        }));

        // Open handler
        let dc_clone2 = dc_arc.clone();
        dc_clone2.on_open(Box::new(move || {
            let on_open = on_open.clone();
            tokio::spawn(async move {
                tracing::info!("Data channel opened");
                let guard = on_open.lock().await;
                if let Some(ref callback) = *guard {
                    callback();
                }
            });
            Box::pin(async {})
        }));

        // Close handler
        dc_arc.on_close(Box::new(move || {
            let on_close = on_close.clone();
            tokio::spawn(async move {
                tracing::info!("Data channel closed");
                let guard = on_close.lock().await;
                if let Some(ref callback) = *guard {
                    callback();
                }
            });
            Box::pin(async {})
        }));

        // Create offer
        let offer = pc.create_offer(None).await?;
        pc.set_local_description(offer.clone()).await?;

        // Store the connection
        {
            let mut connections = self.connections.write().await;
            connections.push(ActivePeerConnection {
                peer_id,
                peer_info,
                pc,
                data_channel: Some(dc_arc),
            });
        }

        // Return SDP offer as a plain string (not JSON-encoded)
        Ok(offer.sdp)
    }

    /// Handle an incoming offer (as the display/follower)
    /// Returns the SDP answer to send back
    pub async fn handle_incoming_offer(
        &self,
        from_peer_id: Uuid,
        peer_info: PeerInfo,
        offer_sdp: String,
    ) -> Result<String, Box<dyn std::error::Error>> {
        tracing::info!(
            "Handling offer from peer {} ({})",
            from_peer_id,
            peer_info.display_name
        );

        // Create RTCPeerConnection with STUN for NAT traversal
        // Using multiple public STUN servers for better connectivity
        let config = RTCConfiguration {
            ice_servers: vec![
                RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                },
                RTCIceServer {
                    urls: vec!["stun:stun1.l.google.com:19302".to_string()],
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let pc = Arc::new(self.api.new_peer_connection(config).await?);

        // Set up ICE candidate handler
        let pc_clone = pc.clone();
        let tx_guard = self.message_tx.clone();
        let my_id = self.my_peer_id;
        let target_id = from_peer_id;

        pc_clone.on_ice_candidate(Box::new(move |candidate| {
            if let Some(candidate) = candidate {
                let tx_guard = tx_guard.clone();
                tokio::spawn(async move {
                    if let Some(tx) = tx_guard.lock().await.as_ref() {
                        // Convert RTCIceCandidate to RTCIceCandidateInit for proper serialization
                        if let Ok(candidate_init) = candidate.to_json() {
                            if let Ok(candidate_json) = serde_json::to_string(&candidate_init) {
                                let msg = SignalingMessage::IceCandidate {
                                    from_peer_id: my_id,
                                    to_peer_id: target_id,
                                    candidate: candidate_json,
                                    sdp_mid: candidate_init.sdp_mid.clone(),
                                    sdp_mline_index: candidate_init.sdp_mline_index,
                                };
                                if let Ok(msg_json) = serde_json::to_string(&msg) {
                                    let _ = tx.send(Message::Text(msg_json));
                                }
                            }
                        }
                    }
                });
            }
            Box::pin(async {})
        }));

        // Set up handler for incoming data channel
        let on_msg = self.on_data_channel_message.clone();
        let on_open = self.on_data_channel_open.clone();
        let on_close = self.on_data_channel_close.clone();
        let peer_id_for_dc = from_peer_id;

        pc.on_data_channel(Box::new(move |dc| {
            let dc = Arc::new(dc);
            let on_msg = on_msg.clone();
            let on_open = on_open.clone();
            let on_close = on_close.clone();

            // Message handler
            let dc_clone = dc.clone();
            dc_clone.on_message(Box::new(move |msg| {
                let on_msg = on_msg.clone();
                tokio::spawn(async move {
                    if msg.is_string {
                        let text = String::from_utf8(msg.data.to_vec())
                            .unwrap_or_else(|_| String::from("<invalid UTF-8>"));
                        let guard = on_msg.lock().await;
                        if let Some(ref callback) = *guard {
                            callback(text);
                        }
                    }
                });
                Box::pin(async {})
            }));

            // Open handler
            let dc_clone2 = dc.clone();
            dc_clone2.on_open(Box::new(move || {
                let on_open = on_open.clone();
                tokio::spawn(async move {
                    tracing::info!("Data channel from {} opened", peer_id_for_dc);
                    let guard = on_open.lock().await;
                    if let Some(ref callback) = *guard {
                        callback();
                    }
                });
                Box::pin(async {})
            }));

            // Close handler
            dc.on_close(Box::new(move || {
                let on_close = on_close.clone();
                tokio::spawn(async move {
                    tracing::info!("Data channel from {} closed", peer_id_for_dc);
                    let guard = on_close.lock().await;
                    if let Some(ref callback) = *guard {
                        callback();
                    }
                });
                Box::pin(async {})
            }));

            Box::pin(async {})
        }));

        // Set remote description (the offer)
        let offer = RTCSessionDescription::offer(offer_sdp)?;
        pc.set_remote_description(offer).await?;

        // Create answer
        let answer = pc.create_answer(None).await?;
        pc.set_local_description(answer.clone()).await?;

        // Store the connection
        {
            let mut connections = self.connections.write().await;
            connections.push(ActivePeerConnection {
                peer_id: from_peer_id,
                peer_info,
                pc,
                data_channel: None, // Will be received via on_data_channel
            });
        }

        // Return SDP answer as a plain string (not JSON-encoded)
        Ok(answer.sdp)
    }

    /// Handle an incoming answer (as the controller/initiator)
    pub async fn handle_incoming_answer(
        &self,
        from_peer_id: Uuid,
        answer_sdp: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        tracing::info!("Handling answer from peer {}", from_peer_id);

        // Find the connection
        let connections = self.connections.read().await;
        let conn = connections
            .iter()
            .find(|c| c.peer_id == from_peer_id)
            .ok_or("Peer not found")?;

        // Set remote description
        let answer = RTCSessionDescription::answer(answer_sdp)?;
        conn.pc.set_remote_description(answer).await?;

        tracing::info!("Remote description set for peer {}", from_peer_id);
        Ok(())
    }

    /// Handle an incoming ICE candidate
    pub async fn handle_ice_candidate(
        &self,
        from_peer_id: Uuid,
        candidate_json: String,
        _sdp_mid: Option<String>,
        _sdp_mline_index: Option<u32>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let connections = self.connections.read().await;
        let conn = connections
            .iter()
            .find(|c| c.peer_id == from_peer_id)
            .ok_or("Peer not found")?;

        // Parse the candidate JSON to get the candidate string
        if let Ok(candidate) = serde_json::from_str::<webrtc::ice_transport::ice_candidate::RTCIceCandidateInit>(&candidate_json) {
            conn.pc.add_ice_candidate(candidate).await?;
        }

        Ok(())
    }

    /// Send a message through the data channel to a specific peer
    pub async fn send_message(
        &self,
        target_peer_id: Uuid,
        message: String,
    ) -> Result<(), String> {
        let connections = self.connections.read().await;
        let conn = connections
            .iter()
            .find(|c| c.peer_id == target_peer_id)
            .ok_or(format!("Peer {} not found", target_peer_id))?;

        if let Some(ref dc) = conn.data_channel {
            dc.send_text(&message)
                .await
                .map_err(|e| format!("Failed to send message: {}", e))?;
            Ok(())
        } else {
            Err(format!("Data channel to {} not open", target_peer_id))
        }
    }

    /// Get all connected peers
    pub async fn get_peers(&self) -> Vec<PeerInfo> {
        let connections = self.connections.read().await;
        connections.iter().map(|c| c.peer_info.clone()).collect()
    }

    /// Get the number of connected peers
    pub async fn peer_count(&self) -> usize {
        self.connections.read().await.len()
    }

    /// Check if a specific peer is connected
    pub async fn is_peer_connected(&self, peer_id: Uuid) -> bool {
        let connections = self.connections.read().await;
        connections.iter().any(|c| c.peer_id == peer_id)
    }

    /// Remove a peer connection
    pub async fn remove_peer(&self, peer_id: Uuid) {
        let mut connections = self.connections.write().await;
        if let Some(pos) = connections.iter().position(|c| c.peer_id == peer_id) {
            let conn = connections.remove(pos);
            // Close the peer connection
            let _ = conn.pc.close().await;
            tracing::info!("Removed peer {} from connections", peer_id);
        }
    }

    /// Initiate connections to lower-priority peers (controller → displays)
    pub async fn initiate_connections(
        &self,
        peers: Vec<PeerInfo>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Only controllers initiate connections
        if self.my_peer_type != PeerType::Controller {
            tracing::info!("Not a controller, not initiating connections");
            return Ok(());
        }

        for peer in peers {
            // Skip if already connected
            if self.is_peer_connected(Uuid::parse_str(&peer.id)?).await {
                continue;
            }

            // Only connect to displays
            if peer.peer_type != PeerType::Display {
                continue;
            }

            tracing::info!("Initiating connection to display {}", peer.display_name);
            let peer_id = Uuid::parse_str(&peer.id)?;

            // Create offer
            let offer_sdp = self.create_offer_to(peer_id, peer.clone()).await?;

            // Send offer via signaling
            if let Some(tx) = self.message_tx.lock().await.as_ref() {
                let msg = SignalingMessage::Offer {
                    from_peer_id: self.my_peer_id,
                    to_peer_id: peer_id,
                    sdp: offer_sdp,
                };
                let _ = tx.send(Message::Text(serde_json::to_string(&msg)?));
            }
        }

        Ok(())
    }
}

impl Clone for PeerConnectionManager {
    fn clone(&self) -> Self {
        Self {
            connections: self.connections.clone(),
            message_tx: self.message_tx.clone(),
            my_peer_id: self.my_peer_id,
            my_peer_type: self.my_peer_type,
            api: self.api.clone(),
            on_data_channel_message: self.on_data_channel_message.clone(),
            on_data_channel_open: self.on_data_channel_open.clone(),
            on_data_channel_close: self.on_data_channel_close.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::webrtc::types::PeerType;

    #[tokio::test]
    async fn test_peer_manager_creation() {
        let peer_id = Uuid::new_v4();
        let manager = PeerConnectionManager::new(peer_id, PeerType::Controller);

        assert_eq!(manager.peer_count().await, 0);
        assert!(!manager.is_peer_connected(Uuid::new_v4()).await);
    }
}
