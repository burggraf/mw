/// Simple TCP-based P2P communication
/// Much simpler than WebRTC for local LAN use cases

use crate::webrtc::types::PeerInfo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

/// TCP P2P message types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TcpMessage {
    /// Register this connection with a peer ID
    Register { peer_id: Uuid },
    /// Data payload
    Data { message: String },
    /// Keepalive
    Ping,
    /// Keepalive response
    Pong,
}

/// Represents an active TCP connection to a peer
pub struct TcpPeerConnection {
    pub peer_id: Uuid,
    pub peer_info: PeerInfo,
    pub sender: mpsc::UnboundedSender<String>,
}

/// TCP P2P Manager
///
/// - Displays: Start a TCP server that controllers connect to
/// - Controllers: Connect to displays via TCP
/// - Messages flow over persistent TCP connections
pub struct TcpP2pManager {
    /// Active TCP connections (outbound for controllers, inbound for displays)
    connections: Arc<RwLock<HashMap<Uuid, TcpPeerConnection>>>,

    /// My peer ID
    my_peer_id: Uuid,

    /// My peer info
    my_peer_info: Arc<Mutex<Option<PeerInfo>>>,

    /// Port for TCP server (displays only)
    server_port: u16,

    /// TCP server handle (for displays)
    server_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,

    /// Callback for received messages
    on_message: Arc<Mutex<Option<Box<dyn Fn(String, Uuid) + Send + Sync>>>>,

    /// Callback for connection established
    on_connected: Arc<Mutex<Option<Box<dyn Fn(Uuid) + Send + Sync>>>>,

    /// Callback for connection closed
    on_disconnected: Arc<Mutex<Option<Box<dyn Fn(Uuid) + Send + Sync>>>>,
}

