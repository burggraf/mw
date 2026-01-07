# Display Enabled Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Only open display windows for registered, enabled displays instead of all external monitors.

**Architecture:** Add `enabled` boolean to displays table. DisplayManager queries Supabase for enabled displays on this device, only opens windows for those. UI shows toggle switch per display.

**Tech Stack:** Supabase (PostgreSQL), Tauri/Rust, React/TypeScript

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20250106000001_displays_add_enabled.sql`

**Step 1: Create migration file**

```sql
-- Add enabled column to displays table
-- Controls whether display windows should auto-open for this display

ALTER TABLE displays ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

-- Add index for queries filtering by enabled status
CREATE INDEX IF NOT EXISTS idx_displays_enabled ON displays(enabled) WHERE enabled = true;
```

**Step 2: Apply migration**

Run: `cd /Users/markb/dev/mw/app && supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20250106000001_displays_add_enabled.sql
git commit -m "feat(db): add enabled column to displays table"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/display.ts`

**Step 1: Add enabled field to Display interface**

In `src/types/display.ts`, add `enabled` field after `isOnline`:

```typescript
  // Status
  isOnline: boolean;
  enabled: boolean; // Whether to auto-open window for this display
  lastSeenAt: string | null;
```

**Step 2: Add enabled to DisplayUpdateInput**

Add to `DisplayUpdateInput` interface:

```typescript
  enabled?: boolean;
```

**Step 3: Commit**

```bash
git add src/types/display.ts
git commit -m "feat(types): add enabled field to Display type"
```

---

### Task 3: Update Display Service

**Files:**
- Modify: `src/services/displays.ts`

**Step 1: Update rowToDisplay to include enabled**

Add after `isOnline`:

```typescript
    isOnline: row.is_online,
    enabled: row.enabled ?? true, // Default to true for backward compat
    lastSeenAt: row.last_seen_at,
```

**Step 2: Add updateDisplayEnabled function**

Add after `updateDisplayHeartbeat`:

```typescript
/**
 * Update display's enabled state
 */
