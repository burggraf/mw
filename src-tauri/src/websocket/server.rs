//! WebSocket server for real-time display updates
//!
//! This module implements a WebSocket server that broadcasts:
//! - Lyrics updates when songs are displayed
//! - Slide navigation changes
//! - Background media changes

use crate::websocket::types::WsMessage;
use futures_channel::mpsc::{unbounded, UnboundedSender};
use futures_util::stream::StreamExt;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

type Tx = UnboundedSender<Message>;

/// WebSocket server instance
///
/// Manages connected display clients and broadcasts real-time updates
/// for lyrics, slide navigation, and background changes.
pub struct WebSocketServer {
    /// Map of connected clients by their socket address
    clients: Arc<Mutex<HashMap<SocketAddr, Tx>>>,
    /// The port the server is listening on
    port: u16,
}

impl WebSocketServer {
    /// Create a new WebSocket server instance
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            port: 0,
        }
    }

    /// Start the WebSocket server on the specified port
    ///
    /// # Arguments
    /// * `port` - The port to listen on (use 0 for OS-assigned port)
    ///
    /// # Returns
    /// The actual bound port
    pub async fn start(&mut self, port: u16) -> Result<u16, String> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

        let actual_port = listener.local_addr()
            .map_err(|e| format!("Failed to get local address: {}", e))?
            .port();

        self.port = actual_port;
        let clients = self.clients.clone();

        tracing::info!("WebSocket server listening on 0.0.0.0:{}", actual_port);

        // Spawn the accept loop in a background task
        tokio::spawn(async move {
            accept_loop(listener, clients).await;
        });

        Ok(actual_port)
    }

    /// Broadcast a message to all connected clients
    ///
    /// # Arguments
    /// * `message` - The message to broadcast
    ///
    /// # Returns
    /// Ok if message was sent to at least one client, Err if serialization failed
    pub async fn broadcast(&self, message: WsMessage) -> Result<(), String> {
        // Serialize the message to JSON
        let json = serde_json::to_string(&message)
            .map_err(|e| format!("Failed to serialize message: {}", e))?;

        let ws_message = Message::Text(json);
        let mut clients = self.clients.lock().await;

        // Send to all connected clients, removing any that have disconnected
        let mut disconnected = Vec::new();
        for (addr, tx) in clients.iter() {
            if let Err(_) = tx.unbounded_send(ws_message.clone()) {
                disconnected.push(*addr);
            }
        }

        // Remove disconnected clients
        for addr in disconnected {
            tracing::debug!("Removing disconnected client: {}", addr);
            clients.remove(&addr);
        }

        if !clients.is_empty() {
            tracing::debug!("Broadcasted message to {} client(s)", clients.len());
        }

        Ok(())
    }

    /// Get the port the server is listening on
    ///
    /// # Returns
    /// The port number, or 0 if the server hasn't been started
    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Default for WebSocketServer {
    fn default() -> Self {
        Self::new()
    }
}

/// Accept incoming WebSocket connections
async fn accept_loop(listener: TcpListener, clients: Arc<Mutex<HashMap<SocketAddr, Tx>>>) {
    while let Ok((stream, addr)) = listener.accept().await {
        tracing::info!("New connection from {}", addr);

        let clients_clone = clients.clone();

        // Spawn a task to handle this connection
        tokio::spawn(async move {
            if let Err(e) = handle_connection(stream, addr, clients_clone).await {
                tracing::error!("Error handling connection from {}: {}", addr, e);
            }
        });
    }
}

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    clients: Arc<Mutex<HashMap<SocketAddr, Tx>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Callback to verify the WebSocket handshake
    let callback = |req: &Request, response: Response| {
        tracing::debug!("WebSocket handshake from {:?}", req);
        Ok(response)
    };

    // Accept the WebSocket connection
    let ws_stream = accept_hdr_async(stream, callback).await?;
    let (ws_sender, mut ws_receiver) = ws_stream.split();

    // Create an unbounded channel for sending messages to this client
    let (tx, mut rx) = unbounded();

    // Add the client to the clients map
    {
        let mut clients_guard = clients.lock().await;
        clients_guard.insert(addr, tx);
        tracing::info!("Client {} added. Total clients: {}", addr, clients_guard.len());
    }

    // Spawn a task to forward messages from the channel to the WebSocket
    let forward_task = tokio::spawn(async move {
        use futures_util::sink::SinkExt;
        let mut ws_sender = ws_sender;
        while let Some(msg) = rx.next().await {
            if let Err(e) = ws_sender.send(msg).await {
                tracing::error!("Error forwarding messages to {}: {}", addr, e);
                break;
            }
        }
    });

    // Handle incoming messages from the client
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(Message::Ping(_msg)) => {
                tracing::trace!("Received ping from {}", addr);
                // Pongs are handled automatically by tungstenite
            }
            Ok(Message::Pong(_)) => {
                tracing::trace!("Received pong from {}", addr);
            }
            Ok(Message::Close(_)) => {
                tracing::info!("Client {} initiated close", addr);
                break;
            }
            Ok(Message::Text(text)) => {
                tracing::trace!("Received text from {}: {}", addr, text);
                // We don't expect clients to send text messages in this implementation
            }
            Ok(Message::Binary(data)) => {
                tracing::trace!("Received binary data from {}: {} bytes", addr, data.len());
            }
            Ok(_) => {
                // Handle any other message types (Frame, etc.)
            }
            Err(e) => {
                tracing::error!("Error receiving from {}: {}", addr, e);
                break;
            }
        }
    }

    // Remove the client from the map
    {
        let mut clients_guard = clients.lock().await;
        clients_guard.remove(&addr);
        tracing::info!("Client {} removed. Total clients: {}", addr, clients_guard.len());
    }

    // Abort the forward task
    forward_task.abort();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_websocket_server_creation() {
        let server = WebSocketServer::new();
        assert_eq!(server.port(), 0);
        assert_eq!(server.clients.lock().await.len(), 0);
    }

    #[tokio::test]
    async fn test_websocket_server_default() {
        let server = WebSocketServer::default();
        assert_eq!(server.port(), 0);
    }

    #[tokio::test]
    async fn test_broadcast_with_no_clients() {
        let server = WebSocketServer::new();
        let message = WsMessage::Ping;

        // Broadcasting with no clients should not fail
        let result = server.broadcast(message).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_port_getter() {
        let mut server = WebSocketServer::new();
        assert_eq!(server.port(), 0);

        // After starting, port should be set (we use 0 to get OS-assigned port)
        let result = server.start(0).await;
        assert!(result.is_ok());

        let port = result.unwrap();
        assert!(port > 0);
        assert_eq!(server.port(), port);
    }
}
