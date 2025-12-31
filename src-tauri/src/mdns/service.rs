use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, debug, warn};
use std::net::IpAddr;

/// Get the primary local IP address
/// For same-machine discovery, try ALL addresses (both loopback and network)
/// Returns a vector of all usable IP addresses for better discovery chances
fn get_all_ip_addresses() -> Vec<String> {
    use if_addrs::get_if_addrs;

    let mut addresses = Vec::new();

    if let Ok(interfaces) = get_if_addrs() {
        info!("=== All Network Interfaces ===");
        for iface in &interfaces {
            info!("  Interface: {} -> {}", iface.name, iface.ip());
        }

        // First, collect loopback for same-machine discovery
        for iface in &interfaces {
            if let IpAddr::V4(addr) = iface.ip() {
                if addr.is_loopback() {
                    info!("Adding loopback address {} for same-machine discovery", addr);
                    addresses.push(addr.to_string());
                }
            }
        }

        // Then collect non-loopback, non-link-local for cross-machine discovery
        for iface in interfaces {
            if let IpAddr::V4(addr) = iface.ip() {
                // Skip loopback (127.x.x.x) - already added above
                if addr.is_loopback() {
                    continue;
                }
                // Skip link-local (169.254.x.x)
                if addr.octets()[0] == 169 && addr.octets()[1] == 254 {
                    info!("Skipping link-local address {} on interface {}", addr, iface.name);
                    continue;
                }
                // This is a valid local network address
                info!("Adding network address {} from interface {}", addr, iface.name);
                addresses.push(addr.to_string());
            }
        }
    }

    info!("=== Using IP addresses for mDNS: {:?}", addresses);
    addresses
}

/// Get the primary local IP address
/// For same-machine discovery, prefer loopback (127.0.0.1)
/// Falls back to network IP for cross-machine discovery
fn get_local_ip_address() -> Option<String> {
    let addresses = get_all_ip_addresses();
    addresses.into_iter().next()
}

/// Service advertiser using mDNS
pub struct ServiceAdvertiser {
    service_daemon: Option<mdns_sd::ServiceDaemon>,
    service_fullname: Option<String>,
}

impl ServiceAdvertiser {
    /// Create a new advertiser
    pub fn new() -> Self {
        Self { service_daemon: None, service_fullname: None }
    }

    /// Start advertising the service with per-display identification
    /// display_id: Unique per-display UUID (from EDID fingerprint)
    /// device_id: Device UUID (for backward compatibility and grouping)
    /// display_name: Human-readable display name
    /// width, height: Display resolution in pixels
    /// platform: Platform/OS info (e.g., "Android 11", "Fire OS 7")
    pub async fn advertise(
        &mut self,
        name: &str,
        port: u16,
        display_id: &str,
        device_id: &str,
        display_name: Option<&str>,
        width: Option<u32>,
        height: Option<u32>,
        platform: Option<&str>,
    ) -> Result<(), String> {
        info!("=== Starting mDNS Advertising ===");
        info!("Service name: '{}'", name);
        info!("Port: {}", port);
        info!("Display ID: {}", display_id);
        info!("Device ID: {}", device_id);
        info!("Platform: {:?}", platform);

        // Stop any existing service first
        if self.service_daemon.is_some() {
            warn!("Stopping existing mDNS service before starting new one");
            self.stop();
        }

        // Get ALL local IP addresses for better discovery
        let all_ips = get_all_ip_addresses();
        if all_ips.is_empty() {
            return Err("Failed to get any local IP addresses".to_string());
        }

        // Create a new mDNS daemon
        let daemon = mdns_sd::ServiceDaemon::new()
            .map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;
        info!("Created mDNS daemon");

        let service_type = "_mw-display._tcp.local.";
        let hostname = "mobile-worship-display.local.";

        // Create service info with ALL IP addresses for better discovery
        let all_ips_str = all_ips.join(",");
        info!("Creating service info with IPs: {}", all_ips_str);

        // TXT records with display_id (primary) and device_id (for grouping)
        // Also include display info for discovery UI
        let width_str = width.map(|w| w.to_string()).unwrap_or_default();
        let height_str = height.map(|h| h.to_string()).unwrap_or_default();
        let display_name_str = display_name.unwrap_or("");
        let platform_str = platform.unwrap_or("");

        let mut txt_records: Vec<(&str, &str)> = vec![
            ("display_id", display_id),
            ("device_id", device_id),
        ];

        if !display_name_str.is_empty() {
            txt_records.push(("display_name", display_name_str));
        }
        if !width_str.is_empty() {
            txt_records.push(("width", &width_str));
        }
        if !height_str.is_empty() {
            txt_records.push(("height", &height_str));
        }
        if !platform_str.is_empty() {
            txt_records.push(("platform", platform_str));
        }

        let mut service_info = mdns_sd::ServiceInfo::new(
            service_type,
            name,
            hostname,
            all_ips.as_slice(),
            port,
            txt_records.as_slice(),
        )
        .map_err(|e| format!("Failed to create service info: {}", e))?;

        // Skip probing for faster announcement (safe for same-machine testing)
        service_info.set_requires_probe(false);

        let fullname = service_info.get_fullname().to_string();
        info!("Service fullname: {}", fullname);
        info!("Service addresses: {:?}", service_info.get_addresses());
        info!("TXT records: {:?}", service_info.get_properties());
        info!("Registering with {} addresses: {:?}", all_ips.len(), service_info.get_addresses());

        // Register the service
        daemon.register(service_info)
            .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

        // Start browsing on the same daemon to keep it actively processing queries
        let _browse_receiver = daemon.browse(service_type);
        info!("Started browsing on advertising daemon to enable query responses");

        info!("✓ Advertising mDNS service '{}' on port {} with {} IP addresses",
              name, port, all_ips.len());
        info!("  Display ID: {}", display_id);
        info!("  Device ID: {}", device_id);
        info!("  Addresses: {:?}", all_ips);

        self.service_daemon = Some(daemon);
        self.service_fullname = Some(fullname);
        Ok(())
    }

