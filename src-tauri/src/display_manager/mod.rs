//! Display Manager Module
//!
//! Manages automatic detection and lifecycle of external displays.
//! Opens display windows on startup and monitors for hot-plug events.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;
use tracing::{info, warn, error, debug};

use crate::commands::MonitorInfo;
use crate::edid::{get_display_fingerprints, DisplayInfo};

/// Polling interval for detecting display changes (5 seconds)
const POLL_INTERVAL_SECS: u64 = 5;

/// Delay before starting display monitoring after app launch
const STARTUP_DELAY_SECS: u64 = 2;

/// Information about an open display window
#[derive(Debug, Clone)]
struct OpenDisplay {
    display_id: String,
    display_name: String,
    device_id: String,
    width: u32,
    height: u32,
    window_label: String,
    monitor_index: i32,
}

/// Event payload for when a local display is opened
#[derive(Clone, serde::Serialize)]
struct LocalDisplayOpened {
    display_id: String,
    display_name: String,
    device_id: String,
    width: i32,
    height: i32,
}

/// Event payload for when a local display is closed
#[derive(Clone, serde::Serialize)]
struct LocalDisplayClosed {
    display_id: String,
}

/// Per-display mDNS advertiser
struct DisplayAdvertiser {
    daemon: mdns_sd::ServiceDaemon,
    fullname: String,
    _monitor_handle: Option<tokio::task::JoinHandle<()>>,
}

impl DisplayAdvertiser {
    /// Stop advertising and cleanup
    fn stop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        if let Some(handle) = self._monitor_handle.take() {
            handle.abort();
        }
    }
}

impl Drop for DisplayAdvertiser {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Manages external display windows and their advertising
pub struct DisplayManager {
    /// Map of display_id -> open display info
    open_displays: HashMap<String, OpenDisplay>,
    /// Map of display_id -> advertiser (each display needs its own mDNS service)
    advertisers: HashMap<String, DisplayAdvertiser>,
    /// Device ID for this machine (cached)
    device_id: Option<String>,
    /// WebSocket server port (cached after first start)
    ws_port: Option<u16>,
}

/// Information about an open local display (for frontend)
/// Re-exported for use by commands
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LocalDisplayInfo {
    pub display_id: String,
    pub display_name: String,
    pub device_id: String,
    pub width: u32,
    pub height: u32,
}

impl DisplayManager {
    /// Create a new DisplayManager
    pub fn new() -> Self {
        Self {
            open_displays: HashMap::new(),
            advertisers: HashMap::new(),
            device_id: None,
            ws_port: None,
        }
    }

    /// Get information about all currently open displays
    pub fn get_open_displays(&self) -> Vec<LocalDisplayInfo> {
        self.open_displays.values().map(|d| {
            LocalDisplayInfo {
                display_id: d.display_id.clone(),
                display_name: d.display_name.clone(),
                device_id: d.device_id.clone(),
                width: d.width,
                height: d.height,
            }
        }).collect()
    }

    /// Get or initialize the device ID
    async fn get_or_init_device_id(&mut self, app: &AppHandle) -> Result<String, String> {
        if let Some(ref id) = self.device_id {
            return Ok(id.clone());
        }

        // Get device ID using the existing command logic
        use uuid::Uuid;
        use tauri_plugin_machine_uid::MachineUidExt;

        // Try hardware-based machine UID first
        if let Some(machine_uid) = app.try_machine_uid() {
            if let Ok(response) = machine_uid.get_machine_uid() {
                if let Some(id) = response.id {
                    if !id.is_empty() {
                        let device_id = if Uuid::parse_str(&id).is_ok() {
                            id.clone()
                        } else {
                            let namespace = Uuid::NAMESPACE_OID;
                            Uuid::new_v5(&namespace, id.as_bytes()).to_string()
                        };
                        self.device_id = Some(device_id.clone());
                        return Ok(device_id);
                    }
                }
            }
        }

        // Fallback to stored UUID
        let store = tauri_plugin_store::StoreBuilder::new(app, "device_state.json")
            .build()
            .map_err(|e| format!("Failed to create store: {}", e))?;

        if let Some(device_id) = store.get("device_id") {
            if let Some(id_str) = device_id.as_str() {
                if Uuid::parse_str(id_str).is_ok() {
                    self.device_id = Some(id_str.to_string());
                    return Ok(id_str.to_string());
                }
            }
        }

        // Generate new device ID
        let new_device_id = Uuid::new_v4().to_string();
        store.set("device_id", tauri_plugin_store::JsonValue::String(new_device_id.clone()));
        let _ = store.save();
        self.device_id = Some(new_device_id.clone());
        Ok(new_device_id)
    }

