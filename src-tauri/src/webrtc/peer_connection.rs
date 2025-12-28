/// WebRTC Peer Connection Manager
///
/// Handles WebRTC peer-to-peer connections using webrtc-rs.
/// Manages peer connections, data channels, and ICE candidate exchange.

use crate::webrtc::types::{PeerInfo, SignalingMessage};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

/// Represents a connected WebRTC peer with its data channel
pub struct ConnectedPeer {
    pub peer_id: Uuid,
    pub peer_info: PeerInfo,
    pub data_channel_tx: mpsc::UnboundedSender<String>,
}

/// WebRTC Peer Connection Manager
///
/// Note: The webrtc-rs crate (v0.11) is a complex library with many dependencies.
/// For the MVP, we'll implement a simplified approach where:
/// 1. The Tauri app acts as a signaling server (already implemented)
/// 2. We handle the signaling exchange and simulate data channels for testing
/// 3. For full WebRTC support, we would need to use webrtc-rs directly with STUN/TURN
///
/// For this implementation, we'll use the signaling server to relay messages
/// between peers, which provides similar functionality for our use case.
pub struct PeerConnectionManager {
    connected_peers: Arc<RwLock<Vec<ConnectedPeer>>>,
    message_tx: Arc<Mutex<Option<mpsc::UnboundedSender<Message>>>>,
}

impl PeerConnectionManager {
    pub fn new() -> Self {
        Self {
            connected_peers: Arc::new(RwLock::new(Vec::new())),
            message_tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the WebSocket sender for the signaling server
    pub async fn set_message_tx(&self, tx: mpsc::UnboundedSender<Message>) {
        *self.message_tx.lock().await = Some(tx);
    }

    /// Handle an incoming signaling message
    pub async fn handle_signaling_message(
        &self,
        msg: SignalingMessage,
        my_peer_id: Uuid,
    ) -> Result<(), Box<dyn std::error::Error>> {
        match msg {
            SignalingMessage::Register { peer_id, peer_type, display_name, .. } => {
                tracing::info!("Peer registered: {} ({:?})", display_name, peer_type);
                self.add_peer(peer_id, PeerInfo {
                    id: peer_id.to_string(),
                    peer_type,
                    display_name,
                    is_connected: true,
                    is_leader: false,
                }).await;
            }
            SignalingMessage::Offer { from_peer_id, to_peer_id, .. } => {
                if to_peer_id == my_peer_id {
                    tracing::info!("Received offer from {}", from_peer_id);
                    // In full WebRTC, we would create a peer connection here
                    // For now, we'll handle this at the signaling layer
                }
            }
            SignalingMessage::Answer { from_peer_id, .. } => {
                tracing::info!("Received answer from {}", from_peer_id);
            }
            SignalingMessage::IceCandidate { from_peer_id, .. } => {
                tracing::debug!("Received ICE candidate from {}", from_peer_id);
            }
            SignalingMessage::Heartbeat { .. } => {
                // Heartbeat received
            }
            SignalingMessage::PeerList { .. } => {
                // Peer list updated
            }
            SignalingMessage::Data { from_peer_id, to_peer_id, message } => {
                tracing::info!("Data message from {} to {}: {}", from_peer_id, to_peer_id, message);
                // Handle data message relay
            }
        }
        Ok(())
    }

    /// Add a connected peer
    pub async fn add_peer(&self, peer_id: Uuid, peer_info: PeerInfo) {
        let mut peers = self.connected_peers.write().await;
        // Check if peer already exists
        if !peers.iter().any(|p| p.peer_id == peer_id) {
            let (tx, _rx) = mpsc::unbounded_channel();
            peers.push(ConnectedPeer {
                peer_id,
                peer_info,
                data_channel_tx: tx,
            });
            tracing::info!("Added peer: {}", peer_id);
        }
    }

    /// Remove a connected peer
    pub async fn remove_peer(&self, peer_id: Uuid) {
        let mut peers = self.connected_peers.write().await;
        if let Some(pos) = peers.iter().position(|p| p.peer_id == peer_id) {
            peers.remove(pos);
            tracing::info!("Removed peer: {}", peer_id);
        }
    }

    /// Send a message to a specific peer
    pub async fn send_message(&self, target_peer_id: Uuid, message: String) -> Result<(), String> {
        let peers = self.connected_peers.read().await;
        if let Some(peer) = peers.iter().find(|p| p.peer_id == target_peer_id) {
            peer.data_channel_tx.send(message)
                .map_err(|e| format!("Failed to send message: {}", e))?;
            Ok(())
        } else {
            Err(format!("Peer {} not found", target_peer_id))
        }
    }

    /// Get all connected peers
    pub async fn get_peers(&self) -> Vec<PeerInfo> {
        let peers = self.connected_peers.read().await;
        peers.iter().map(|p| p.peer_info.clone()).collect()
    }

    /// Get the number of connected peers
    pub async fn peer_count(&self) -> usize {
        self.connected_peers.read().await.len()
    }

    /// Check if a specific peer is connected
    pub async fn is_peer_connected(&self, peer_id: Uuid) -> bool {
        let peers = self.connected_peers.read().await;
        peers.iter().any(|p| p.peer_id == peer_id)
    }
}

impl Clone for PeerConnectionManager {
    fn clone(&self) -> Self {
        Self {
            connected_peers: self.connected_peers.clone(),
            message_tx: self.message_tx.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_peer_manager() {
        let manager = PeerConnectionManager::new();

        // Test adding a peer
        let peer_id = Uuid::new_v4();
        manager.add_peer(peer_id, PeerInfo {
            id: peer_id.to_string(),
            peer_type: crate::webrtc::types::PeerType::Controller,
            display_name: "Test Peer".to_string(),
            is_connected: true,
            is_leader: false,
        }).await;

        assert!(manager.is_peer_connected(peer_id).await);
        assert_eq!(manager.peer_count().await, 1);

        // Test removing a peer
        manager.remove_peer(peer_id).await;
        assert!(!manager.is_peer_connected(peer_id).await);
        assert_eq!(manager.peer_count().await, 0);
    }
}