    /// Stop advertising
    pub fn stop(&mut self) {
        if let (Some(daemon), Some(fullname)) = (self.service_daemon.take(), self.service_fullname.take()) {
            let _ = daemon.unregister(&fullname);
        }
    }
}

impl Default for ServiceAdvertiser {
    fn default() -> Self {
        Self::new()
    }
}

/// Global advertiser state
pub struct AdvertiserState {
    advertiser: Arc<Mutex<ServiceAdvertiser>>,
    monitor_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl AdvertiserState {
    pub fn new() -> Self {
        Self {
            advertiser: Arc::new(Mutex::new(ServiceAdvertiser::new())),
            monitor_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn advertise(
        &self,
        name: &str,
        port: u16,
        display_id: &str,
        device_id: &str,
        display_name: Option<&str>,
        width: Option<u32>,
        height: Option<u32>,
        platform: Option<&str>,
    ) -> Result<(), String> {
        // First, stop any existing advertising
        let mut adv = self.advertiser.lock().await;
        adv.advertise(name, port, display_id, device_id, display_name, width, height, platform).await?;

        // Get a clone of the daemon for monitoring
        let daemon_clone = adv.service_daemon.clone();
        drop(adv); // Release the lock before spawning the task

        // Start monitoring the daemon to keep it alive and responding
        if let Some(daemon) = daemon_clone {
            let monitor_receiver = match daemon.monitor() {
                Ok(r) => r,
                Err(e) => {
                    warn!("Failed to create monitor receiver: {}", e);
                    return Ok(()); // Continue without monitoring
                }
            };

            // Spawn a task to monitor the daemon and keep it alive
            let handle = tokio::spawn(async move {
                info!("Starting mDNS daemon monitor task");
                while let Ok(event) = monitor_receiver.recv_async().await {
                    debug!("mDNS daemon monitor event: {:?}", event);
                }
                info!("mDNS daemon monitor task ended");
            });

            // Store the handle and cancel any previous one
            let mut handle_guard = self.monitor_handle.lock().await;
            if let Some(old_handle) = handle_guard.take() {
                old_handle.abort();
            }
            *handle_guard = Some(handle);
        }

        Ok(())
    }

    pub async fn stop(&self) {
        let mut adv = self.advertiser.lock().await;
        adv.stop();
    }
}

impl Default for AdvertiserState {
    fn default() -> Self {
        Self::new()
    }
}