    /// Get or start the WebSocket server
    async fn get_or_start_ws_server(&mut self, app: &AppHandle) -> Result<u16, String> {
        if let Some(port) = self.ws_port {
            return Ok(port);
        }

        let ws_state = app.state::<Arc<tokio::sync::Mutex<crate::websocket::WebSocketServer>>>();
        let mut server = ws_state.lock().await;
        let port = server.start(0).await?;
        self.ws_port = Some(port);
        info!("WebSocket server started on port {} for display manager", port);
        Ok(port)
    }

    /// Start advertising a display via mDNS
    async fn start_display_advertising(
        &mut self,
        display_id: &str,
        display_name: &str,
        width: u32,
        height: u32,
        ws_port: u16,
        device_id: &str,
    ) -> Result<(), String> {
        // Stop existing advertiser for this display if any
        if let Some(mut adv) = self.advertisers.remove(display_id) {
            adv.stop();
        }

        info!("Starting mDNS advertising for display {} ({}x{})", display_id, width, height);

        // Get all IP addresses
        let all_ips = get_all_ip_addresses();
        if all_ips.is_empty() {
            return Err("Failed to get any local IP addresses".to_string());
        }

        // Create mDNS daemon
        let daemon = mdns_sd::ServiceDaemon::new()
            .map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;

        let service_type = "_mw-display._tcp.local.";
        // Use display_id in hostname to make it unique per display
        let safe_id = display_id.replace('-', "").chars().take(8).collect::<String>();
        let hostname = format!("mw-display-{}.local.", safe_id);
        let service_name = format!("MW Display {}", &display_id[..8.min(display_id.len())]);

        // Platform info
        let platform = format!("macOS {}", std::env::consts::OS);

        let width_str = width.to_string();
        let height_str = height.to_string();

        let txt_records: Vec<(&str, &str)> = vec![
            ("display_id", display_id),
            ("device_id", device_id),
            ("display_name", display_name),
            ("width", &width_str),
            ("height", &height_str),
            ("platform", &platform),
        ];

        let mut service_info = mdns_sd::ServiceInfo::new(
            service_type,
            &service_name,
            &hostname,
            all_ips.as_slice(),
            ws_port,
            txt_records.as_slice(),
        )
        .map_err(|e| format!("Failed to create service info: {}", e))?;

        service_info.set_requires_probe(false);
        let fullname = service_info.get_fullname().to_string();

        daemon.register(service_info)
            .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

        // Start browsing to keep daemon responsive
        let _browse_receiver = daemon.browse(service_type);

        // Start monitor task
        let monitor_receiver = daemon.monitor()
            .map_err(|e| format!("Failed to create monitor: {}", e))?;

        let monitor_handle = tokio::spawn(async move {
            while let Ok(event) = monitor_receiver.recv_async().await {
                debug!("mDNS event for display: {:?}", event);
            }
        });

        info!("✓ Display {} advertising on port {} with {} IPs", display_id, ws_port, all_ips.len());

        self.advertisers.insert(display_id.to_string(), DisplayAdvertiser {
            daemon,
            fullname,
            _monitor_handle: Some(monitor_handle),
        });

        Ok(())
    }

    /// Stop advertising for a display
    fn stop_display_advertising(&mut self, display_id: &str) {
        if let Some(mut adv) = self.advertisers.remove(display_id) {
            info!("Stopping mDNS advertising for display {}", display_id);
            adv.stop();
        }
    }

