use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

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

    /// Start advertising the service
    pub async fn advertise(&mut self, name: &str, port: u16) -> Result<(), String> {
        // Create a new mDNS daemon
        let daemon = mdns_sd::ServiceDaemon::new()
            .map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;

        let service_type = "_mw-display._tcp.local.";
        let hostname = "mobile-worship-display.local.";

        // Create the service info with auto address detection
        // No properties (empty slice)
        let service_info = mdns_sd::ServiceInfo::new(
            service_type,
            name,
            hostname,
            "", // Empty addresses - will use auto
            port,
            &[] as &[(&str, &str)],
        )
        .map_err(|e| format!("Failed to create service info: {}", e))?
        .enable_addr_auto();

        let fullname = service_info.get_fullname().to_string();

        // Register the service
        daemon.register(service_info)
            .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

        self.service_daemon = Some(daemon);
        self.service_fullname = Some(fullname);
        info!("Advertising mDNS service: {} on port {}", name, port);
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
}

impl AdvertiserState {
    pub fn new() -> Self {
        Self {
            advertiser: Arc::new(Mutex::new(ServiceAdvertiser::new())),
        }
    }

    pub async fn advertise(&self, name: &str, port: u16) -> Result<(), String> {
        let mut adv = self.advertiser.lock().await;
        adv.advertise(name, port).await
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
