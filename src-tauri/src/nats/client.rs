use async_nats::Client;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, debug};
use futures_util::stream::StreamExt;
use crate::nats::types::{LyricsMessage, SlideMessage, DiscoveredNode};

/// NATS client wrapper for managing connection and subscriptions
pub struct NatsClient {
    client: Option<Client>,
    server_url: Arc<RwLock<Option<String>>>,
}

impl NatsClient {
    pub fn new() -> Self {
        Self {
            client: None,
            server_url: Arc::new(RwLock::new(None)),
        }
    }

    /// Connect to a NATS server
    pub async fn connect(&mut self, url: String) -> Result<(), String> {
        info!("Connecting to NATS server at {}", url);

        let client = async_nats::connect(url.clone())
            .await
            .map_err(|e| format!("Failed to connect to NATS: {}", e))?;

        self.client = Some(client);
        *self.server_url.write().await = Some(url);

        info!("Connected to NATS server");
        Ok(())
    }

    /// Connect to any available NATS cluster node
    pub async fn connect_to_cluster(&mut self, nodes: Vec<DiscoveredNode>) -> Result<(), String> {
        if nodes.is_empty() {
            return Err("No NATS nodes available".to_string());
        }

        // Try each node until one connects
        for node in nodes {
            let url = format!("nats://{}:{}", node.host, node.port);
            match self.connect(url.clone()).await {
                Ok(_) => return Ok(()),
                Err(_) => {
                    debug!("Failed to connect to {}, trying next...", url);
                    continue;
                }
            }
        }

        Err("Failed to connect to any NATS node".to_string())
    }

    /// Check if connected to a NATS server
    pub async fn is_connected(&self) -> bool {
        self.client.is_some()
    }

    /// Publish lyrics to all connected displays
    pub async fn publish_lyrics(&self, lyrics: LyricsMessage) -> Result<(), String> {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let payload = serde_json::to_vec(&lyrics)
            .map_err(|e| format!("Failed to serialize lyrics: {}", e))?;

        client
            .publish("lyrics.current", payload.into())
            .await
            .map_err(|e| format!("Failed to publish lyrics: {}", e))?;

        debug!("Published lyrics: {}", lyrics.title);
        Ok(())
    }

    /// Publish slide update to all connected displays
    pub async fn publish_slide(&self, slide: SlideMessage) -> Result<(), String> {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let payload = serde_json::to_vec(&slide)
            .map_err(|e| format!("Failed to serialize slide: {}", e))?;

        client
            .publish("slide.update", payload.into())
            .await
            .map_err(|e| format!("Failed to publish slide: {}", e))?;

        debug!("Published slide update: song={}, slide={}", slide.song_id, slide.slide_index);
        Ok(())
    }

    /// Subscribe to lyrics updates
    pub async fn subscribe_lyrics<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(LyricsMessage) + Send + 'static,
    {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let mut subscriber = client
            .subscribe("lyrics.current")
            .await
            .map_err(|e| format!("Failed to subscribe to lyrics: {}", e))?;

        tokio::spawn(async move {
            while let Some(msg) = subscriber.next().await {
                if let Ok(lyrics) = serde_json::from_slice::<LyricsMessage>(msg.payload.as_ref()) {
                    callback(lyrics);
                }
            }
        });

        info!("Subscribed to lyrics updates");
        Ok(())
    }

    /// Subscribe to slide updates
    pub async fn subscribe_slides<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(SlideMessage) + Send + 'static,
    {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let mut subscriber = client
            .subscribe("slide.update")
            .await
            .map_err(|e| format!("Failed to subscribe to slides: {}", e))?;

        tokio::spawn(async move {
            while let Some(msg) = subscriber.next().await {
                if let Ok(slide) = serde_json::from_slice::<SlideMessage>(msg.payload.as_ref()) {
                    callback(slide);
                }
            }
        });

        info!("Subscribed to slide updates");
        Ok(())
    }

    /// Get the current server URL
    pub async fn server_url(&self) -> Option<String> {
        self.server_url.read().await.clone()
    }
}

impl Default for NatsClient {
    fn default() -> Self {
        Self::new()
    }
}