    /// Open a display window on the specified monitor with advertising
    async fn open_display_with_advertising(
        &mut self,
        app: &AppHandle,
        monitor_info: &MonitorInfo,
    ) -> Result<(), String> {
        let display_id = &monitor_info.display_id;
        let window_label = format!("display-{}", monitor_info.id);

        // Check if already open
        if self.open_displays.contains_key(display_id) {
            debug!("Display {} already open", display_id);
            return Ok(());
        }

        // Check if window already exists (may have been opened by another code path)
        if app.get_webview_window(&window_label).is_some() {
            info!("Window {} already exists, adopting it for tracking", window_label);

            // Ensure WebSocket server is running
            let ws_port = self.get_or_start_ws_server(app).await?;
            let device_id = self.get_or_init_device_id(app).await?;

            // Track the existing display
            self.open_displays.insert(display_id.clone(), OpenDisplay {
                display_id: display_id.clone(),
                display_name: monitor_info.name.clone(),
                device_id: device_id.clone(),
                width: monitor_info.size_x,
                height: monitor_info.size_y,
                window_label: window_label.clone(),
                monitor_index: monitor_info.id,
            });

            // Start advertising for this display
            self.start_display_advertising(
                display_id,
                &monitor_info.name,
                monitor_info.size_x,
                monitor_info.size_y,
                ws_port,
                &device_id,
            ).await?;

            // Emit event for adopted display too
            let _ = app.emit("local-display-opened", LocalDisplayOpened {
                display_id: display_id.to_string(),
                display_name: monitor_info.name.clone(),
                device_id: device_id.clone(),
                width: monitor_info.size_x as i32,
                height: monitor_info.size_y as i32,
            });

            info!("✓ Adopted existing display window '{}' and started advertising", monitor_info.name);
            return Ok(());
        }

        // Ensure WebSocket server is running
        let ws_port = self.get_or_start_ws_server(app).await?;

        // Get device ID
        let device_id = self.get_or_init_device_id(app).await?;

        info!(
            "Opening display window '{}' (display_id: {}) on monitor {} ({}x{} at {},{})",
            monitor_info.name,
            display_id,
            monitor_info.id,
            monitor_info.size_x,
            monitor_info.size_y,
            monitor_info.position_x,
            monitor_info.position_y
        );

        // Create the display window
        let encoded_name = urlencoding::encode(&monitor_info.name);
        let encoded_display_id = urlencoding::encode(display_id);

        // Physical coordinates work for Sidecar placement
        // CSS in Display.tsx will handle scaling the content to fit
        info!(
            "Window: {}x{} at ({}, {}) physical - scale: {}",
            monitor_info.size_x, monitor_info.size_y,
            monitor_info.position_x, monitor_info.position_y,
            monitor_info.scale_factor
        );

        // Create window with decorations first (required for Sidecar to render)
        // Then remove decorations after window is visible on the external display
        let window = WebviewWindowBuilder::new(
            app,
            &window_label,
            WebviewUrl::App(format!(
                "/live/display?eventId=default&displayName={}&displayId={}&localMode=true&scaleFactor={}",
                encoded_name, encoded_display_id, monitor_info.scale_factor
            ).into())
        )
        .position(monitor_info.position_x as f64, monitor_info.position_y as f64)
        .inner_size(monitor_info.size_x as f64, monitor_info.size_y as f64)
        .resizable(false)
        .decorations(true) // Start with decorations for Sidecar compatibility
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(true)
        .focused(true)
        .title("Mobile Worship Display")
        .build()
        .map_err(|e| format!("Failed to create display window: {}", e))?;

        // Remove decorations after window is visible on external display
        // Note: set_fullscreen(true) and set_maximized(true) both move window to main display
        // on Sidecar, so we only remove decorations. The macOS global menu bar will remain
        // visible at the top - this is a Sidecar/macOS limitation that cannot be worked around.
        std::thread::spawn({
            let window = window.clone();
            move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Err(e) = window.set_decorations(false) {
                    eprintln!("Failed to remove decorations: {}", e);
                } else {
                    eprintln!("Removed window decorations");
                }
            }
        });

