use crate::webrtc::{Peer, PeerType};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
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
    _app_handle: AppHandle,
) -> Result<(), String> {
    // TODO: Implement actual data channel sending
    tracing::info!("Sending message to {}: {}", target_peer_id, message);
    Ok(())
}

/// Get all connected peers
#[tauri::command]
pub async fn get_connected_peers(_app_handle: AppHandle) -> Result<Vec<crate::webrtc::PeerInfo>, String> {
    // TODO: Return actual connected peers
    Ok(vec![])
}

/// Get leader status
#[tauri::command]
pub async fn get_leader_status(_app_handle: AppHandle) -> Result<crate::webrtc::LeaderStatus, String> {
    // TODO: Return actual leader status
    Ok(crate::webrtc::LeaderStatus {
        leader_id: None,
        am_i_leader: false,
        peer_count: 0,
    })
}