export async function updateDisplayEnabled(displayId: string, enabled: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .update({
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('display_id', displayId);

  if (error) throw error;
}
```

**Step 3: Add getEnabledDisplaysForDevice function**

Add after `getDisplaysByDeviceId`:

```typescript
/**
 * Get enabled displays for a specific device
 * Used by DisplayManager to know which windows to open
 */
export async function getEnabledDisplaysForDevice(deviceId: string): Promise<Display[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('device_id', deviceId)
    .eq('enabled', true)
    .order('name');

  if (error) throw error;
  return (data || []).map(rowToDisplay);
}
```

**Step 4: Update registerLocalDisplay to NOT create new displays**

Replace the existing `registerLocalDisplay` function - it should only UPDATE existing displays, not create new ones:

```typescript
/**
 * Update a local display's online status (heartbeat only)
 * No longer creates displays - they must be added via UI first
 */
export async function registerLocalDisplay(
  churchId: string,
  displayId: string,
  displayName: string,
  deviceId?: string
): Promise<void> {
  const supabase = getSupabase();

  // Only update if the display already exists and is enabled
  const { error } = await supabase
    .from('displays')
    .update({
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq('display_id', displayId)
    .eq('church_id', churchId);

  // Ignore errors - display might not be registered yet
  if (error) {
    console.log('[displays] Display not registered, skipping heartbeat:', displayId);
  }
}
```

**Step 5: Commit**

```bash
git add src/services/displays.ts
git commit -m "feat(displays): add enabled state management functions"
```

---

### Task 4: Add Tauri Command for External Monitors

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add get_external_monitors command**

The command already exists as `get_monitors`. Verify it returns external monitors by checking the file. If it doesn't filter to external only, we can use it as-is since the frontend will filter.

**Step 2: Commit (if changes needed)**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(tauri): ensure get_monitors command available"
```

---

### Task 5: Update DisplayManager to Query Database

**Files:**
- Modify: `src-tauri/src/display_manager/mod.rs`

**Step 1: Add Supabase client dependency**

Add to `Cargo.toml` if not present: `postgrest` or use existing HTTP client.

Actually, the DisplayManager runs in Rust but needs to query Supabase. The cleanest approach is to:
1. Have the frontend query for enabled displays
2. Pass them to Rust via a Tauri command
3. Or: Have DisplayManager call a Tauri event that frontend responds to

**Revised approach:** Use Tauri events for communication:
- Frontend subscribes to `display-manager-query` event
- DisplayManager emits this event when it needs enabled display list
- Frontend responds with `display-manager-response` containing enabled display_ids
- DisplayManager opens windows only for those displays

**Step 2: Modify sync_displays to use enabled list**

Replace the current auto-open logic. In `sync_displays`:

```rust
/// Sync display windows with current monitors
/// Only opens windows for displays that are enabled in the database
async fn sync_displays(&mut self, app: &AppHandle, enabled_display_ids: &HashSet<String>) -> Result<(), String> {
    let current_monitors = Self::get_external_monitors(app)?;

    // Find displays to close (no longer enabled or disconnected)
    let to_close: Vec<_> = self.open_displays.keys()
        .filter(|id| !enabled_display_ids.contains(*id))
        .cloned()
        .collect();

    for display_id in to_close {
        info!("Display disabled or disconnected: {}", display_id);
        self.close_display(app, &display_id)?;
    }

    // Find displays to open (enabled and connected)
    for monitor in current_monitors {
        if enabled_display_ids.contains(&monitor.display_id)
            && !self.open_displays.contains_key(&monitor.display_id) {
            info!("Opening enabled display: {} ({})", monitor.name, monitor.display_id);
            if let Err(e) = self.open_display_with_advertising(app, &monitor).await {
                error!("Failed to open display {}: {}", monitor.display_id, e);
            }
        }
    }

    Ok(())
}
```

**Step 3: Create command for frontend to trigger sync with enabled list**

Add new command in `commands.rs`:

```rust
#[tauri::command]
pub async fn sync_displays_with_enabled(
    app: AppHandle,
    enabled_display_ids: Vec<String>,
) -> Result<(), String> {
    let state = app.state::<Arc<DisplayManagerState>>();
    let enabled_set: HashSet<String> = enabled_display_ids.into_iter().collect();

    let mut manager = state.manager.lock().await;
    manager.sync_displays(&app, &enabled_set).await
}
```

**Step 4: Update polling loop to request enabled list from frontend**

The DisplayManager's polling loop should emit an event asking frontend for enabled displays, then sync.

**Step 5: Commit**

```bash
git add src-tauri/src/display_manager/mod.rs src-tauri/src/commands.rs
git commit -m "feat(display-manager): only open windows for enabled displays"
```

---

### Task 6: Create Frontend Hook for Display Sync

**Files:**
- Modify: `src/hooks/useLocalDisplayManager.ts`

**Step 1: Add sync with enabled displays logic**

Update the hook to:
1. Query enabled displays for this device from Supabase
2. Call `sync_displays_with_enabled` Tauri command with the list
3. Do this on mount and periodically (every 5 seconds)

```typescript
// In useLocalDisplayManager.ts, add:

const syncDisplaysWithEnabled = useCallback(async () => {
  if (!currentChurch || !isTauri()) return;

  try {
    // Get this device's ID
    const deviceId = await safeInvoke<string>('get_device_id');
    if (!deviceId) return;

    // Get enabled displays for this device from Supabase
    const enabledDisplays = await getEnabledDisplaysForDevice(deviceId);
    const enabledIds = enabledDisplays.map(d => d.displayId);

    // Tell DisplayManager which displays to open
    await safeInvoke('sync_displays_with_enabled', { enabledDisplayIds: enabledIds });
  } catch (err) {
    console.error('[LocalDisplayManager] Failed to sync enabled displays:', err);
  }
}, [currentChurch]);

// Call on mount and every 5 seconds
useEffect(() => {
  if (!currentChurch || !isTauri()) return;

  syncDisplaysWithEnabled();
  const interval = setInterval(syncDisplaysWithEnabled, 5000);
  return () => clearInterval(interval);
}, [currentChurch, syncDisplaysWithEnabled]);
```

**Step 2: Commit**

```bash
git add src/hooks/useLocalDisplayManager.ts
git commit -m "feat(hooks): sync display windows with enabled state"
```

---

### Task 7: Update Displays Page UI

**Files:**
- Modify: `src/pages/Displays.tsx`

**Step 1: Add Switch import**

```typescript
import { Switch } from '@/components/ui/switch'
```

**Step 2: Add enabled toggle handler**

```typescript
async function handleToggleEnabled(display: Display) {
  try {
    await updateDisplayEnabled(display.displayId, !display.enabled);
    setDisplays(displays.map(d =>
      d.id === display.id ? { ...d, enabled: !d.enabled } : d
    ));
    toast.success(display.enabled
      ? t('displays.displayDisabled', 'Display disabled')
      : t('displays.displayEnabled', 'Display enabled')
    );
  } catch (error) {
    console.error('Failed to toggle display:', error);
    toast.error(t('common.error'));
  }
}
```

**Step 3: Add import for updateDisplayEnabled**

```typescript
import {
  getDisplaysForChurch,
  addDiscoveredDisplay,
  updateDisplay,
  updateDisplayEnabled,  // Add this
  deleteDisplay,
  markStaleDisplaysOffline,
} from '@/services/displays'
```

**Step 4: Add enabled column to table**

After the Status column in the table header:

```typescript
<TableHead className="min-w-[80px] text-center">{t('displays.enabled', 'Enabled')}</TableHead>
```

And in the table body, after the status cell:

```typescript
<TableCell className="text-center">
  <Switch
    checked={display.enabled}
    onCheckedChange={() => handleToggleEnabled(display)}
  />
</TableCell>
```

**Step 5: Add Available Displays section with auto-detection**

Add state for available (unregistered) monitors:

```typescript
const [availableMonitors, setAvailableMonitors] = useState<MonitorInfo[]>([])
```

Add effect to fetch external monitors and filter to unregistered:

```typescript
// Auto-detect available (unregistered) external monitors
useEffect(() => {
  if (!hasTauri || !currentChurch) return;

  const fetchAvailable = async () => {
    try {
      const monitors = await safeInvoke<MonitorInfo[]>('get_monitors');
      if (!monitors) return;

      // Filter to external monitors only (not primary)
      const external = monitors.filter(m => !m.isPrimary);

      // Filter out already registered displays
      const registeredIds = new Set(displays.map(d => d.displayId));
      const unregistered = external.filter(m => !registeredIds.has(m.displayId));

      setAvailableMonitors(unregistered);
    } catch (err) {
      console.error('Failed to fetch monitors:', err);
    }
  };

  fetchAvailable();
  const interval = setInterval(fetchAvailable, 5000);
  return () => clearInterval(interval);
}, [currentChurch, displays]);
```

Add Available Displays section before Registered Displays:

```typescript
{/* Available (Unregistered) Displays Section */}
{availableMonitors.length > 0 && (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle className="text-lg flex items-center gap-2">
        <Monitor className="h-5 w-5 text-blue-500" />
        {t('displays.availableDisplays', 'Available Displays')}
      </CardTitle>
      <CardDescription>
        {t('displays.availableDescription', 'External monitors connected to this computer. Click Add to enable them.')}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {availableMonitors.map((monitor) => (
          <div
            key={monitor.displayId}
            className="flex flex-col p-4 rounded-lg border bg-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Monitor className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{monitor.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {monitor.sizeX}x{monitor.sizeY}
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={() => openAddMonitorDialog(monitor)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('common.add', 'Add')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

**Step 6: Add handler for adding monitor**

```typescript
const [monitorToAdd, setMonitorToAdd] = useState<MonitorInfo | null>(null);

function openAddMonitorDialog(monitor: MonitorInfo) {
  setFormName(monitor.name);
  setFormLocation('');
  setFormDisplayClass('audience');
  setMonitorToAdd(monitor);
}

async function handleAddMonitor() {
  if (!currentChurch || !monitorToAdd) return;

  try {
    const deviceId = await safeInvoke<string>('get_device_id');
    const newDisplay = await createDisplay(currentChurch.id, {
      displayId: monitorToAdd.displayId,
      deviceId: deviceId || monitorToAdd.displayId,
      name: formName,
      location: formLocation || null,
      displayClass: formDisplayClass,
      manufacturer: monitorToAdd.manufacturer || null,
      model: monitorToAdd.model || null,
      serialNumber: monitorToAdd.serialNumber || null,
      width: monitorToAdd.sizeX,
      height: monitorToAdd.sizeY,
      physicalWidthCm: monitorToAdd.physicalWidthCm || null,
      physicalHeightCm: monitorToAdd.physicalHeightCm || null,
    });

    setDisplays([...displays, newDisplay].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailableMonitors(availableMonitors.filter(m => m.displayId !== monitorToAdd.displayId));
    toast.success(t('displays.displayAdded', 'Display added successfully'));
  } catch (error) {
    console.error('Failed to add display:', error);
    toast.error(t('common.error'));
  } finally {
    setMonitorToAdd(null);
    resetForm();
  }
}
```

**Step 7: Add dialog for adding monitor**

Copy the existing Add Display Dialog but wire it to `monitorToAdd` and `handleAddMonitor`.

**Step 8: Remove Discover button**

Remove the "Discover Displays" button since detection is now automatic.

**Step 9: Add import for MonitorInfo type and createDisplay**

```typescript
import type { Display, DisplayClass, DiscoveredDisplay, MonitorInfo } from '@/types/display'
import { createDisplay } from '@/services/displays'
```

**Step 10: Commit**

```bash
git add src/pages/Displays.tsx
git commit -m "feat(displays): add enabled toggle and auto-detect available monitors"
```

---

### Task 8: Remove Auto-Registration from DisplayManager

**Files:**
- Modify: `src-tauri/src/display_manager/mod.rs`

**Step 1: Remove the auto-emit of local-display-opened event**

The DisplayManager currently emits `local-display-opened` which triggers auto-registration. Remove this since displays should only be registered via UI now.

Comment out or remove:
```rust
// Don't auto-register - displays must be added via UI first
// let _ = app.emit("local-display-opened", LocalDisplayOpened { ... });
```

**Step 2: Commit**

```bash
git add src-tauri/src/display_manager/mod.rs
git commit -m "refactor(display-manager): remove auto-registration of displays"
```

---

### Task 9: Build and Test

**Step 1: Build the app**

```bash
cd /Users/markb/dev/mw/app
pnpm build
pnpm tauri:build
```

**Step 2: Test manually**

1. Launch app with an external monitor connected
2. Verify NO window opens automatically (display not registered)
3. Go to Displays page
4. Verify external monitor appears in "Available Displays" section
5. Click Add, fill form, save
6. Verify display appears in registered list with enabled toggle ON
7. Verify display window opens on external monitor
8. Toggle enabled OFF
9. Verify display window closes
10. Toggle enabled ON
11. Verify display window opens again

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(displays): complete enabled toggle implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Database migration for `enabled` column |
| 2 | TypeScript type updates |
| 3 | Display service functions |
| 4 | Verify Tauri command for monitors |
| 5 | DisplayManager query-based opening |
| 6 | Frontend hook for sync |
| 7 | Displays page UI updates |
| 8 | Remove auto-registration |
| 9 | Build and test |
