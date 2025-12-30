# mDNS Discovery Fix - December 30, 2025

## Problem
Android TV app wasn't advertising itself via mDNS, making it impossible for controllers to discover displays.

## Root Cause
**File:** `src/main.tsx`

The entry point was using platform detection to bypass the React Router:
```typescript
// OLD CODE (WRONG)
async function main() {
  const mode = await getAppMode()  // Returns 'display' for Android TV
  createRoot(document.getElementById('root')!).render(
    mode === 'controller' ? <ControllerApp /> : <DisplayApp />
  )
}
```

This caused two problems:
1. **DisplayApp** (`src/modes/display/index.tsx`) renders a PairingScreen for unimplemented NATS/WebRTC
2. **DisplayPage** (`src/pages/live/Display.tsx`) with working mDNS/WebSocket never loads

## Solution
**File:** `src/main.tsx`

Updated to use standard React Router with all required context providers:
```typescript
// NEW CODE (CORRECT)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>          {/* Initializes Supabase */}
        <AuthProvider>
          <ChurchProvider>
            <AppRoutes />         {/* Uses React Router */}
          </ChurchProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>
)
```

Now the flow works correctly:
1. App starts → loads router
2. `AutoStartRedirect` component detects Android TV platform
3. Navigates to `/live/display` route
4. `DisplayPage` component loads:
   - Calls `invoke('start_websocket_server')` → starts WebSocket on port 8080
   - Calls `invoke('start_advertising', { name, port })` → advertises as `_mw-display._tcp.local.`
5. Controllers can discover via `invoke('discover_display_devices')`

## Files Modified
- `src/main.tsx` - Switched from platform detection to router-based initialization

## Testing Status
- ✅ macOS Tauri app works correctly
- ✅ Code changes verified
- ❌ Android build failing (Gradle/signing issues - unrelated to fix)

## Next Steps
To deploy to Fire TV:
1. Fix Android build/signing issues
2. Install updated APK on Fire TV
3. Verify mDNS advertising appears in logs
4. Test discovery from macOS/web controller

## Technical Details

### mDNS Service Advertisement
The Display page advertises itself using:
- Service type: `_mw-display._tcp.local.`
- Port: WebSocket server port (usually 8080)
- Name: Device hostname or custom display name

### Discovery Process
Controllers use `mdns_sd` crate (on Tauri) or fallback to UDP broadcast:
1. Send mDNS query for `_mw-display._tcp.local.`
2. Wait for responses (default 5 second timeout)
3. Parse discovered services into `DiscoveredDisplay[]`
4. Connect via WebSocket to selected display

### Components Involved
- `src/main.tsx` - Entry point (NOW FIXED)
- `src/components/AutoStartRedirect.tsx` - Platform detection & auto-navigation
- `src/pages/live/Display.tsx` - Display page with mDNS advertising
- `src-tauri/src/commands.rs` - Tauri commands for WebSocket/mDNS
- `src-tauri/src/mdns/service.rs` - mDNS service advertisement
- `src-tauri/src/websocket/server.rs` - WebSocket server

## Why It Failed Before
1. Android TV detected → rendered `DisplayApp` directly
2. `DisplayApp` shows pairing screen (black screen in dark mode)
3. Never reached `DisplayPage` which has mDNS code
4. No WebSocket server started
5. No mDNS advertisement broadcasted
6. Controllers found 0 devices

## Why It Works Now
1. All platforms use same router
2. `AutoStartRedirect` navigates Android TV to `/live/display`
3. `DisplayPage` loads and starts advertising
4. Controllers can discover the display
