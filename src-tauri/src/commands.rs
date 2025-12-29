use crate::webrtc::{
    Peer, PeerType, DiscoveryService, ElectionService, ElectionResult,
    SignalingServer, PeerInfo, Priority, SignalingMessage, TcpP2pManager,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::connect_async;

/// Global WebRTC state
pub struct WebrtcState {
    pub peer: Arc<Mutex<Option<Peer>>>,
    pub discovery: Arc<Mutex<Option<DiscoveryService>>>,
    pub election: Arc<Mutex<Option<ElectionService>>>,
    pub signaling_server: Arc<Mutex<Option<Arc<SignalingServer>>>>,
    pub tcp_p2p: Arc<Mutex<Option<TcpP2pManager>>>,
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
            tcp_p2p: Arc::new(Mutex::new(None)),
            connected_peers: Arc::new(Mutex::new(Vec::new())),
            leader_id: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }
}

/// Connect to an existing signaling server as a client (simplified, no WebRTC)
async fn connect_to_signaling_server_simple(
    addr: &str,
    peer: Peer,
    app_handle: &AppHandle,
    state: &tauri::State<'_, WebrtcState>,
    my_peer_type: PeerType,
) -> Result<Arc<SignalingServer>, String> {
    use futures_util::{SinkExt, StreamExt};

    let ws_url = format!("ws://{}/", addr);
    tracing::info!("Connecting to signaling server at {}", ws_url);

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .map_err(|e| format!("Failed to connect to signaling server: {}", e))?;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Create a signaling server wrapper (it won't actually listen, just provide the interface)
    let signaling_server = Arc::new(SignalingServer::new());

    // Send registration message BEFORE spawning task (ws_sender will be moved)
    let register_msg = SignalingMessage::Register {
        peer_id: peer.id,
        peer_type: peer.peer_type,
        display_name: peer.display_name.clone(),
        display_class: None,
        priority: None,
    };
    if let Err(e) = ws_sender.send(Message::Text(serde_json::to_string(&register_msg).unwrap())).await {
        return Err(format!("Failed to send registration: {}", e));
    }

    // Task to handle incoming messages from the signaling server
    let app_handle = app_handle.clone();
    let connected_peers = state.connected_peers.clone();
    let leader_id = state.leader_id.clone();
    let tcp_p2p_monitor = state.tcp_p2p.clone();
    let my_peer_id = peer.id;
    tokio::spawn(async move {
        let mut connections_initiated = false;

        while let Some(msg_result) = ws_receiver.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    if let Ok(signaling_msg) = serde_json::from_str::<SignalingMessage>(&text) {
                        match signaling_msg {
                            SignalingMessage::PeerList { peers } => {
                                tracing::info!("Received peer list: {} peers", peers.len());
                                *connected_peers.lock().await = peers.clone();
                                let _ = app_handle.emit("webrtc:peer_list_changed", peers.clone());

                                // Check if there's a leader in the peer list and emit leader_changed
                                if let Some(leader) = peers.iter().find(|p| p.is_leader) {
                                    let leader_peer_id = leader.id.clone();
                                    let current_leader_id = *leader_id.lock().await;
                                    let leader_uuid = uuid::Uuid::parse_str(&leader_peer_id).ok();

                                    if leader_uuid != current_leader_id {
                                        *leader_id.lock().await = leader_uuid;
                                        let _ = app_handle.emit("webrtc:leader_changed", leader_peer_id.clone());
                                        tracing::info!("Leader changed to: {} (I am: {})", leader_peer_id,
                                            if leader_uuid == Some(my_peer_id) { "leader" } else { "follower" });
                                    }
                                }

                                // Initiate TCP connections if we're a controller and haven't yet
                                if !connections_initiated && my_peer_type == PeerType::Controller {
                                    connections_initiated = true;
                                    if let Some(ref tcp_p2p) = *tcp_p2p_monitor.lock().await {
                                        for peer_info in &peers {
                                            if peer_info.peer_type == PeerType::Display {
                                                let peer_id = uuid::Uuid::parse_str(&peer_info.id).unwrap_or(uuid::Uuid::new_v4());
                                                tracing::info!("Controller: Connecting via TCP to display {}", peer_info.display_name);
                                                if let Err(e) = tcp_p2p.connect_to_peer(peer_id, peer_info.clone(), "127.0.0.1", 3011).await {
                                                    tracing::error!("Failed to connect TCP to {}: {}", peer_info.display_name, e);
                                                } else {
                                                    tracing::info!("Connected via TCP to {}", peer_info.display_name);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            SignalingMessage::Data { from_peer_id, message, .. } => {
                                // Emit data message event (for signaling relay fallback)
                                tracing::info!("Signaling: Received data via WebSocket from {}: {}", from_peer_id, message);
                                let payload = serde_json::json!({
                                    "from_peer_id": from_peer_id.to_string(),
                                    "message": message,
                                });
                                let _ = app_handle.emit("webrtc:data_received", payload);
                            }
                            _ => {
                                // Ignore WebRTC-specific messages (Offer, Answer, ICE)
                                tracing::debug!("Ignoring WebRTC signaling message: {:?}", signaling_msg);
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    tracing::info!("Signaling server closed connection");
                    break;
                }
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Return the Arc directly since WebrtcState stores Arc<SignalingServer>
    Ok(signaling_server)
}

/// Start the WebRTC peer
#[tauri::command]
pub async fn start_peer(
    peer_type: PeerType,
    display_name: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let state = app_handle.state::<WebrtcState>();

    // Check if a peer already exists - return its ID instead of creating a new one
    // This prevents multiple calls from creating duplicate peers/trying to bind the same port
    {
        let existing_peer = state.peer.lock().await;
        if let Some(ref peer) = *existing_peer {
            let peer_id = peer.id.to_string();
            tracing::info!("Peer already exists with ID {}, reusing existing peer", peer_id);
            // Drop the lock before returning
            drop(existing_peer);
            return Ok(peer_id);
        }
    }

    let peer = Peer::new(peer_type, display_name);
    let peer_id = peer.id;

    tracing::info!("Starting peer: {} ({:?})", peer.display_name, peer.peer_type);

    // Store the peer
    *state.peer.lock().await = Some(peer.clone());

    // Initialize the TCP P2P manager
    // Use port 3011 for TCP server (3010 is for signaling)
    let tcp_p2p = TcpP2pManager::new(peer.id, 3011);

    // Set up TCP message callbacks
    let app_handle_for_cb = app_handle.clone();
    tcp_p2p.on_message(move |message: String, from_peer_id: uuid::Uuid| {
        let app_handle = app_handle_for_cb.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("TCP: Received message from {}: {}", from_peer_id, message);
            let payload = serde_json::json!({
                "from_peer_id": from_peer_id.to_string(),
                "message": message,
            });
            tracing::info!("TCP: Emitting webrtc:data_received event: {}", payload);
            let _ = app_handle.emit("webrtc:data_received", payload);
        });
    }).await;

    let app_handle_for_cb = app_handle.clone();
    tcp_p2p.on_connected(move |peer_id: uuid::Uuid| {
        let app_handle = app_handle_for_cb.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("TCP: Peer connected: {}", peer_id);
            let _ = app_handle.emit("webrtc:peer_connected", peer_id.to_string());
        });
    }).await;

    let app_handle_for_cb = app_handle.clone();
    tcp_p2p.on_disconnected(move |peer_id: uuid::Uuid| {
        let app_handle = app_handle_for_cb.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("TCP: Peer disconnected: {}", peer_id);
            let _ = app_handle.emit("webrtc:peer_disconnected", peer_id.to_string());
        });
    }).await;

    *state.tcp_p2p.lock().await = Some(tcp_p2p);

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
    let election_result = if let Some(ref _election) = *election_service {
        // Browse for leaders
        let discovery_service = state.discovery.lock().await;
        if let Some(ref discovery) = *discovery_service {
            let discovered = discovery.browse_for_leaders().await.unwrap_or_default();
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
                let peer_id_str = peer.id.to_string();
                tracing::info!("Election: Became leader, emitting webrtc:leader_changed with {}", peer_id_str);
                let _ = app_handle.emit("webrtc:leader_changed", peer_id_str);
                ElectionResult::BecameLeader
            } else if leader_id == peer.id {
                *state.leader_id.lock().await = Some(peer.id);
                let peer_id_str = peer.id.to_string();
                tracing::info!("Election: Already leader, emitting webrtc:leader_changed with {}", peer_id_str);
                let _ = app_handle.emit("webrtc:leader_changed", peer_id_str);
                ElectionResult::BecameLeader
            } else {
                *state.leader_id.lock().await = Some(leader_id);
                let leader_str = leader_id.to_string();
                tracing::info!("Election: Became follower, emitting webrtc:leader_changed with {}", leader_str);
                let _ = app_handle.emit("webrtc:leader_changed", leader_str);
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
            tracing::info!("Election result: BecameLeader - attempting to start signaling server");

            // Try to start signaling server, if port is taken, connect as follower instead
            let signaling_server = SignalingServer::new();

            // Set up data message callback to emit events to frontend
            let app_handle_for_callback = app_handle.clone();
            signaling_server.on_data(move |from_peer_id: uuid::Uuid, message: String| {
                let app_handle = app_handle_for_callback.clone();
                tauri::async_runtime::spawn(async move {
                    let payload = serde_json::json!({
                        "from_peer_id": from_peer_id.to_string(),
                        "message": message,
                    });
                    tracing::info!("Signaling: Emitting webrtc:data_received event: {}", payload);
                    let _ = app_handle.emit("webrtc:data_received", payload);
                });
            }).await;

            let server_result = signaling_server.start(3010).await;

            // Convert error to String to avoid non-Send type across await
            let server_result = server_result.map_err(|e| e.to_string());

            if let Err(error_msg) = server_result {
                if error_msg.contains("Address already in use") || error_msg.contains("os error 48") {
                    tracing::info!("Port 3010 already in use - connecting as follower instead");

                    // For displays: Start TCP server BEFORE connecting to signaling
                    if peer.peer_type == PeerType::Display {
                        let tcp_p2p = state.tcp_p2p.lock().await.clone().unwrap();
                        match tcp_p2p.start_server().await {
                            Ok(port) => {
                                tracing::info!("Display: TCP server started on port {}", port);
                            }
                            Err(e) => {
                                tracing::warn!("Failed to start TCP server: {}", e);
                            }
                        }
                    }

                    // Connect to existing signaling server
                    drop(signaling_server); // Don't need the server we tried to start

                    match connect_to_signaling_server_simple("127.0.0.1:3010", peer.clone(), &app_handle, &state, peer_type).await {
                        Ok(server) => {
                            *state.signaling_server.lock().await = Some(server);
                            *state.is_running.lock().await = true;

                            let peer_id_str = peer.id.to_string();
                            let _ = app_handle.emit("webrtc:connected", peer_id_str);
                            let _ = app_handle.emit("webrtc:peer_list_changed", vec![peer.to_info(true)]);

                            tracing::info!("Connected to existing signaling server as follower");
                            return Ok(peer_id.to_string());
                        }
                        Err(e) => {
                            return Err(format!("Failed to connect to existing signaling server: {}", e));
                        }
                    }
                } else {
                    return Err(format!("Failed to start signaling server: {}", error_msg));
                }
            }

            // Register local peer with signaling server so browser clients can see it
            signaling_server.set_local_peer(peer.to_info_with_leader(true, true)).await;

            // Wrap in Arc so we can clone it
            let signaling_server = Arc::new(signaling_server);

            *state.signaling_server.lock().await = Some(signaling_server.clone());
            *state.is_running.lock().await = true;

            // For displays: Start TCP server to accept connections from controllers
            if peer.peer_type == PeerType::Display {
                let tcp_p2p = state.tcp_p2p.lock().await.clone().unwrap();
                match tcp_p2p.start_server().await {
                    Ok(port) => {
                        tracing::info!("Display: TCP server started on port {}", port);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to start TCP server: {}", e);
                    }
                }
            }

            // Spawn a task to monitor for new peers and initiate TCP connections (if controller)
            let signaling_server_monitor = signaling_server.clone();
            let connected_peers_monitor = state.connected_peers.clone();
            let tcp_p2p_monitor = state.tcp_p2p.clone();
            let is_running_monitor = state.is_running.clone();
            let my_peer_type = peer.peer_type;
            let my_peer_id = peer.id;
            tokio::spawn(async move {
                let mut known_peers: std::collections::HashSet<String> = std::collections::HashSet::new();

                while *is_running_monitor.lock().await {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                    // Get current peer list from signaling server
                    let peers = signaling_server_monitor.get_peer_list().await;

                    // Find new peers
                    for peer_info in &peers {
                        if !known_peers.contains(&peer_info.id) && peer_info.id != my_peer_id.to_string() {
                            known_peers.insert(peer_info.id.clone());
                            tracing::info!("New peer detected: {} ({:?})", peer_info.display_name, peer_info.peer_type);

                            // If we're a controller and new peer is a display, connect via TCP
                            if my_peer_type == PeerType::Controller && peer_info.peer_type == PeerType::Display {
                                if let Some(ref tcp_p2p) = *tcp_p2p_monitor.lock().await {
                                    let peer_id = uuid::Uuid::parse_str(&peer_info.id).unwrap_or(uuid::Uuid::new_v4());
                                    // Connect to display on localhost
                                    if let Err(e) = tcp_p2p.connect_to_peer(peer_id, peer_info.clone(), "127.0.0.1", 3011).await {
                                        tracing::error!("Failed to connect TCP to {}: {}", peer_info.display_name, e);
                                    } else {
                                        tracing::info!("Connected via TCP to {}", peer_info.display_name);
                                    }
                                }
                            }
                        }
                    }

                    // Update connected_peers for get_connected_peers command
                    *connected_peers_monitor.lock().await = peers;
                }
            });

            let _ = app_handle.emit("webrtc:connected", peer_id.to_string());
            let _ = app_handle.emit("webrtc:peer_list_changed", vec![peer.to_info(true)]);

            tracing::info!("Signaling server started on port 3010");
        }
        ElectionResult::Follower { leader_id } => {
            tracing::info!("Follower - connecting to leader {}", leader_id);

            // For displays: Start TCP server to accept connections from controllers
            if peer.peer_type == PeerType::Display {
                let tcp_p2p = state.tcp_p2p.lock().await.clone().unwrap();
                match tcp_p2p.start_server().await {
                    Ok(port) => {
                        tracing::info!("Display: TCP server started on port {}", port);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to start TCP server: {}", e);
                    }
                }
            }

            // Connect to leader's signaling server as a WebSocket client
            match connect_to_signaling_server_simple("127.0.0.1:3010", peer.clone(), &app_handle, &state, peer_type).await {
                Ok(server) => {
                    *state.signaling_server.lock().await = Some(server);
                    *state.is_running.lock().await = true;
                    tracing::info!("Connected to leader's signaling server");
                }
                Err(e) => {
                    tracing::warn!("Failed to connect to leader: {}", e);
                    *state.is_running.lock().await = true;
                }
            }

            let _ = app_handle.emit::<Vec<crate::webrtc::PeerInfo>>("webrtc:connected", vec![]);
            let _ = app_handle.emit::<Vec<crate::webrtc::PeerInfo>>("webrtc:peer_list_changed", vec![]);
        }
        ElectionResult::NoPeers => {
            tracing::info!("No peers discovered - becoming leader by default");

            // For displays: Start TCP server early (before checking for signaling server)
            if peer.peer_type == PeerType::Display {
                let tcp_p2p = state.tcp_p2p.lock().await.clone().unwrap();
                match tcp_p2p.start_server().await {
                    Ok(port) => {
                        tracing::info!("Display: TCP server started on port {}", port);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to start TCP server: {}", e);
                    }
                }
            }

            // Try to start signaling server, if port is taken, connect as follower instead
            let signaling_server = SignalingServer::new();

            // Set up data message callback to emit events to frontend
            let app_handle_for_callback = app_handle.clone();
            signaling_server.on_data(move |from_peer_id: uuid::Uuid, message: String| {
                let app_handle = app_handle_for_callback.clone();
                tauri::async_runtime::spawn(async move {
                    let payload = serde_json::json!({
                        "from_peer_id": from_peer_id.to_string(),
                        "message": message,
                    });
                    tracing::info!("Signaling: Emitting webrtc:data_received event: {}", payload);
                    let _ = app_handle.emit("webrtc:data_received", payload);
                });
            }).await;

            let server_result = signaling_server.start(3010).await;

            // Convert error to String to avoid non-Send type across await
            let server_result = server_result.map_err(|e| e.to_string());

            if let Err(error_msg) = server_result {
                if error_msg.contains("Address already in use") || error_msg.contains("os error 48") {
                    tracing::info!("Port 3010 already in use - connecting as follower instead");

                    // Connect to existing signaling server
                    drop(signaling_server); // Don't need the server we tried to start

                    match connect_to_signaling_server_simple("127.0.0.1:3010", peer.clone(), &app_handle, &state, peer_type).await {
                        Ok(server) => {
                            *state.signaling_server.lock().await = Some(server);
                            *state.leader_id.lock().await = Some(peer.id); // Will be updated when we get peer list
                            *state.is_running.lock().await = true;

                            let peer_id_str = peer.id.to_string();
                            let _ = app_handle.emit("webrtc:connected", peer_id_str);
                            let _ = app_handle.emit("webrtc:peer_list_changed", vec![peer.to_info(true)]);

                            tracing::info!("Connected to existing signaling server as follower");
                            return Ok(peer_id.to_string());
                        }
                        Err(e) => {
                            return Err(format!("Failed to connect to existing signaling server: {}", e));
                        }
                    }
                } else {
                    return Err(format!("Failed to start signaling server: {}", error_msg));
                }
            }

            // Register local peer with signaling server so browser clients can see it
            signaling_server.set_local_peer(peer.to_info_with_leader(true, true)).await;

            // Wrap in Arc and clone before storing
            let signaling_server = Arc::new(signaling_server);

            *state.signaling_server.lock().await = Some(signaling_server.clone());
            *state.leader_id.lock().await = Some(peer.id);
            *state.is_running.lock().await = true;

            // For displays: Start TCP server to accept connections from controllers
            if peer.peer_type == PeerType::Display {
                let tcp_p2p = state.tcp_p2p.lock().await.clone().unwrap();
                match tcp_p2p.start_server().await {
                    Ok(port) => {
                        tracing::info!("Display: TCP server started on port {}", port);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to start TCP server: {}", e);
                    }
                }
            }

            // Spawn a task to monitor for new peers (if controller)
            let signaling_server_monitor = signaling_server.clone();
            let connected_peers_monitor = state.connected_peers.clone();
            let tcp_p2p_monitor = state.tcp_p2p.clone();
            let is_running_monitor = state.is_running.clone();
            let my_peer_type = peer.peer_type;
            let my_peer_id = peer.id;
            tokio::spawn(async move {
                let mut known_peers: std::collections::HashSet<String> = std::collections::HashSet::new();

                while *is_running_monitor.lock().await {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                    // Get current peer list from signaling server
                    let peers = signaling_server_monitor.get_peer_list().await;

                    // Find new peers
                    for peer_info in &peers {
                        if !known_peers.contains(&peer_info.id) && peer_info.id != my_peer_id.to_string() {
                            known_peers.insert(peer_info.id.clone());
                            tracing::info!("New peer detected: {} ({:?})", peer_info.display_name, peer_info.peer_type);

                            // If we're a controller and new peer is a display, connect via TCP
                            if my_peer_type == PeerType::Controller && peer_info.peer_type == PeerType::Display {
                                if let Some(ref tcp_p2p) = *tcp_p2p_monitor.lock().await {
                                    let peer_id = uuid::Uuid::parse_str(&peer_info.id).unwrap_or(uuid::Uuid::new_v4());
                                    // Connect to display on localhost
                                    if let Err(e) = tcp_p2p.connect_to_peer(peer_id, peer_info.clone(), "127.0.0.1", 3011).await {
                                        tracing::error!("Failed to connect TCP to {}: {}", peer_info.display_name, e);
                                    } else {
                                        tracing::info!("Connected via TCP to {}", peer_info.display_name);
                                    }
                                }
                            }
                        }
                    }

                    // Update connected_peers for get_connected_peers command
                    *connected_peers_monitor.lock().await = peers;
                }
            });

            let peer_id_str = peer.id.to_string();
            tracing::info!("First peer - emitting webrtc:leader_changed with {}", peer_id_str);
            let _ = app_handle.emit("webrtc:connected", peer_id_str.clone());
            let _ = app_handle.emit("webrtc:leader_changed", peer_id_str);
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
    app_handle: AppHandle,
) -> Result<(), String> {
    use uuid::Uuid;

    let state = app_handle.state::<WebrtcState>();
    let peer_id = state.peer.lock().await
        .as_ref()
        .map(|p| p.id)
        .ok_or("Peer not started")?;

    let to_peer_id = Uuid::parse_str(&target_peer_id)
        .map_err(|e| format!("Invalid peer ID: {}", e))?;

    // First, try to send via TCP P2P
    let tcp_p2p = state.tcp_p2p.lock().await.clone();
    if let Some(ref manager) = tcp_p2p {
        match manager.send_message(to_peer_id, message.clone()).await {
            Ok(()) => {
                tracing::debug!("Sent message via TCP to {}", target_peer_id);
                return Ok(());
            }
            Err(e) => {
                tracing::debug!("TCP not available, falling back to signaling: {}", e);
                // Fall through to signaling relay
            }
        }
    }

    // Fall back to signaling server relay
    let signaling_server = state.signaling_server.lock().await;
    if let Some(server) = signaling_server.as_ref() {
        server.send_data(peer_id, to_peer_id, message).await;
        Ok(())
    } else {
        Err("No connection available".to_string())
    }
}

/// Get all connected peers
#[tauri::command]
pub async fn get_connected_peers(app_handle: AppHandle) -> Result<Vec<PeerInfo>, String> {
    let state = app_handle.state::<WebrtcState>();

    // Prefer connected_peers (updated by WebSocket messages for followers)
    let peers = state.connected_peers.lock().await;
    if !peers.is_empty() {
        return Ok(peers.clone());
    }

    // Fallback to signaling server's peer list (for the leader)
    if let Some(ref signaling_server) = *state.signaling_server.lock().await {
        let server_peers = signaling_server.get_peer_list().await;
        if !server_peers.is_empty() {
            return Ok(server_peers);
        }
    }

    Ok(vec![])
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

/// Auto-start test mode - automatically starts peer and sends periodic messages
pub fn start_auto_test(app_handle: AppHandle, mode: crate::AutoStartMode) {
    let peer_type = match mode {
        crate::AutoStartMode::Controller => PeerType::Controller,
        crate::AutoStartMode::Display => PeerType::Display,
        crate::AutoStartMode::None => return,
    };
    let display_name = match mode {
        crate::AutoStartMode::Controller => "Auto Controller".to_string(),
        crate::AutoStartMode::Display => "Auto Display".to_string(),
        crate::AutoStartMode::None => return,
    };

    // Use Tauri's async runtime to spawn the task
    tauri::async_runtime::spawn(async move {
        // Wait 2 seconds for the app to fully initialize
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        tracing::info!("AUTO-START: Starting peer as {:?}", mode);

        // Start the peer
        let peer_id = match start_peer(peer_type, display_name, app_handle.clone()).await {
            Ok(id) => {
                tracing::info!("AUTO-START: Peer started with ID {}", id);
                id
            }
            Err(e) => {
                tracing::error!("AUTO-START: Failed to start peer: {}", e);
                return;
            }
        };

        // Wait 3 more seconds for connections to establish
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        // Get connected peers
        let peers = match get_connected_peers(app_handle.clone()).await {
            Ok(p) => p,
            Err(e) => {
                tracing::error!("AUTO-START: Failed to get peers: {}", e);
                return;
            }
        };

        tracing::info!("AUTO-START: Connected peers: {}", peers.len());

        // For controller, send periodic test messages
        if mode == crate::AutoStartMode::Controller {
            let mut message_count = 0;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                message_count += 1;
                let test_msg = format!("Auto Test Message #{}", message_count);
                tracing::info!("AUTO-START: Sending test message: {}", test_msg);

                // Send to all connected peers
                let peers = match get_connected_peers(app_handle.clone()).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("AUTO-START: Failed to get peers: {}", e);
                        continue;
                    }
                };

                for peer in &peers {
                    if peer.id != peer_id {
                        match send_control_message(peer.id.clone(), test_msg.clone(), app_handle.clone()).await {
                            Ok(_) => {
                                tracing::info!("AUTO-START: Sent '{}' to {}", test_msg, peer.display_name);
                            }
                            Err(e) => {
                                tracing::warn!("AUTO-START: Failed to send to {}: {}", peer.display_name, e);
                            }
                        }
                    }
                }
            }
        } else {
            // Display mode - send periodic test messages too
            tracing::info!("AUTO-START: Display mode listening for messages...");
            let mut message_count = 0;
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                message_count += 1;
                let test_msg = format!("Display Reply #{}", message_count);
                tracing::info!("AUTO-START: Sending test message: {}", test_msg);

                // Send to all connected peers
                let peers = match get_connected_peers(app_handle.clone()).await {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("AUTO-START: Failed to get peers: {}", e);
                        continue;
                    }
                };

                for peer in &peers {
                    if peer.id != peer_id {
                        match send_control_message(peer.id.clone(), test_msg.clone(), app_handle.clone()).await {
                            Ok(_) => {
                                tracing::info!("AUTO-START: Sent '{}' to {}", test_msg, peer.display_name);
                            }
                            Err(e) => {
                                tracing::warn!("AUTO-START: Failed to send to {}: {}", peer.display_name, e);
                            }
                        }
                    }
                }
            }
        }
    });
}

/// Get the auto-start mode
#[tauri::command]
pub fn get_auto_start_mode(app_handle: AppHandle) -> String {
    let mode = app_handle.state::<Arc<crate::AutoStartMode>>();
    let mode = **mode.inner();
    match mode {
        crate::AutoStartMode::Controller => "controller".to_string(),
        crate::AutoStartMode::Display => "display".to_string(),
        crate::AutoStartMode::None => "none".to_string(),
    }
}

// ============================================================================
// Media Cache Commands
// ============================================================================

use std::path::PathBuf;
use std::fs;
use std::io::Write;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MAX_CACHE_SIZE_MB: u64 = 500; // 500 MB max cache
const CACHE_DIR_NAME: &str = "media_cache";

/// Metadata for a cached media file
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MediaCacheEntry {
    file_path: String,
    updated_at: String,  // ISO 8601 timestamp
    last_accessed: String,  // ISO 8601 timestamp
    size: u64,
}

/// Cache state stored in Tauri Store
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MediaCacheState {
    entries: HashMap<String, MediaCacheEntry>,
    total_size: u64,
}

impl Default for MediaCacheState {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            total_size: 0,
        }
    }
}

/// Get the cache directory path
fn get_cache_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?
        .join(CACHE_DIR_NAME);

    // Create directory if it doesn't exist
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    Ok(cache_dir)
}

