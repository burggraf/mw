# Automatic External Display Management - Design Document

**Date:** 2026-01-06
**Status:** Draft
**Platform:** macOS (Tauri)

## Overview

Replace manual "Display Mode" button with automatic detection and management of external displays. When the macOS app launches, it automatically opens display windows on all connected external monitors, advertises them via mDNS/WebSocket, and monitors for hot-plug events.

## Requirements

| Requirement | Decision |
|-------------|----------|
| When to open display windows | On app startup |
| Hot-plug behavior | Auto-open window within 5 seconds |
| Disconnect behavior | Close window, keep DB entry (shows offline) |
| Primary display | Never used for display windows |
| Existing Display Mode UI | Remove entirely |
| Poll frequency | 5 seconds |

## System Behavior

### Startup Flow

1. App launches, main window opens on primary display
2. `DisplayManager::start_monitoring()` called from `main.rs`
3. Query all connected monitors via `get_available_monitors()`
4. Filter out primary display
5. For each external display:
   - Open borderless fullscreen window on that monitor
   - Start mDNS advertising with display's EDID-derived UUID
   - Register in DisplayManager state
6. Begin 5-second polling loop

### Hot-Plug Detection (Every 5 Seconds)

```
current_monitors = get_available_monitors()
tracked_windows = DisplayManager.get_open_displays()

# New displays
for monitor in current_monitors:
    if monitor.display_id not in tracked_windows and not monitor.is_primary:
        open_display_with_advertising(monitor)

# Removed displays
for display_id in tracked_windows:
    if display_id not in current_monitors:
        close_display_window(display_id)
```

### Per-Display Identity

Each display gets a persistent UUID derived from EDID hardware fingerprinting:

- **Source:** Manufacturer ID + Product Code + Serial Number + Model Name
- **Algorithm:** UUID v5 (deterministic)
- **Persistence:** Survives app restarts, reboots, cable reconnections
- **Fallback:** If EDID unavailable: `fallback:{index}:{name}:{resolution}`

### mDNS Advertising

Each display window advertises via `_mw-display._tcp.local.` with TXT records:

| Field | Value |
|-------|-------|
| `display_id` | EDID-derived UUID (primary identifier) |
| `device_id` | Machine UUID (groups displays on same Mac) |
| `display_name` | Human-readable name from EDID or OS |
| `width` | Resolution width in pixels |
| `height` | Resolution height in pixels |
| `platform` | "macOS {version}" |

### Discovery Integration

The Displays page "Discover" button finds auto-opened displays the same way it finds Android TV devices. Users add them to the database with name/location, then select them during Events for broadcasting.

## Technical Implementation

### New Rust Module: `display_manager`

```
src-tauri/src/display_manager/
├── mod.rs          # DisplayManager struct and start_monitoring()
├── state.rs        # HashMap<display_id, window_label> tracking
└── lifecycle.rs    # open_display_with_advertising(), close_display_window()
```

### DisplayManager Struct

```rust
pub struct DisplayManager {
    // Track which displays have open windows
    open_displays: Arc<Mutex<HashMap<String, String>>>, // display_id -> window_label
    // Handle to stop the polling task on shutdown
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl DisplayManager {
    pub fn new() -> Self;
    pub async fn start_monitoring(app: AppHandle) -> Result<(), Error>;
    pub async fn stop_monitoring(&mut self);
    fn poll_displays(app: &AppHandle) -> Result<(), Error>;
}
```

### Key Functions

**`open_display_with_advertising()`**
- Creates borderless window at monitor's position/size
- Window label: `display-{display_id}`
- URL: `/live/display?displayId={id}&displayName={name}&localMode=true`
- Calls `start_advertising()` with display info
- Registers in DisplayManager state

**`close_display_window()`**
- Calls `stop_advertising()` for the display
- Closes the Tauri window
- Removes from DisplayManager state

### Startup Integration

In `main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure main window is ready
                tokio::time::sleep(Duration::from_secs(1)).await;
                if let Err(e) = DisplayManager::start_monitoring(handle).await {
                    eprintln!("Failed to start display monitoring: {}", e);
                }
            });
            Ok(())
        })
        // ... rest of builder
}
```

### Existing Code Reuse

| Existing | Reuse |
|----------|-------|
| `get_available_monitors()` | Returns EDID-fingerprinted monitor info |
| `start_advertising()` | mDNS service registration |
| `stop_advertising()` | mDNS service cleanup |
| `open_display_window()` | Window creation logic (refactor into lifecycle.rs) |
| Display.tsx | Already handles local mode and heartbeats |

## Frontend Changes

### Removals

- Delete `src/components/displays/DisplayModeSidebar.tsx`
- Remove "Display Mode" button from sidebar/header
- Remove related imports and state

### Modifications

- `Display.tsx`: Ensure advertising starts automatically in local mode (likely already works)

### No Changes Needed

- `Displays.tsx`: Discovery already works with mDNS
- `Controller.tsx`: Broadcasting already targets by display_id
- Database schema: Already supports multiple displays per device

## Edge Cases

| Case | Handling |
|------|----------|
| Startup race condition | 1-second delay before opening display windows |
| EDID read failure | Fallback ID generation |
| Rapid connect/disconnect | 5-second polling debounces naturally |
| Port conflicts | Dynamic port per display (existing behavior) |
| Window already exists | Check before opening, skip if exists |
| App shutdown | Tauri closes all windows, mDNS unregisters |
| No external displays | App works as controller-only |

## Testing Plan

1. **Startup with external displays:** Verify windows open automatically
2. **Hot-plug connect:** Plug in display, verify window opens within 5 seconds
3. **Hot-plug disconnect:** Unplug display, verify window closes, DB shows offline
4. **Multiple displays:** Connect 2-3 displays, verify each gets independent window
5. **Discovery:** Verify auto-opened displays appear in "Discover Displays"
6. **Broadcasting:** Add display to DB, use in Event, verify content displays
7. **Reboot persistence:** Restart app, verify same display_id is recognized
8. **Primary display:** Verify main app window never gets display overlay

## Migration

No database migration needed. Existing registered displays will show offline until re-discovered with the new auto-advertising system, then will match by `display_id` and come back online.