        // Track the open display
        self.open_displays.insert(display_id.clone(), OpenDisplay {
            display_id: display_id.clone(),
            display_name: monitor_info.name.clone(),
            device_id: device_id.clone(),
            width: monitor_info.size_x,
            height: monitor_info.size_y,
            window_label: window_label.clone(),
            monitor_index: monitor_info.id,
        });

        // Start advertising for this display
        self.start_display_advertising(
            display_id,
            &monitor_info.name,
            monitor_info.size_x,
            monitor_info.size_y,
            ws_port,
            &device_id,
        ).await?;

        // Emit event to main window so it can register the display in the database
        // The main window has ChurchContext and can handle DB operations
        let _ = app.emit("local-display-opened", LocalDisplayOpened {
            display_id: display_id.to_string(),
            display_name: monitor_info.name.clone(),
            device_id: device_id.clone(),
            width: monitor_info.size_x as i32,
            height: monitor_info.size_y as i32,
        });

        info!("✓ Display window '{}' opened and advertising", monitor_info.name);
        Ok(())
    }

    /// Close a display window and stop its advertising
    fn close_display(&mut self, app: &AppHandle, display_id: &str) -> Result<(), String> {
        if let Some(display) = self.open_displays.remove(display_id) {
            info!("Closing display window for {}", display_id);

            // Stop advertising
            self.stop_display_advertising(display_id);

            // Close window
            if let Some(window) = app.get_webview_window(&display.window_label) {
                let _ = window.destroy();
            }

            // Emit event to main window so it can mark display as offline
            let _ = app.emit("local-display-closed", LocalDisplayClosed {
                display_id: display_id.to_string(),
            });
        }
        Ok(())
    }

    /// Get current monitors (excluding primary)
    fn get_external_monitors(app: &AppHandle) -> Result<Vec<MonitorInfo>, String> {
        let window = app.get_webview_window("main")
            .ok_or("No main window found")?;

        let monitors = window.available_monitors()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;

        let primary_monitor = window.primary_monitor()
            .ok()
            .flatten();

        let fingerprints = get_display_fingerprints();

        let mut result = Vec::new();
        for (idx, monitor) in monitors.iter().enumerate() {
            let is_primary = primary_monitor
                .as_ref()
                .map(|pm| {
                    pm.name() == monitor.name() &&
                    pm.position() == monitor.position() &&
                    pm.size() == monitor.size()
                })
                .unwrap_or(false);

            // Skip primary monitor
            if is_primary {
                continue;
            }

            let os_name = monitor.name()
                .map(|n| n.to_string())
                .unwrap_or_else(|| format!("Display {}", idx + 1));

            let fingerprint = fingerprints.iter()
                .find(|(fp_idx, _)| *fp_idx == idx as i32)
                .map(|(_, fp)| fp);

            let (display_id, manufacturer, model, serial_number, physical_width_cm, physical_height_cm) =
                if let Some(fp) = fingerprint {
                    (
                        fp.to_uuid().to_string(),
                        fp.manufacturer_id.clone(),
                        fp.model_name.clone(),
                        fp.serial_number.to_string(),
                        fp.width_cm,
                        fp.height_cm,
                    )
                } else {
                    let fallback_id = DisplayInfo::create_fallback_id(
                        idx as i32,
                        &os_name,
                        monitor.size().width,
                        monitor.size().height,
                    );
                    (fallback_id, String::new(), String::new(), String::from("0"), 0, 0)
                };

            result.push(MonitorInfo {
                display_id,
                id: idx as i32,
                name: os_name,
                manufacturer,
                model,
                serial_number,
                position_x: monitor.position().x,
                position_y: monitor.position().y,
                size_x: monitor.size().width,
                size_y: monitor.size().height,
                physical_width_cm,
                physical_height_cm,
                scale_factor: monitor.scale_factor(),
                is_primary: false,
            });
        }

        Ok(result)
    }

