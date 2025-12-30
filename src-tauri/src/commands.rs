use std::path::PathBuf;
use std::fs;
use std::io::Write;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};
use base64::Engine;

const MAX_CACHE_SIZE_MB: u64 = 500; // 500 MB max cache
const CACHE_DIR_NAME: &str = "media_cache";

/// Metadata for a cached media file
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MediaCacheEntry {
    file_path: String,
    updated_at: String,  // ISO 8601 timestamp
    last_accessed: String,  // ISO 8601 timestamp
    size: u64,
}

/// Cache state stored in Tauri Store
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MediaCacheState {
    entries: HashMap<String, MediaCacheEntry>,
    total_size: u64,
}

impl Default for MediaCacheState {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            total_size: 0,
        }
    }
}

/// Get the cache directory path
fn get_cache_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?
        .join(CACHE_DIR_NAME);

    // Create directory if it doesn't exist
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    Ok(cache_dir)
}

/// Load cache state from Tauri Store
async fn load_cache_state(app_handle: &AppHandle) -> Result<MediaCacheState, String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle.store("media_cache.json")
        .map_err(|e| format!("Failed to get store: {}", e))?;

    let entries: HashMap<String, MediaCacheEntry> = store
        .get("entries")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let total_size = store
        .get("total_size")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(0u64);

    Ok(MediaCacheState { entries, total_size })
}

/// Save cache state to Tauri Store
async fn save_cache_state(app_handle: &AppHandle, state: &MediaCacheState) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app_handle.store("media_cache.json")
        .map_err(|e| format!("Failed to get store: {}", e))?;

    store.set("entries", serde_json::to_value(&state.entries).unwrap());
    store.set("total_size", serde_json::to_value(state.total_size).unwrap());
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Evict least recently used entries until cache is under limit
async fn evict_lru(
    app_handle: &AppHandle,
    mut state: MediaCacheState,
    _cache_dir: &PathBuf,
) -> Result<MediaCacheState, String> {
    const MAX_SIZE: u64 = MAX_CACHE_SIZE_MB * 1024 * 1024;

    while state.total_size > MAX_SIZE && !state.entries.is_empty() {
        // Find LRU entry
        let lru_id = state.entries
            .iter()
            .min_by_key(|(_, e)| e.last_accessed.clone())
            .map(|(id, _)| id.clone());

        if let Some(id) = lru_id {
            if let Some(entry) = state.entries.remove(&id) {
                // Delete file
                let _ = fs::remove_file(&entry.file_path);
                state.total_size = state.total_size.saturating_sub(entry.size);
                tracing::info!("Evicted media from cache: {} ({} bytes)", id, entry.size);
            }
        }
    }

    save_cache_state(app_handle, &state).await?;
    Ok(state)
}

/// Store a media file in the cache
#[tauri::command]
pub async fn cache_media(
    app_handle: AppHandle,
    media_id: String,
    updated_at: String,
    data: String,  // base64 encoded
) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    // Decode base64 data
    let file_data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let file_size = file_data.len() as u64;

    // Determine file extension from media_id or detect from base64 data
    let ext = if media_id.contains(".") {
        media_id.rsplit('.').next().unwrap_or("bin")
    } else {
        // Detect image type from base64 data signature (magic bytes)
        if data.starts_with("/9j/") {
            "jpg"      // JPEG
        } else if data.starts_with("iVBORw0K") {
            "png"      // PNG
        } else if data.starts_with("R0lGODlh") {
            "gif"      // GIF
        } else if data.starts_with("UklGR") {
            "webp"     // WebP
        } else {
            "bin"      // Unknown
        }
    };

    // Generate safe filename - only alphanumeric, dash, underscore, dot
    let safe_id = media_id.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '.', "_");
    // Sanitize timestamp: replace special chars with safe alternatives
    let safe_timestamp = updated_at
        .replace(':', "-")
        .replace('+', "_")
        .replace('.', "-");
    let file_path = cache_dir.join(format!("{}_{}.{}", safe_id, safe_timestamp, ext));

    tracing::info!("Caching media: {} with extension: {} -> {}", media_id, ext, file_path.display());

    // Check if already cached with same or newer version
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(existing) = state.entries.get(&media_id) {
        if existing.updated_at >= updated_at && existing.file_path == file_path.to_string_lossy() {
            // Already have this version or newer
            tracing::info!("Media already cached with current or newer version: {}", media_id);
            return Ok(existing.file_path.clone());
        }
        // Remove old version
        let _ = fs::remove_file(&existing.file_path);
        state.total_size = state.total_size.saturating_sub(existing.size);
        state.entries.remove(&media_id);
    }

    // Write file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&file_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Update cache state
    let now = chrono::Utc::now().to_rfc3339();
    let entry = MediaCacheEntry {
        file_path: file_path.to_string_lossy().to_string(),
        updated_at: updated_at.clone(),
        last_accessed: now.clone(),
        size: file_size,
    };

    state.entries.insert(media_id.clone(), entry);
    state.total_size += file_size;

    // Evict if needed
    let _ = evict_lru(&app_handle, state, &cache_dir).await?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Cache media from binary buffer (fetched from URL)
