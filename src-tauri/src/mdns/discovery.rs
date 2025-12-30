use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, error};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDevice {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub service_type: String,
}

/// Discover Mobile Worship display devices via mDNS
pub async fn discover_disdevices(timeout_secs: u64) -> Vec<DiscoveredDevice> {
    info!("Starting mDNS discovery for {} seconds", timeout_secs);

    let service_type = "_mw-display._tcp.local.";

    // Create a service daemon for browsing
    let daemon = match mdns_sd::ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            error!("Failed to create mDNS daemon for discovery: {}", e);
            return Vec::new();
        }
    };

    // Browse for services
    let receiver = match daemon.browse(service_type) {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to browse mDNS services: {}", e);
            return Vec::new();
        }
    };

    let mut devices = Vec::new();
    let timeout = Duration::from_secs(timeout_secs);
    let start = std::time::Instant::now();

    // Collect devices for the specified timeout
    while start.elapsed() < timeout {
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) => {
                let host = info.get_addresses()
                    .iter()
                    .next()
                    .map(|a| a.to_string())
                    .unwrap_or_else(|| info.get_hostname().to_string());

                info!("Discovered device: {} at {}:{}", info.get_fullname(), host, info.get_port());

                devices.push(DiscoveredDevice {
                    name: info.get_fullname().to_string(),
                    host,
                    port: info.get_port(),
                    service_type: service_type.to_string(),
                });
            }
            Ok(mdns_sd::ServiceEvent::ServiceFound(_name, _type)) => {
                // Service found, waiting for resolution...
            }
            Ok(mdns_sd::ServiceEvent::ServiceRemoved(_name, _type)) => {
                // Service removed, ignore for now
            }
            Ok(_) => {}
            Err(_) => {
                // Timeout is expected, continue checking total timeout
            }
        }
    }

    // Shutdown the browser
    let _ = daemon.shutdown();

    info!("Discovery complete, found {} devices", devices.len());
    devices
}