/// Load cache state from Tauri Store
async fn load_cache_state(app_handle: &AppHandle) -> Result<MediaCacheState, String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle.store("media_cache.json")
        .map_err(|e| format!("Failed to get store: {}", e))?;

    let entries: HashMap<String, MediaCacheEntry> = store
        .get("entries")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let total_size = store
        .get("total_size")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(0u64);

    Ok(MediaCacheState { entries, total_size })
}

/// Save cache state to Tauri Store
async fn save_cache_state(app_handle: &AppHandle, state: &MediaCacheState) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle.store("media_cache.json")
        .map_err(|e| format!("Failed to get store: {}", e))?;

    store.set("entries", serde_json::to_value(&state.entries).unwrap());
    store.set("total_size", serde_json::to_value(state.total_size).unwrap());
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Evict least recently used entries until cache is under limit
async fn evict_lru(
    app_handle: &AppHandle,
    mut state: MediaCacheState,
    _cache_dir: &PathBuf,
) -> Result<MediaCacheState, String> {
    const MAX_SIZE: u64 = MAX_CACHE_SIZE_MB * 1024 * 1024;

    while state.total_size > MAX_SIZE && !state.entries.is_empty() {
        // Find LRU entry
        let lru_id = state.entries
            .iter()
            .min_by_key(|(_, e)| e.last_accessed.clone())
            .map(|(id, _)| id.clone());

        if let Some(id) = lru_id {
            if let Some(entry) = state.entries.remove(&id) {
                // Delete file
                let _ = fs::remove_file(&entry.file_path);
                state.total_size = state.total_size.saturating_sub(entry.size);
                tracing::info!("Evicted media from cache: {} ({} bytes)", id, entry.size);
            }
        }
    }

    save_cache_state(app_handle, &state).await?;
    Ok(state)
}