#[tauri::command]
pub async fn cache_media_from_buffer(
    app_handle: AppHandle,
    media_id: String,
    updated_at: String,
    buffer: Vec<u8>,
) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    let file_size = buffer.len() as u64;

    // Determine file extension from binary data magic bytes
    let ext = if media_id.contains(".") {
        media_id.rsplit('.').next().unwrap_or("bin").to_string()
    } else {
        // Detect image type from binary magic bytes
        match buffer.get(0..4) {
            Some([0xFF, 0xD8, 0xFF, ..]) => "jpg",   // JPEG
            Some([0x89, 0x50, 0x4E, 0x47]) => "png",  // PNG
            Some([0x47, 0x49, 0x46, 0x38]) => "gif",  // GIF
            Some([0x52, 0x49, 0x46, 0x46]) => "webp", // WebP (RIFF)
            Some(b"WEBP") => "webp",
            _ => "bin",
        }.to_string()
    };

    // Generate safe filename - only alphanumeric, dash, underscore, dot
    let safe_id = media_id.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '.', "_");
    // Sanitize timestamp: replace special chars with safe alternatives
    let safe_timestamp = updated_at
        .replace(':', "-")
        .replace('+', "_")
        .replace('.', "-");
    let file_path = cache_dir.join(format!("{}_{}.{}", safe_id, safe_timestamp, ext));

    tracing::info!("Caching media from buffer: {} with extension: {} -> {}", media_id, ext, file_path.display());

    // Check if already cached with same or newer version
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(existing) = state.entries.get(&media_id) {
        if existing.updated_at >= updated_at && existing.file_path == file_path.to_string_lossy() {
            // Already have this version or newer
            tracing::info!("Media already cached with current or newer version: {}", media_id);
            return Ok(existing.file_path.clone());
        }
        // Remove old version
        let _ = fs::remove_file(&existing.file_path);
        state.total_size = state.total_size.saturating_sub(existing.size);
        state.entries.remove(&media_id);
    }

    // Write file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&buffer)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Update cache state
    let now = chrono::Utc::now().to_rfc3339();
    let entry = MediaCacheEntry {
        file_path: file_path.to_string_lossy().to_string(),
        updated_at: updated_at.clone(),
        last_accessed: now.clone(),
        size: file_size,
    };

    state.entries.insert(media_id.clone(), entry);
    state.total_size += file_size;

    // Evict if needed
    let _ = evict_lru(&app_handle, state, &cache_dir).await?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Get a cached media file path
#[tauri::command]
pub async fn get_cached_media(
    app_handle: AppHandle,
    media_id: String,
) -> Result<Option<String>, String> {
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(entry) = state.entries.get(&media_id) {
        let file_path = entry.file_path.clone();

        // Update last accessed time
        if let Some(e) = state.entries.get_mut(&media_id) {
            e.last_accessed = chrono::Utc::now().to_rfc3339();
        }
        save_cache_state(&app_handle, &state).await?;

        // Check if file still exists
        if PathBuf::from(&file_path).exists() {
            return Ok(Some(file_path));
        }
    }

    Ok(None)
}

/// Get cached media as a base64 data URL (for use in display windows that can't access asset://)
#[tauri::command]
pub async fn get_cached_media_data_url(
    app_handle: AppHandle,
    media_id: String,
) -> Result<Option<String>, String> {
    let mut state = load_cache_state(&app_handle).await?;

    if let Some(entry) = state.entries.get(&media_id) {
        let file_path = entry.file_path.clone();

        // Update last accessed time
        if let Some(e) = state.entries.get_mut(&media_id) {
            e.last_accessed = chrono::Utc::now().to_rfc3339();
        }
        save_cache_state(&app_handle, &state).await?;

        // Check if file still exists
        let path = PathBuf::from(&file_path);
        if path.exists() {
            // Read file and convert to base64
            let bytes = fs::read(&path)
                .map_err(|e| format!("Failed to read cached file: {}", e))?;

            // Detect mime type from extension
            let mime_type = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| match ext.to_lowercase().as_str() {
                    "jpg" | "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => "image/jpeg",
                })
                .unwrap_or("image/jpeg");

            // Encode to base64
            let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_url = format!("data:{};base64,{}", mime_type, base64);

            tracing::info!("Generated data URL for cached media: {} ({} bytes)", media_id, bytes.len());
            return Ok(Some(data_url));
        }
    }

    Ok(None)
}