    /// Sync display windows with current monitors
    /// Opens windows for new monitors, closes windows for removed monitors
    async fn sync_displays(&mut self, app: &AppHandle) -> Result<(), String> {
        let current_monitors = Self::get_external_monitors(app)?;
        let current_ids: std::collections::HashSet<_> = current_monitors.iter()
            .map(|m| m.display_id.clone())
            .collect();

        // Find displays to close (no longer connected)
        let to_close: Vec<_> = self.open_displays.keys()
            .filter(|id| !current_ids.contains(*id))
            .cloned()
            .collect();

        for display_id in to_close {
            info!("Monitor disconnected: {}", display_id);
            self.close_display(app, &display_id)?;
        }

        // Find displays to open (newly connected)
        for monitor in current_monitors {
            if !self.open_displays.contains_key(&monitor.display_id) {
                info!("New monitor detected: {} ({})", monitor.name, monitor.display_id);
                if let Err(e) = self.open_display_with_advertising(app, &monitor).await {
                    error!("Failed to open display {}: {}", monitor.display_id, e);
                }
            }
        }

        Ok(())
    }
}

/// Global display manager state
pub struct DisplayManagerState {
    manager: Arc<Mutex<DisplayManager>>,
    shutdown_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl DisplayManagerState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(Mutex::new(DisplayManager::new())),
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Start monitoring displays
    /// Call this once from app setup
    pub async fn start_monitoring(&self, app: AppHandle) {
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();

        {
            let mut tx_guard = self.shutdown_tx.lock().await;
            *tx_guard = Some(shutdown_tx);
        }

        let manager = self.manager.clone();

        tokio::spawn(async move {
            // Wait for app to fully initialize
            info!("Display manager waiting {}s for app initialization...", STARTUP_DELAY_SECS);
            tokio::time::sleep(Duration::from_secs(STARTUP_DELAY_SECS)).await;

            info!("Display manager starting initial sync...");

            // Initial sync
            {
                let mut mgr = manager.lock().await;
                if let Err(e) = mgr.sync_displays(&app).await {
                    error!("Initial display sync failed: {}", e);
                }
            }

            info!("Display manager starting polling loop ({}s interval)", POLL_INTERVAL_SECS);

            // Polling loop
            let mut interval = tokio::time::interval(Duration::from_secs(POLL_INTERVAL_SECS));
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let mut mgr = manager.lock().await;
                        if let Err(e) = mgr.sync_displays(&app).await {
                            warn!("Display sync error: {}", e);
                        }
                    }
                    _ = &mut shutdown_rx => {
                        info!("Display manager shutting down");
                        break;
                    }
                }
            }

            // Cleanup: close all displays
            let mut mgr = manager.lock().await;
            let display_ids: Vec<_> = mgr.open_displays.keys().cloned().collect();
            for display_id in display_ids {
                let _ = mgr.close_display(&app, &display_id);
            }
        });
    }

    /// Stop monitoring displays
    pub async fn stop_monitoring(&self) {
        let mut tx_guard = self.shutdown_tx.lock().await;
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }

    /// Get currently open local displays
    pub async fn get_open_displays(&self) -> Vec<LocalDisplayInfo> {
        let mgr = self.manager.lock().await;
        mgr.get_open_displays()
    }
}

impl Default for DisplayManagerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Get all local IP addresses for mDNS advertising
fn get_all_ip_addresses() -> Vec<String> {
    use if_addrs::get_if_addrs;
    use std::net::IpAddr;

    let mut addresses = Vec::new();

    if let Ok(interfaces) = get_if_addrs() {
        // First, collect loopback for same-machine discovery
        for iface in &interfaces {
            if let IpAddr::V4(addr) = iface.ip() {
                if addr.is_loopback() {
                    addresses.push(addr.to_string());
                }
            }
        }

        // Then collect non-loopback, non-link-local for cross-machine discovery
        for iface in interfaces {
            if let IpAddr::V4(addr) = iface.ip() {
                if addr.is_loopback() {
                    continue;
                }
                if addr.octets()[0] == 169 && addr.octets()[1] == 254 {
                    continue;
                }
                if !addresses.contains(&addr.to_string()) {
                    addresses.push(addr.to_string());
                }
            }
        }
    }

    addresses
}