/// Store a media file in the cache
#[tauri::command]
pub async fn cache_media(
    app_handle: AppHandle,
    media_id: String,
    updated_at: String,
    data: String,  // base64 encoded
) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    // Decode base64 data
    let file_data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let file_size = file_data.len() as u64;

    // Determine file extension from media_id or detect from base64 data
    let ext = if media_id.contains(".") {
        media_id.rsplit('.').next().unwrap_or("bin")
    } else {
        // Detect image type from base64 data signature (magic bytes)
        if data.starts_with("/9j/") {
            "jpg"      // JPEG
        } else if data.starts_with("iVBORw0K") {
            "png"      // PNG
        } else if data.starts_with("R0lGODlh") {
            "gif"      // GIF
        } else if data.starts_with("UklGR") {
            "webp"     // WebP
        } else {
            "bin"      // Unknown
        }
    };

    // Generate safe filename - only alphanumeric, dash, underscore, dot
    let safe_id = media_id.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '.', "_");
    // Sanitize timestamp: replace special chars with safe alternatives
    let safe_timestamp = updated_at
        .replace(':', "-")
        .replace('+', "_")
        .replace('.', "-");
    let file_path = cache_dir.join(format!("{}_{}.{}", safe_id, safe_timestamp, ext));

    tracing::info!("Caching media: {} with extension: {} -> {}", media_id, ext, file_path.display());

    // Check if already cached with same or newer version
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(existing) = state.entries.get(&media_id) {
        if existing.updated_at >= updated_at && existing.file_path == file_path.to_string_lossy() {
            // Already have this version or newer
            tracing::info!("Media already cached with current or newer version: {}", media_id);
            return Ok(existing.file_path.clone());
        }
        // Remove old version
        let _ = fs::remove_file(&existing.file_path);
        state.total_size = state.total_size.saturating_sub(existing.size);
        state.entries.remove(&media_id);
    }

    // Write file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&file_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Update cache state
    let now = chrono::Utc::now().to_rfc3339();
    let entry = MediaCacheEntry {
        file_path: file_path.to_string_lossy().to_string(),
        updated_at: updated_at.clone(),
        last_accessed: now.clone(),
        size: file_size,
    };

    state.entries.insert(media_id.clone(), entry);
    state.total_size += file_size;

    // Evict if needed
    let _ = evict_lru(&app_handle, state, &cache_dir).await?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Cache media from binary buffer (fetched from URL)
