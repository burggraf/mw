# Display Enabled Toggle Design

## Overview

Change display window management from auto-opening on ALL external monitors to only opening windows for displays that are explicitly registered and enabled.

## Current Behavior

- DisplayManager auto-opens windows on ALL external monitors at startup
- User goes to Displays page, clicks "Discover Displays" to find displays
- Displays are registered in database when user clicks "Add"
- But windows are already open before registration

## New Behavior

- Display windows only open for displays that:
  1. Exist in the database for the current church
  2. Have `enabled = true`
  3. Match the current device's `device_id`
- Enable toggle: window opens immediately (if monitor connected)
- Disable toggle: window closes immediately
- Unregistered monitors appear automatically in "Available" section on Displays page

## Database Changes

Add `enabled` column to displays table:

```sql
ALTER TABLE displays ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;
```

New displays start enabled when added.

## DisplayManager Changes (Rust)

### Current `sync_displays()` behavior:
Opens windows for every external monitor it finds.

### New `sync_displays()` behavior:

1. **Detect external monitors** - Enumerate all connected external monitors
2. **Query enabled displays** - Fetch from Supabase: displays where `device_id = this_device` AND `enabled = true`
3. **Match and open** - For each enabled display in DB:
   - Find matching physical monitor by `display_id` (EDID fingerprint)
   - If monitor is connected AND not already open: open window
   - If monitor is disconnected: close window (if open)
4. **Ignore unregistered monitors** - External monitors not in DB are not opened

### Polling Loop (every 5 seconds):
1. Re-fetch enabled displays from Supabase
2. Re-enumerate connected monitors
3. Compare with currently open windows:
   - New enabled + connected: open window
   - Disabled or disconnected: close window

## UI Changes (Displays Page)

### Registered Displays Table
- Add Switch component for enabled/disabled toggle
- Toggle updates `enabled` in database immediately
- Disabled displays appear slightly dimmed

### Available Displays Section (new)
- Shows unregistered external monitors detected on this device
- Auto-populates when user visits the page
- Card layout with "Add" button to register display

### Remove "Discover Displays" button
- Detection is now automatic for local displays
- mDNS discovery for remote displays can be added later if needed

## Data Flow

### On App Start:
1. DisplayManager waits for app initialization (2 seconds)
2. Fetches enabled displays from Supabase for this `device_id`
3. Enumerates connected external monitors
4. Opens windows only for monitors that match enabled displays

### On Displays Page:
1. Page loads: call `get_external_monitors` Tauri command
2. Show unregistered monitors in "Available" section
3. Show registered displays in table with enabled toggle
4. Toggle change: update DB, DisplayManager picks up on next poll

## Files to Modify

1. **Migration** - Add `enabled` column to displays table
2. **`src-tauri/src/display_manager/mod.rs`** - Query DB before opening windows, respect `enabled` flag
3. **`src/services/displays.ts`** - Add `updateDisplayEnabled()` function
4. **`src/pages/Displays.tsx`** - Add enabled toggle, add "Available Displays" section, remove Discover button
5. **`src/types/display.ts`** - Add `enabled` field to Display type

## New Tauri Command

`get_external_monitors` - Returns list of connected external monitors with their `display_id` for matching against database records.

## Dependencies

DisplayManager needs Supabase access to query enabled displays. Will need to:
- Get `church_id` from authenticated user context, OR
- Query displays by `device_id` only (then filter by church on frontend)

## Scope

- Global `enabled` state (not per-device)
- Simple polling approach (no real-time subscriptions)
- Local displays only (mDNS for remote displays is separate feature)
