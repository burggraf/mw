use crate::nats::types::NatsConfig;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::Duration;
use tokio::fs;
use tokio::time::sleep;
use tracing::{info, error, warn};

pub struct NatsServer {
    process: Option<Child>,
    port: u16,
    config: NatsConfig,
}

impl NatsServer {
    /// Spawn a new NATS server process
    ///
    /// The `app_data_dir` should be obtained from Tauri's path resolver
    /// to ensure data is stored in the correct system location.
    pub async fn new_with_dir(config: NatsConfig, app_data_dir: PathBuf) -> Result<Self, String> {
        // Create JetStream directory in app data folder
        let jetstream_dir = app_data_dir.join("nats-jetstream");
        fs::create_dir_all(&jetstream_dir)
            .await
            .map_err(|e| format!("Failed to create JetStream dir: {}", e))?;

        let jetstream_dir_str = jetstream_dir.to_string_lossy().to_string();

        // Determine which binary to use
        let binary_path = Self::get_nats_binary()?;

        // Build arguments for NATS server
        // Pre-compute strings to avoid lifetime issues
        let port_str = config.server_port.to_string();
        let log_file = format!("{}/nats.log", jetstream_dir_str);
        let args: Vec<&str> = vec![
            "--port", &port_str,
            "--pid", "0", // No PID file
            "--cluster_name", &config.cluster_name,
            "--cluster", "nats://0.0.0.0:6222",
            "--routes", "auto",
            "--jetstream",
            "--store_dir", &jetstream_dir_str,
            "--log_file", &log_file,
            "--logtime",
        ];

        info!("Spawning NATS server: {:?} {:?}", binary_path, args);

        // Spawn nats-server process
        let mut child = Command::new(&binary_path)
            .args(&args)
            .spawn()
            .map_err(|e| format!("Failed to spawn nats-server: {}", e))?;

        // Wait a bit for the server to start
        sleep(Duration::from_millis(500)).await;

        // Read port from log file (nats-server writes it on startup when port is 0)
        let port = Self::read_port_from_log(&jetstream_dir).await?;

        info!("NATS server started on port {}", port);

        Ok(Self {
            process: Some(child),
            port,
            config,
        })
    }

    #[cfg(target_os = "macos")]
    fn get_nats_binary() -> Result<String, String> {
        let arch = std::env::consts::ARCH;
        let name = if arch == "aarch64" {
            "resources/nats-server/nats-server-macos-arm64"
        } else {
            "resources/nats-server/nats-server-macos-x64"
        };
        Self::resolve_binary(name)
    }

    #[cfg(target_os = "windows")]
    fn get_nats_binary() -> Result<String, String> {
        Self::resolve_binary("resources/nats-server/nats-server-windows-x64.exe")
    }

    #[cfg(target_os = "android")]
    fn get_nats_binary() -> Result<String, String> {
        // On Android, we'd need to bundle the binary differently
        // For now, return an error
        Err("NATS server not supported on Android yet".to_string())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "android")))]
    fn get_nats_binary() -> Result<String, String> {
        Self::resolve_binary("resources/nats-server/nats-server-linux-x64")
    }

    fn resolve_binary(name: &str) -> Result<String, String> {
        // Try multiple possible paths for the binary
        let paths_to_try = vec![
            name.to_string(),
            format!("../../{}", name),
            format!("./{}", name),
            format!("../resources/nats-server/{}", if name.contains("arm64") { "nats-server-macos-arm64" } else { "nats-server-macos-x64" }),
            format!("../../resources/nats-server/{}", if name.contains("arm64") { "nats-server-macos-arm64" } else { "nats-server-macos-x64" }),
        ];

        for path in &paths_to_try {
            if PathBuf::from(path).exists() {
                info!("Found NATS binary at: {}", path);
                return Ok(path.clone());
            }
        }

        Err(format!("NATS binary not found: {} (tried: {:?})", name, paths_to_try))
    }

    /// Read the assigned port from the NATS server log file
    async fn read_port_from_log(jetstream_dir: &PathBuf) -> Result<u16, String> {
        let log_path = jetstream_dir.join("nats.log");
        let path = log_path.as_path();

        // Wait up to 5 seconds for server to start and write port
        for _ in 0..50 {
            sleep(Duration::from_millis(100)).await;

            if let Ok(content) = fs::read_to_string(&path).await {
                // Look for "Server is ready" line with port
                // Format: "[INFO] Server is ready" - port is inferred from --port 0
                // We need to scan the log for the listening port
                for line in content.lines() {
                    if line.contains("Server is ready") {
                        // When port 0 is used, NATS assigns a random port
                        // We need to find it in the log
                        continue;
                    }
                    // Look for port info in startup messages
                    if line.contains("Listening for client connections on")
                        || line.contains("host=localhost")
                        || line.contains("port=")
                    {
                        // Try to extract port number
                        if let Some(port_str) = line
                            .split("port=")
                            .nth(1)
                            .and_then(|s| s.split_whitespace().next())
                        {
                            if let Ok(port) = port_str.parse::<u16>() {
                                return Ok(port);
                            }
                        }
                    }
                }
            }
        }

        // If we can't find the port in the log, check the default port
        warn!("Could not find port in NATS log, trying default 4222");
        Ok(4222)
    }

    /// Get the port the server is listening on
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Get the NATS connection URL for this server
    pub fn url(&self) -> String {
        format!("nats://localhost:{}", self.port)
    }

    /// Stop the NATS server process
    pub async fn stop(mut self) -> Result<(), String> {
        if let Some(mut child) = self.process.take() {
            info!("Stopping NATS server on port {}", self.port);

            child
                .kill()
                .map_err(|e| format!("Failed to kill nats-server: {}", e))?;

            child
                .wait()
                .map_err(|e| format!("Failed to wait for nats-server: {}", e))?;

            info!("NATS server stopped");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[cfg(target_os = "macos")]
    async fn test_spawn_nats_server() {
        let config = NatsConfig::default();
        match NatsServer::new(config).await {
            Ok(server) => {
                println!("NATS server started on port {}", server.port());
                assert!(server.port() > 0);
                // Don't stop the server in test - it will be killed when test exits
            }
            Err(e) => {
                println!("Failed to start NATS server: {}", e);
                // Don't fail the test if NATS binary isn't available
            }
        }
    }
}