#[tauri::command]
pub async fn cache_media_from_buffer(
    app_handle: AppHandle,
    media_id: String,
    updated_at: String,
    buffer: Vec<u8>,
) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    let file_size = buffer.len() as u64;

    // Determine file extension from binary data magic bytes
    let ext = if media_id.contains(".") {
        media_id.rsplit('.').next().unwrap_or("bin").to_string()
    } else {
        // Detect image type from binary magic bytes
        match buffer.get(0..4) {
            Some([0xFF, 0xD8, 0xFF, ..]) => "jpg",   // JPEG
            Some([0x89, 0x50, 0x4E, 0x47]) => "png",  // PNG
            Some([0x47, 0x49, 0x46, 0x38]) => "gif",  // GIF
            Some([0x52, 0x49, 0x46, 0x46]) => "webp", // WebP (RIFF)
            Some(b"WEBP") => "webp",
            _ => "bin",
        }.to_string()
    };

    // Generate safe filename - only alphanumeric, dash, underscore, dot
    let safe_id = media_id.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '.', "_");
    // Sanitize timestamp: replace special chars with safe alternatives
    let safe_timestamp = updated_at
        .replace(':', "-")
        .replace('+', "_")
        .replace('.', "-");
    let file_path = cache_dir.join(format!("{}_{}.{}", safe_id, safe_timestamp, ext));

    tracing::info!("Caching media from buffer: {} with extension: {} -> {}", media_id, ext, file_path.display());

    // Check if already cached with same or newer version
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(existing) = state.entries.get(&media_id) {
        if existing.updated_at >= updated_at && existing.file_path == file_path.to_string_lossy() {
            // Already have this version or newer
            tracing::info!("Media already cached with current or newer version: {}", media_id);
            return Ok(existing.file_path.clone());
        }
        // Remove old version
        let _ = fs::remove_file(&existing.file_path);
        state.total_size = state.total_size.saturating_sub(existing.size);
        state.entries.remove(&media_id);
    }

    // Write file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&buffer)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Update cache state
    let now = chrono::Utc::now().to_rfc3339();
    let entry = MediaCacheEntry {
        file_path: file_path.to_string_lossy().to_string(),
        updated_at: updated_at.clone(),
        last_accessed: now.clone(),
        size: file_size,
    };

    state.entries.insert(media_id.clone(), entry);
    state.total_size += file_size;

    // Evict if needed
    let _ = evict_lru(&app_handle, state, &cache_dir).await?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Get a cached media file path