/// Clear all cached media
#[tauri::command]
pub async fn clear_media_cache(app_handle: AppHandle) -> Result<(), String> {
    let cache_dir = get_cache_dir(&app_handle)?;

    // Remove all files in cache directory
    for entry in fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed to read cache dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        fs::remove_file(entry.path())
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }

    // Clear state
    let state = MediaCacheState::default();
    save_cache_state(&app_handle, &state).await?;

    tracing::info!("Media cache cleared");
    Ok(())
}

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats(app_handle: AppHandle) -> Result<CacheStats, String> {
    let state = load_cache_state(&app_handle).await?;

    Ok(CacheStats {
        entry_count: state.entries.len(),
        total_size: state.total_size,
        max_size: MAX_CACHE_SIZE_MB * 1024 * 1024,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub entry_count: usize,
    pub total_size: u64,
    pub max_size: u64,
}

/// Test command to emit an event to the frontend (for debugging event system)
#[tauri::command]
pub async fn test_emit_event(app_handle: AppHandle, message: String) -> Result<(), String> {
    tracing::info!("test_emit_event called with message: {}", message);
    let payload = serde_json::json!({
        "message": message,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    tracing::info!("Emitting test-event: {}", payload);
    let _ = app_handle.emit("test-event", payload);
    Ok(())
}

/// Information about a display/monitor
#[derive(serde::Serialize, Clone)]
pub struct MonitorInfo {
    pub id: i32,
    pub name: String,
    pub position_x: i32,
    pub position_y: i32,
    pub size_x: u32,
    pub size_y: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Get all available displays/monitors on the system (desktop only)
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn get_available_monitors(app_handle: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = app_handle.get_webview_window("main")
        .ok_or("No main window found")?;

    let monitors = window.available_monitors()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    // Get the primary monitor to identify which one is primary
    let primary_monitor = window.primary_monitor()
        .ok()
        .flatten();

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

        result.push(MonitorInfo {
            id: idx as i32,
            name: monitor.name()
                .map(|n| n.to_string())
                .unwrap_or_else(|| format!("Display {}", idx + 1)),
            position_x: monitor.position().x,
            position_y: monitor.position().y,
            size_x: monitor.size().width,
            size_y: monitor.size().height,
            scale_factor: monitor.scale_factor(),
            is_primary,
        });
    }

    Ok(result)
}

/// Open a display window on a specific monitor (desktop only)
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn open_display_window(
    app_handle: AppHandle,
    display_name: String,
    monitor_id: i32,
) -> Result<String, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let window = app_handle.get_webview_window("main")
        .ok_or("No main window found")?;

    // Get the target monitor
    let monitors = window.available_monitors()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    let target_monitor = monitors.get(monitor_id as usize)
        .ok_or(format!("Monitor {} not found", monitor_id))?;

    // Generate a unique label for the display window
    let window_label = format!("display-{}", monitor_id);

    // Check if window already exists
    if app_handle.get_webview_window(&window_label).is_some() {
        return Err(format!("Display window {} already exists", monitor_id));
    }

    let monitor_size = target_monitor.size();
    let monitor_pos = target_monitor.position();

    tracing::info!(
        "Opening display window '{}' on monitor {} ({}x{} at {},{})",
        display_name,
        monitor_id,
        monitor_size.width,
        monitor_size.height,
        monitor_pos.x,
        monitor_pos.y
    );

    // Create the display window as a borderless window sized to match the target monitor
    // This creates a "presentation mode" style window (like PowerPoint/Keynote)
    // rather than using macOS's native fullscreen which has limitations
    // URL encode the display name to handle special characters
    let encoded_name = urlencoding::encode(&display_name);
    let _display_window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        WebviewUrl::App(format!("/live/display?eventId=default&displayName={}&localMode=true", encoded_name).into())
    )
    .position(monitor_pos.x as f64, monitor_pos.y as f64)
    .inner_size(monitor_size.width as f64, monitor_size.height as f64)
    .resizable(false)
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .build()
    .map_err(|e| format!("Failed to create display window: {}", e))?;

    tracing::info!("Display window '{}' created at ({},{}) size {}x{}",
        display_name, monitor_pos.x, monitor_pos.y, monitor_size.width, monitor_size.height);

    Ok(window_label)
}

/// Auto-start display windows for all available monitors (except primary) (desktop only)
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn auto_start_display_windows(app_handle: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let window = app_handle.get_webview_window("main")
        .ok_or("No main window found")?;

    let monitors = window.available_monitors()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    // Get the primary monitor to exclude it
    let primary_monitor = window.primary_monitor()
        .ok()
        .flatten();

    let mut opened_displays = Vec::new();

    for (idx, monitor) in monitors.iter().enumerate() {
        // Skip primary monitor (controller runs on main display)
        let is_primary = primary_monitor
            .as_ref()
            .map(|pm| {
                pm.name() == monitor.name() &&
                pm.position() == monitor.position() &&
                pm.size() == monitor.size()
            })
            .unwrap_or(false);

        if is_primary {
            tracing::info!("Skipping primary monitor: {} ({})", monitor.name().unwrap_or(&"?".to_string()), idx);
            continue;
        }

        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let display_name = monitor.name()
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("Display {}", idx + 1));
        let window_label = format!("display-{}", idx);

        // Check if window already exists
        if app_handle.get_webview_window(&window_label).is_some() {
            tracing::info!("Display window {} already exists", idx);
            // Add to opened_displays anyway
            opened_displays.push(MonitorInfo {
                id: idx as i32,
                name: display_name.clone(),
                position_x: monitor_pos.x,
                position_y: monitor_pos.y,
                size_x: monitor_size.width,
                size_y: monitor_size.height,
                scale_factor: monitor.scale_factor(),
                is_primary: false,
            });
            continue;
        }

        tracing::info!(
            "Auto-opening display window '{}' on monitor {} ({}x{} at {},{})",
            display_name,
            idx,
            monitor_size.width,
            monitor_size.height,
            monitor_pos.x,
            monitor_pos.y
        );

        // Create the display window
        // URL encode the display name to handle special characters (spaces, etc.)
        let encoded_name = urlencoding::encode(&display_name);
        let display_window = WebviewWindowBuilder::new(
            &app_handle,
            &window_label,
            WebviewUrl::App(format!("/live/display?eventId=default&displayName={}&localMode=true", encoded_name).into())
        )
        .position(monitor_pos.x as f64, monitor_pos.y as f64)
        .inner_size(monitor_size.width as f64, monitor_size.height as f64)
        .resizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build();

        match display_window {
            Ok(_) => {
                tracing::info!("Display window '{}' opened successfully", display_name);
                opened_displays.push(MonitorInfo {
                    id: idx as i32,
                    name: display_name.clone(),
                    position_x: monitor_pos.x,
                    position_y: monitor_pos.y,
                    size_x: monitor_size.width,
                    size_y: monitor_size.height,
                    scale_factor: monitor.scale_factor(),
                    is_primary: false,
                });
            }
            Err(e) => {
                tracing::error!("Failed to open display window '{}': {}", display_name, e);
            }
        }
    }

    tracing::info!("Auto-started {} display windows", opened_displays.len());
    Ok(opened_displays)
}

/// Close a display window (desktop only)
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn close_display_window(
    app_handle: AppHandle,
    monitor_id: i32,
) -> Result<(), String> {
    let window_label = format!("display-{}", monitor_id);

    let display_window = app_handle.get_webview_window(&window_label)
        .ok_or(format!("Display window {} not found", monitor_id))?;

    display_window.destroy()
        .map_err(|e| format!("Failed to close display window: {}", e))?;

    tracing::info!("Display window {} closed", monitor_id);

    Ok(())
}

/// Get the current platform (desktop or android)
#[tauri::command]
pub async fn get_platform() -> String {
    #[cfg(target_os = "android")]
    return "android".to_string();

    #[cfg(not(target_os = "android"))]
    return "desktop".to_string();
}

/// Get the auto-start mode
#[tauri::command]
pub fn get_auto_start_mode(app_handle: AppHandle) -> String {
    let mode = app_handle.state::<Arc<crate::AutoStartMode>>();
    let mode = **mode.inner();
    match mode {
        crate::AutoStartMode::Controller => "controller".to_string(),
        crate::AutoStartMode::Display => "display".to_string(),
        crate::AutoStartMode::None => "none".to_string(),
    }
}

/// Auto-start test mode - placeholder for future WebSocket implementation
pub fn start_auto_test(_app_handle: AppHandle, mode: crate::AutoStartMode) {
    tracing::info!("AUTO-START: Mode {:?}", mode);
    // TODO: Implement WebSocket auto-start logic
}

// ============================================================================
// WebSocket Commands
// ============================================================================

use crate::websocket::{WebSocketServer, WsMessage, LyricsData, SlideData};

/// Start the WebSocket server
#[tauri::command]
pub async fn start_websocket_server(app: tauri::AppHandle) -> Result<u16, String> {
    tracing::info!("start_websocket_server called");

    let ws_state = app.state::<Arc<tokio::sync::Mutex<WebSocketServer>>>();
    let mut server = ws_state.lock().await;

    let port = server.start(0).await?;  // 0 = auto-assign port
    tracing::info!("WebSocket server started on port {}", port);

    Ok(port)
}

/// Publish lyrics to connected displays
#[tauri::command]
pub async fn publish_lyrics(
    app: tauri::AppHandle,
    church_id: String,
    event_id: String,
    song_id: String,
    title: String,
    lyrics: String,
    background_url: Option<String>,
) -> Result<(), String> {
    let ws_state = app.state::<Arc<tokio::sync::Mutex<WebSocketServer>>>();
    let server = ws_state.lock().await;

    let message = WsMessage::Lyrics(LyricsData {
        church_id,
        event_id,
        song_id,
        title,
        lyrics,
        background_url,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
    });

    server.broadcast(message).await
}

/// Publish slide change to connected displays
#[tauri::command]
pub async fn publish_slide(
    app: tauri::AppHandle,
    church_id: String,
    event_id: String,
    song_id: String,
    slide_index: usize,
) -> Result<(), String> {
    let ws_state = app.state::<Arc<tokio::sync::Mutex<WebSocketServer>>>();
    let server = ws_state.lock().await;

    let message = WsMessage::Slide(SlideData {
        church_id,
        event_id,
        song_id,
        slide_index,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
    });

    server.broadcast(message).await
}

/// Discover display devices via mDNS with UDP broadcast fallback
/// Tries mDNS first, then falls back to UDP broadcast if no devices found
/// Skips discovery when running in display mode (displays advertise, they don't discover)
#[tauri::command]
pub async fn discover_display_devices(
    app: tauri::AppHandle,
    timeout_secs: Option<u64>,
) -> Result<Vec<crate::mdns::DiscoveredDevice>, String> {
    // Skip discovery when running in display mode to avoid mDNS daemon conflicts
    let auto_start_mode = app.state::<Arc<crate::AutoStartMode>>();
    if **auto_start_mode == crate::AutoStartMode::Display {
        tracing::info!("Display mode detected, skipping mDNS discovery (displays advertise only)");
        return Ok(Vec::new());
    }

    let timeout = timeout_secs.unwrap_or(5);

    // Try mDNS first
    let devices = crate::mdns::discover_disdevices(timeout).await;

    if !devices.is_empty() {
        tracing::info!("Found {} devices via mDNS", devices.len());
        return Ok(devices);
    }

    tracing::info!("No devices found via mDNS, trying UDP broadcast fallback");
    // Fall back to UDP broadcast
    let udp_devices = crate::mdns::udp_broadcast_discover(timeout).await;

    if !udp_devices.is_empty() {
        tracing::info!("Found {} devices via UDP broadcast", udp_devices.len());
    } else {
        tracing::warn!("No devices found via mDNS or UDP broadcast");
    }

    Ok(udp_devices)
}

/// Start the UDP broadcast listener (for Android TV displays)
/// This allows the display to respond to UDP broadcast discovery requests
#[tauri::command]
pub async fn start_udp_listener(
    app: tauri::AppHandle,
    port: u16,
    ws_port: u16,
) -> Result<(), String> {
    // Start UDP listener to respond to discovery requests
    let handle = crate::mdns::start_udp_listener(port, ws_port);
    tracing::info!("UDP broadcast listener started on port {} for WS port {}", port, ws_port);

    // Store the handle in app state to keep it alive
    app.manage(UdpListenerHandle(Some(handle)));

    Ok(())
}

// Wrapper to keep the UDP listener task alive
struct UdpListenerHandle(Option<tokio::task::JoinHandle<()>>);

/// Start advertising this device as a display
#[tauri::command]
pub async fn start_advertising(
    app: tauri::AppHandle,
    name: String,
    port: u16,
) -> Result<(), String> {
    let advertiser = app.state::<Arc<crate::mdns::AdvertiserState>>();
    advertiser.advertise(&name, port).await
}
