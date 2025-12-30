use crate::nats::{client::NatsClient, types::LyricsMessage, types::SlideMessage};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, error, debug};

/// Global NATS client state
pub struct NatsState {
    client: Arc<Mutex<Option<NatsClient>>>,
}

impl NatsState {
    /// Create a new NATS state
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
        }
    }

    /// Connect to a NATS server
    pub async fn connect(&self, url: String) -> Result<(), String> {
        info!("Connecting to NATS server at {}", url);

        let mut client_guard = self.client.lock().await;
        let mut client = NatsClient::new();

        client.connect(url).await?;
        *client_guard = Some(client);

        info!("Connected to NATS server");
        Ok(())
    }

    /// Check if connected to a NATS server
    pub async fn is_connected(&self) -> bool {
        let client_guard = self.client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            client.is_connected().await
        } else {
            false
        }
    }

    /// Get the current server URL
    pub async fn server_url(&self) -> Option<String> {
        let client_guard = self.client.lock().await;
        if let Some(client) = client_guard.as_ref() {
            client.server_url().await
        } else {
            None
        }
    }

    /// Publish lyrics to all connected displays
    pub async fn publish_lyrics(&self, lyrics: LyricsMessage) -> Result<(), String> {
        let client_guard = self.client.lock().await;
        let client = client_guard
            .as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        client.publish_lyrics(lyrics).await
    }

    /// Publish slide update to all connected displays
    pub async fn publish_slide(&self, slide: SlideMessage) -> Result<(), String> {
        let client_guard = self.client.lock().await;
        let client = client_guard
            .as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        client.publish_slide(slide).await
    }

    /// Subscribe to lyrics updates
    ///
    /// Note: This spawns a background task that will invoke Tauri events
    /// when lyrics are received. The Tauri app handle is needed for this.
    pub async fn subscribe_lyrics(
        &self,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let client_guard = self.client.lock().await;
        let client = client_guard
            .as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?
            .clone();

        // We need to drop the lock before spawning the task
        drop(client_guard);

        // Clone the client for the spawned task
        // Note: NatsClient doesn't implement Clone, so we need a different approach
        // For now, let's return an error indicating this needs to be implemented properly

        error!("subscribe_lyrics: NatsClient doesn't support cloning yet - need to refactor");
        Err("Subscription not yet implemented - needs client refactoring".to_string())
    }

    /// Disconnect from the NATS server
    pub async fn disconnect(&self) -> Result<(), String> {
        info!("Disconnecting from NATS server");

        let mut client_guard = self.client.lock().await;
        *client_guard = None;

        info!("Disconnected from NATS server");
        Ok(())
    }
}

impl Default for NatsState {
    fn default() -> Self {
        Self::new()
    }
}