#[tauri::command]
pub async fn get_cached_media(
    app_handle: AppHandle,
    media_id: String,
) -> Result<Option<String>, String> {
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(entry) = state.entries.get(&media_id) {
        let file_path = entry.file_path.clone();

        // Update last accessed time
        if let Some(e) = state.entries.get_mut(&media_id) {
            e.last_accessed = chrono::Utc::now().to_rfc3339();
        }
        save_cache_state(&app_handle, &state).await?;

        // Check if file still exists
        if PathBuf::from(&file_path).exists() {
            return Ok(Some(file_path));
        }
    }

    Ok(None)
}

/// Clear all cached media
#[tauri::command]
pub async fn clear_media_cache(app_handle: AppHandle) -> Result<(), String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    // Remove all files in cache directory
    for entry in fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed to read cache dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        fs::remove_file(entry.path())
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }

    // Clear state
    let state = MediaCacheState::default();
    save_cache_state(&app_handle, &state).await?;

    tracing::info!("Media cache cleared");
    Ok(())
}

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats(app_handle: AppHandle) -> Result<CacheStats, String> {
    let state = load_cache_state(&app_handle).await?;

    Ok(CacheStats {
        entry_count: state.entries.len(),
        total_size: state.total_size,
        max_size: MAX_CACHE_SIZE_MB * 1024 * 1024,
    })
}

/// Test command to emit an event to the frontend (for debugging event system)
#[tauri::command]
pub async fn test_emit_event(app_handle: AppHandle, message: String) -> Result<(), String> {
    tracing::info!("test_emit_event called with message: {}", message);
    let payload = serde_json::json!({
        "message": message,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    tracing::info!("Emitting test-event: {}", payload);
    let _ = app_handle.emit("test-event", payload);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub entry_count: usize,
    pub total_size: u64,
    pub max_size: u64,
}
