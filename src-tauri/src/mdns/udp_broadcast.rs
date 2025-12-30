use super::discovery::DiscoveredDevice;
use std::net::{SocketAddr, UdpSocket};
use std::time::Duration;
use tracing::{info, error, warn};
use tokio::net::UdpSocket as TokioUdpSocket;

const DISCOVERY_PORT: u16 = 48488; // "MW" in hex + port offset
const BROADCAST_MESSAGE: &[u8] = b"MW-DISCOVER";
const RESPONSE_MESSAGE: &[u8] = b"MW-HERE";

/// Discover displays via UDP broadcast (fallback for networks that block mDNS)
pub async fn udp_broadcast_discover(timeout_secs: u64) -> Vec<DiscoveredDevice> {
    info!("Starting UDP broadcast discovery for {} seconds", timeout_secs);

    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to bind UDP socket for broadcast: {}", e);
            return Vec::new();
        }
    };

    socket.set_read_timeout(Some(Duration::from_secs(timeout_secs)))
        .map_err(|e| {
            error!("Failed to set socket read timeout: {}", e);
        })
        .ok();

    let broadcast_addr: SocketAddr = "255.255.255.255:48488".parse().unwrap();

    // Send broadcast message
    if let Err(e) = socket.send_to(BROADCAST_MESSAGE, broadcast_addr) {
        error!("Failed to send UDP broadcast: {}", e);
        return Vec::new();
    }

    info!("Sent UDP broadcast to {}", broadcast_addr);

    let mut devices = Vec::new();
    let mut buf = [0u8; 1024];
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    // Listen for responses
    while start.elapsed() < timeout {
        match socket.recv_from(&mut buf) {
            Ok((len, addr)) => {
                if len >= RESPONSE_MESSAGE.len()
                    && &buf[..RESPONSE_MESSAGE.len()] == RESPONSE_MESSAGE {
                    // Parse response: "MW-HERE<port>"
                    let response = String::from_utf8_lossy(&buf[RESPONSE_MESSAGE.len()..len]);
                    let port = response.trim().parse::<u16>().unwrap_or(8080);

                    info!("UDP broadcast response from {}: port {}", addr.ip(), port);

                    devices.push(DiscoveredDevice {
                        name: format!("Display@{}", addr.ip()),
                        host: addr.ip().to_string(),
                        port,
                        service_type: "udp-broadcast".to_string(),
                        device_id: None, // UDP broadcast doesn't include device ID
                    });
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                break; // Timeout
            }
            Err(e) => {
                warn!("Error receiving UDP broadcast response: {}", e);
            }
        }
    }

    info!("UDP broadcast discovery complete, found {} devices", devices.len());
    devices
}

/// Start a UDP broadcast listener that responds to discovery requests
/// This should be called on the display (Android TV) side
pub fn start_udp_listener(port: u16, ws_port: u16) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let socket = match TokioUdpSocket::bind(&format!("0.0.0.0:{}", port)).await {
            Ok(s) => s,
            Err(e) => {
                // If port is in use, it's likely another instance already has the listener
                warn!("UDP listener port {} already in use (another instance may be running): {}", port, e);
                return;
            }
        };

        info!("UDP broadcast listener started on port {}", port);

        let mut buf = [0u8; 1024];

        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, addr)) => {
                    if len == BROADCAST_MESSAGE.len()
                        && &buf[..len] == BROADCAST_MESSAGE {
                        info!("Received discovery request from {}", addr);

                        // Respond with our WebSocket port
                        let response = format!("{}{}", String::from_utf8_lossy(RESPONSE_MESSAGE), ws_port);
                        if let Err(e) = socket.send_to(response.as_bytes(), addr).await {
                            error!("Failed to send UDP response to {}: {}", addr, e);
                        }
                    }
                }
                Err(e) => {
                    error!("UDP listener error: {}", e);
                }
            }
        }
    })
}
