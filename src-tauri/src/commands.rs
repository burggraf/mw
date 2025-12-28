use crate::webrtc::{
    Peer, PeerType, DiscoveryService, ElectionService, ElectionResult,
    SignalingServer, PeerInfo, Priority,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

/// Global WebRTC state
pub struct WebrtcState {
    pub peer: Arc<Mutex<Option<Peer>>>,
    pub discovery: Arc<Mutex<Option<DiscoveryService>>>,
    pub election: Arc<Mutex<Option<ElectionService>>>,
    pub signaling_server: Arc<Mutex<Option<SignalingServer>>>,
    pub connected_peers: Arc<Mutex<Vec<PeerInfo>>>,
    pub leader_id: Arc<Mutex<Option<uuid::Uuid>>>,
    pub is_running: Arc<Mutex<bool>>,
}

impl WebrtcState {
    pub fn new() -> Self {
        Self {
            peer: Arc::new(Mutex::new(None)),
            discovery: Arc::new(Mutex::new(None)),
            election: Arc::new(Mutex::new(None)),
            signaling_server: Arc::new(Mutex::new(None)),
            connected_peers: Arc::new(Mutex::new(Vec::new())),
            leader_id: Arc::new(Mutex::new(None)),
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
    let peer_id = peer.id;

    tracing::info!("Starting peer: {} ({:?})", peer.display_name, peer.peer_type);

    // Store the peer
    let state = app_handle.state::<WebrtcState>();
    *state.peer.lock().await = Some(peer.clone());

    // Emit started event
    let _ = app_handle.emit("webrtc:started", peer_id.to_string());

    // Initialize discovery service
    let mut discovery = DiscoveryService::new();

    // Announce this peer via mDNS
    if let Err(e) = discovery.announce(&peer) {
        tracing::warn!("Failed to announce via mDNS: {}", e);
        // Continue anyway - mDNS may not work on all networks
    }

    *state.discovery.lock().await = Some(discovery);

    // Initialize election service
    let election = ElectionService::new(DiscoveryService::new());
    election.set_peer(peer.clone()).await;
    *state.election.lock().await = Some(election);

    // Emit discovering event
    let _ = app_handle.emit("webrtc:discovering", ());

    // Run leader election
    let election_service = state.election.lock().await;
    let election_result = if let Some(ref election) = *election_service {
        // Browse for leaders
        let discovery_service = state.discovery.lock().await;
        if let Some(ref discovery) = *discovery_service {
            let discovered = discovery.browse_for_leaders().unwrap_or_default();
            drop(discovery_service);

            // Check if anyone has higher priority
            let self_priority = peer.priority();
            let mut highest_priority = self_priority;
            let mut leader_id = peer.id;

            for other in &discovered {
                let other_priority = Priority {
                    device_type_score: other.priority.0,
                    startup_time_ms: other.priority.1,
                };
                if other_priority > highest_priority {
                    highest_priority = other_priority;
                    leader_id = other.peer_id;
                }
            }

            if discovered.is_empty() {
                // No other peers - we become leader
                *state.leader_id.lock().await = Some(peer.id);
                let _ = app_handle.emit("webrtc:leader_changed", peer.id.to_string());
                ElectionResult::BecameLeader
            } else if leader_id == peer.id {
                *state.leader_id.lock().await = Some(peer.id);
                let _ = app_handle.emit("webrtc:leader_changed", peer.id.to_string());
                ElectionResult::BecameLeader
            } else {
                *state.leader_id.lock().await = Some(leader_id);
                let _ = app_handle.emit("webrtc:leader_changed", leader_id.to_string());
                ElectionResult::Follower { leader_id }
            }
        } else {
            ElectionResult::NoPeers
        }
    } else {
        ElectionResult::NoPeers
    };

    drop(election_service);

    // Act on election result
    match election_result {
        ElectionResult::BecameLeader => {
            tracing::info!("Became leader - starting signaling server");

            // Start signaling server
            let signaling_server = SignalingServer::new();
            signaling_server.start(3010).await
                .map_err(|e| format!("Failed to start signaling server: {}", e))?;

            *state.signaling_server.lock().await = Some(signaling_server);
            *state.is_running.lock().await = true;

            let _ = app_handle.emit("webrtc:connected", peer_id.to_string());
            let _ = app_handle.emit("webrtc:peer_list_changed", vec![peer.to_info(true)]);

            tracing::info!("Signaling server started on port 3010");
        }
        ElectionResult::Follower { leader_id } => {
            tracing::info!("Follower - connecting to leader {}", leader_id);

            // TODO: Connect to leader's signaling server
            // For now, just mark as connected
            *state.is_running.lock().await = true;

            let _ = app_handle.emit::<Vec<crate::webrtc::PeerInfo>>("webrtc:connected", vec![]);
            // In a real implementation, we'd fetch the peer list from the leader
            let _ = app_handle.emit::<Vec<crate::webrtc::PeerInfo>>("webrtc:peer_list_changed", vec![]);

            tracing::info!("Connected as follower (leader connection not yet implemented)");
        }
        ElectionResult::NoPeers => {
            tracing::info!("No peers discovered - becoming leader by default");

            // Start signaling server as the first peer
            let signaling_server = SignalingServer::new();
            signaling_server.start(3010).await
                .map_err(|e| format!("Failed to start signaling server: {}", e))?;

            *state.signaling_server.lock().await = Some(signaling_server);
            *state.leader_id.lock().await = Some(peer.id);
            *state.is_running.lock().await = true;

            let _ = app_handle.emit("webrtc:connected", peer_id.to_string());
            let _ = app_handle.emit("webrtc:leader_changed", peer_id.to_string());
            let _ = app_handle.emit("webrtc:peer_list_changed", vec![peer.to_info(true)]);

            tracing::info!("First peer - signaling server started on port 3010");
        }
    }

    Ok(peer_id.to_string())
}

/// Send a control message to a peer
#[tauri::command]
pub async fn send_control_message(
    target_peer_id: String,
    message: String,
    _app_handle: AppHandle,
) -> Result<(), String> {
    // TODO: Implement actual data channel sending
    // For now, just log
    tracing::info!("Sending message to {}: {}", target_peer_id, message);
    Ok(())
}

/// Get all connected peers
#[tauri::command]
pub async fn get_connected_peers(app_handle: AppHandle) -> Result<Vec<PeerInfo>, String> {
    let state = app_handle.state::<WebrtcState>();
    let peers = state.connected_peers.lock().await;
    Ok(peers.clone())
}

/// Get leader status
#[tauri::command]
pub async fn get_leader_status(app_handle: AppHandle) -> Result<crate::webrtc::LeaderStatus, String> {
    let state = app_handle.state::<WebrtcState>();
    let leader_id = state.leader_id.lock().await;
    let peer = state.peer.lock().await;

    let (leader_id_str, am_i_leader, peer_count) = if let Some(ref peer) = *peer {
        let lid = leader_id.map(|id| id.to_string());
        let am_i = leader_id.map(|id| id == peer.id).unwrap_or(false);
        let count = 1; // TODO: Track actual peer count
        (lid, am_i, count)
    } else {
        (None, false, 0)
    };

    Ok(crate::webrtc::LeaderStatus {
        leader_id: leader_id_str,
        am_i_leader: am_i_leader,
        peer_count,
    })
}