impl TcpP2pManager {
    pub fn new(my_peer_id: Uuid, server_port: u16) -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            my_peer_id,
            my_peer_info: Arc::new(Mutex::new(None)),
            server_port,
            server_handle: Arc::new(Mutex::new(None)),
            on_message: Arc::new(Mutex::new(None)),
            on_connected: Arc::new(Mutex::new(None)),
            on_disconnected: Arc::new(Mutex::new(None)),
        }
    }

    /// Set my peer info
    pub async fn set_my_info(&self, info: PeerInfo) {
        *self.my_peer_info.lock().await = Some(info);
    }

    /// Set callback for received messages
    pub async fn on_message<F>(&self, callback: F)
    where
        F: Fn(String, Uuid) + Send + Sync + 'static,
    {
        *self.on_message.lock().await = Some(Box::new(callback));
    }

    /// Set callback for connection established
    pub async fn on_connected<F>(&self, callback: F)
    where
        F: Fn(Uuid) + Send + Sync + 'static,
    {
        *self.on_connected.lock().await = Some(Box::new(callback));
    }

    /// Set callback for connection closed
    pub async fn on_disconnected<F>(&self, callback: F)
    where
        F: Fn(Uuid) + Send + Sync + 'static,
    {
        *self.on_disconnected.lock().await = Some(Box::new(callback));
    }

    /// Start TCP server (for displays)
    /// Returns the actual port bound
    pub async fn start_server(&self) -> Result<u16, Box<dyn std::error::Error + Send>> {
        let addr = format!("0.0.0.0:{}", self.server_port);
        let listener = TcpListener::bind(&addr).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        let actual_port = listener.local_addr()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?
            .port();

        tracing::info!("TCP P2P server listening on {}", actual_port);

        let connections = self.connections.clone();
        let on_message = self.on_message.clone();
        let on_connected = self.on_connected.clone();
        let on_disconnected = self.on_disconnected.clone();

        let handle = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        tracing::info!("TCP P2P: New connection from {}", addr);
                        let connections_clone = connections.clone();
                        let on_message_clone = on_message.clone();
                        let on_connected_clone = on_connected.clone();
                        let on_disconnected_clone = on_disconnected.clone();

                        tokio::spawn(async move {
                            // Handle the connection - it handles its own cleanup
                            if let Err(e) = Self::handle_inbound_connection(
                                stream,
                                addr,
                                connections_clone,
                                on_message_clone,
                                on_connected_clone,
                                on_disconnected_clone,
                            ).await {
                                tracing::error!("TCP P2P: Error handling connection from {}: {}", addr, e);
                            } else {
                                tracing::info!("TCP P2P: Connection from {} closed gracefully", addr);
                            }
                        });
                    }
                    Err(e) => {
                        tracing::error!("TCP P2P: Error accepting connection: {}", e);
                    }
                }
            }
        });

        *self.server_handle.lock().await = Some(handle);
        Ok(actual_port)
    }

    /// Handle an inbound TCP connection (display side)
    async fn handle_inbound_connection(
        stream: TcpStream,
        addr: SocketAddr,
        connections: Arc<RwLock<HashMap<Uuid, TcpPeerConnection>>>,
        on_message: Arc<Mutex<Option<Box<dyn Fn(String, Uuid) + Send + Sync>>>>,
        on_connected: Arc<Mutex<Option<Box<dyn Fn(Uuid) + Send + Sync>>>>,
        on_disconnected: Arc<Mutex<Option<Box<dyn Fn(Uuid) + Send + Sync>>>>,
    ) -> Result<(), Box<dyn std::error::Error + Send>> {
        // Read registration message first
        let mut stream = stream;
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        let len = u32::from_be_bytes(len_buf) as usize;

        if len > 10000 {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Message too large: {}", len)
            )) as Box<dyn std::error::Error + Send>);
        }

        let mut msg_buf = vec![0u8; len];
        stream.read_exact(&mut msg_buf).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        let msg_str = String::from_utf8(msg_buf)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        let msg: TcpMessage = serde_json::from_str(&msg_str)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;

        let peer_id = match msg {
            TcpMessage::Register { peer_id } => peer_id,
            _ => return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "First message must be Register"
            )) as Box<dyn std::error::Error + Send>),
        };

        tracing::info!("TCP P2P: Registered peer {} from {}", peer_id, addr);

        // Create channel for sending messages to this peer
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // Store the connection
        {
            let mut connections = connections.write().await;
            connections.insert(peer_id, TcpPeerConnection {
                peer_id,
                peer_info: PeerInfo {
                    id: peer_id.to_string(),
                    peer_type: crate::webrtc::PeerType::Controller, // Inbound connections are from controllers
                    display_name: format!("TCP Peer {}", peer_id),
                    is_connected: true,
                    is_leader: false,
                },
                sender: tx,
            });
        }

        // Notify connected
        if let Some(ref cb) = *on_connected.lock().await {
            cb(peer_id);
        }

        // Clone references for the tasks
        let on_message_clone = on_message.clone();
        let on_disconnected_clone = on_disconnected.clone();
        let connections_clone = connections.clone();

        // Use select! to handle both reading from network and writing from channel
        loop {
            tokio::select! {
                // Check for messages to send
                msg_to_send = rx.recv() => {
                    match msg_to_send {
                        Some(msg) => {
                            // Wrap the message in TcpMessage::Data for proper protocol
                            let data_msg = TcpMessage::Data { message: msg };
                            if let Err(e) = Self::send_json(&mut stream, &data_msg).await {
                                tracing::error!("TCP P2P: Failed to send message to {}: {}", peer_id, e);
                                break;
                            }
                        }
                        None => {
                            // Channel closed, exit loop
                            break;
                        }
                    }
                }
                // Read from network
                read_result = Self::recv_message_raw(&mut stream) => {
                    match read_result {
                        Ok(msg_str) => {
                            if let Ok(msg) = serde_json::from_str::<TcpMessage>(&msg_str) {
                                match msg {
                                    TcpMessage::Data { message } => {
                                        if let Some(ref cb) = *on_message_clone.lock().await {
                                            cb(message, peer_id);
                                        }
                                    }
                                    TcpMessage::Ping => {
                                        // Respond with pong
                                        let pong = TcpMessage::Pong;
                                        if let Err(e) = Self::send_json(&mut stream, &pong).await {
                                            tracing::warn!("TCP P2P: Failed to send pong: {}", e);
                                            break;
                                        }
                                    }
                                    TcpMessage::Pong => {
                                        // Ignore
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Err(e) => {
                            tracing::debug!("TCP P2P: Connection closed by {}: {}", addr, e);
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup on disconnect
        {
            let mut conns = connections_clone.write().await;
            conns.remove(&peer_id);
        }
        if let Some(ref cb) = *on_disconnected_clone.lock().await {
            cb(peer_id);
        }

        Ok(())
    }

    /// Connect to a peer (controller side)
    pub async fn connect_to_peer(
        &self,
        peer_id: Uuid,
        peer_info: PeerInfo,
        host: &str,
        port: u16,
    ) -> Result<(), Box<dyn std::error::Error + Send>> {
        // Check if already connected
        {
            let conns = self.connections.read().await;
            if conns.contains_key(&peer_id) {
                tracing::info!("TCP P2P: Already connected to {}", peer_id);
                return Ok(());
            }
        }

        let addr = format!("{}:{}", host, port);
        tracing::info!("TCP P2P: Connecting to {} ({})", addr, peer_info.display_name);

        let mut stream = TcpStream::connect(&addr).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        tracing::info!("TCP P2P: Connected to {}", addr);

        // Send registration
        let register = TcpMessage::Register { peer_id: self.my_peer_id };
        Self::send_json(&mut stream, &register).await?;

        // Spawn task to handle this connection
        let connections = self.connections.clone();
        let on_message = self.on_message.clone();
        let on_connected = self.on_connected.clone();
        let on_disconnected = self.on_disconnected.clone();
        let peer_info_clone = peer_info.clone();

        tokio::spawn(async move {
            tracing::info!("TCP P2P: Controller connection task started for {}", peer_id);

            // Create channel for sending
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();

            // Store the connection
            {
                let mut connections = connections.write().await;
                connections.insert(peer_id, TcpPeerConnection {
                    peer_id,
                    peer_info: peer_info_clone.clone(),
                    sender: tx,
                });
            }

            // Notify connected
            if let Some(ref cb) = *on_connected.lock().await {
                cb(peer_id);
            }

            tracing::info!("TCP P2P: Controller connection task entering loop for {}", peer_id);

            // Use select! to handle both reading from network and writing from channel
            loop {
                tokio::select! {
                    // Check for messages to send
                    msg_to_send = rx.recv() => {
                        match msg_to_send {
                            Some(msg) => {
                                // Wrap the message in TcpMessage::Data for proper protocol
                                let data_msg = TcpMessage::Data { message: msg };
                                if let Err(e) = Self::send_json(&mut stream, &data_msg).await {
                                    tracing::error!("TCP P2P: Failed to send to {}: {}", peer_id, e);
                                    break;
                                }
                            }
                            None => {
                                // Channel closed, exit loop
                                tracing::warn!("TCP P2P: Channel closed for {}, exiting loop", peer_id);
                                break;
                            }
                        }
                    }
                    // Read from network
                    read_result = Self::recv_message_raw(&mut stream) => {
                        match read_result {
                            Ok(msg_str) => {
                                if let Ok(msg) = serde_json::from_str::<TcpMessage>(&msg_str) {
                                    match msg {
                                        TcpMessage::Data { message } => {
                                            if let Some(ref cb) = *on_message.lock().await {
                                                cb(message, peer_id);
                                            }
                                        }
                                        TcpMessage::Ping => {
                                            let pong = TcpMessage::Pong;
                                            if let Err(e) = Self::send_json(&mut stream, &pong).await {
                                                tracing::warn!("TCP P2P: Failed to send pong: {}", e);
                                                break;
                                            }
                                        }
                                        TcpMessage::Pong => {
                                            // Ignore
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("TCP P2P: Connection to {} closed, exiting loop: {}", peer_id, e);
                                break;
                            }
                        }
                    }
                }
            }

            tracing::warn!("TCP P2P: Controller connection task loop ended for {}", peer_id);

            // Cleanup
            {
                let mut connections = connections.write().await;
                connections.remove(&peer_id);
            }
            if let Some(ref cb) = *on_disconnected.lock().await {
                cb(peer_id);
            }
        });

        Ok(())
    }

    /// Send a message to a peer
    pub async fn send_message(&self, peer_id: Uuid, message: String) -> Result<(), String> {
        let connections = self.connections.read().await;
        if let Some(conn) = connections.get(&peer_id) {
            if let Err(e) = conn.sender.send(message) {
                return Err(format!("Failed to queue message: {}", e));
            }
            Ok(())
        } else {
            Err(format!("Peer {} not connected", peer_id))
        }
    }

    /// Send a message to all connected peers
    pub async fn broadcast(&self, message: String) {
        let connections = self.connections.read().await;
        for (peer_id, conn) in connections.iter() {
            if let Err(e) = conn.sender.send(message.clone()) {
                tracing::warn!("TCP P2P: Failed to broadcast to {}: {}", peer_id, e);
            }
        }
    }

    /// Get all connected peers
    pub async fn get_connected_peers(&self) -> Vec<PeerInfo> {
        let connections = self.connections.read().await;
        connections.values().map(|c| c.peer_info.clone()).collect()
    }

    /// Check if a peer is connected
    pub async fn is_connected(&self, peer_id: Uuid) -> bool {
        let connections = self.connections.read().await;
        connections.contains_key(&peer_id)
    }

    /// Disconnect a peer
    pub async fn disconnect(&self, peer_id: Uuid) {
        let mut connections = self.connections.write().await;
        connections.remove(&peer_id);
        tracing::info!("TCP P2P: Disconnected peer {}", peer_id);
    }

    /// Stop the server
    pub async fn stop_server(&self) {
        if let Some(handle) = self.server_handle.lock().await.take() {
            handle.abort();
        }
    }

    /// Helper: Send a JSON message
    async fn send_json<W>(stream: &mut W, msg: &TcpMessage) -> Result<(), Box<dyn std::error::Error + Send>>
    where
        W: AsyncWriteExt + Unpin,
    {
        let json = serde_json::to_string(msg)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        Self::send_message_raw(stream, &json).await
    }

    /// Helper: Send a message with length prefix
    async fn send_message_raw<W>(stream: &mut W, msg: &str) -> Result<(), Box<dyn std::error::Error + Send>>
    where
        W: AsyncWriteExt + Unpin,
    {
        let bytes = msg.as_bytes();
        let len = bytes.len() as u32;

        let mut buf = Vec::with_capacity(4 + bytes.len());
        buf.extend_from_slice(&len.to_be_bytes());
        buf.extend_from_slice(bytes);

        stream.write_all(&buf).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        stream.flush().await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        Ok(())
    }

    /// Helper: Receive a message with length prefix
    async fn recv_message_raw<R>(stream: &mut R) -> Result<String, Box<dyn std::error::Error + Send>>
    where
        R: AsyncReadExt + Unpin,
    {
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        let len = u32::from_be_bytes(len_buf) as usize;

        if len > 10_000_000 {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Message too large"
            )) as Box<dyn std::error::Error + Send>);
        }

        let mut msg_buf = vec![0u8; len];
        stream.read_exact(&mut msg_buf).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)?;
        String::from_utf8(msg_buf)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send>)
    }
}

impl Clone for TcpP2pManager {
    fn clone(&self) -> Self {
        Self {
            connections: self.connections.clone(),
            my_peer_id: self.my_peer_id,
            my_peer_info: self.my_peer_info.clone(),
            server_port: self.server_port,
            server_handle: self.server_handle.clone(),
            on_message: self.on_message.clone(),
            on_connected: self.on_connected.clone(),
            on_disconnected: self.on_disconnected.clone(),
        }
    }
}
