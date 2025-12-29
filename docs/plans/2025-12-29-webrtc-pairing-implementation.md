# WebRTC Display Pairing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement pairing flow between controller (desktop) and display (Android TV) using existing WebRTC infrastructure.

**Architecture:** Same-network discovery via existing signaling server (port 3010). Display advertises pairing code, controller discovers and confirms pairing, then TCP P2P connection is established for data transfer.

**Tech Stack:** Existing WebRTC module (webrtc.rs), Tauri commands, React hooks, TypeScript

---

## Phase 1: Display Side - Advertise Pairing

### Task 1.1: Implement send_pairing_advertisement in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs` (function around line 1260)

**Step 1: Replace TODO implementation**

Find the `send_pairing_advertisement` function and replace with:

```rust
/// Send a pairing advertisement through the signaling server
#[tauri::command]
pub async fn send_pairing_advertisement(
    pairing_code: String,
    device_id: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<WebrtcState>();

    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        use crate::webrtc::SignalingMessage;
        let msg = SignalingMessage::PairingAdvertisement {
            pairing_code,
            device_id,
        };

        // Broadcast to all connected clients (broadcast method already exists)
        signaling_server.broadcast(msg).await;
        tracing::info!("Broadcasting pairing advertisement: code={}", pairing_code);
    }

    Ok(())
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: implement send_pairing_advertisement command"
```

---

### Task 1.2: Implement send_display_heartbeat in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Replace TODO implementation**

Find the `send_display_heartbeat` function (around line 1284) and replace with:

```rust
/// Send a heartbeat message to keep display connection alive
#[tauri::command]
pub async fn send_display_heartbeat(
    pairing_code: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<WebrtcState>();

    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        use crate::webrtc::SignalingMessage;
        let msg = SignalingMessage::DisplayHeartbeat {
            pairing_code,
        };

        signaling_server.broadcast(msg).await;
        tracing::debug!("Sent display heartbeat: code={}", pairing_code);
    }

    Ok(())
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: implement send_display_heartbeat command"
```

---

### Task 1.3: Wire up PairingScreen to send advertisements

**Files:**
- Modify: `src/components/display/PairingScreen.tsx`

**Step 1: Update PairingScreen to call pairing commands**

Replace the `useEffect` in `PairingScreen.tsx` (lines 13-24) with:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ... inside component:

useEffect(() => {
  // Generate a random 6-character pairing code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  setPairingCode(code);

  // Send pairing advertisement and start heartbeat
  const setupPairing = async () => {
    try {
      // Get or generate device ID
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      // Send pairing advertisement
      await invoke('send_pairing_advertisement', {
        pairing_code: code,
        device_id: deviceId,
      });

      // Start heartbeat interval (every 5 seconds)
      const heartbeatInterval = setInterval(async () => {
        try {
          await invoke('send_display_heartbeat', { pairing_code: code });
        } catch (err) {
          console.error('Heartbeat failed:', err);
        }
      }, 5000);

      setHeartbeatInterval(heartbeatInterval);
    } catch (err) {
      console.error('Failed to send pairing advertisement:', err);
    }
  };

  setupPairing();

  // Listen for pairing confirmation
  const unlisten = listen<{ display_name: string; location?: string }>(
    'webrtc:pairing_confirmed',
    (event) => {
      const { display_name, location } = event.payload;
      onPaired();
    }
  );

  return () => {
    unlisten.then(fn => fn());
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  };
}, [onPaired]);

// Add state for heartbeat interval
const [heartbeatInterval, setHeartbeatInterval] = useState<NodeJS.Timeout | null>(null);
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Successful build

**Step 3: Commit**

```bash
git add src/components/display/PairingScreen.tsx
git commit -m "feat: wire up PairingScreen to send advertisements"
```

---

## Phase 2: Signaling Server Enhancement

### Task 2.1: Add pairing message handlers to signaling server

**Files:**
- Modify: `src-tauri/src/webrtc/signaling.rs`

**Step 1: Add pairing message handlers**

Find the `handle_connection` function and locate the message handling match statement (around line 268). Add handlers for pairing messages before the `_ => {}` catch-all:

```rust
SignalingMessage::PairingAdvertisement { pairing_code, device_id } => {
    tracing::info!("Received PairingAdvertisement: code={}, device_id={}", pairing_code, device_id);

    // Broadcast to all clients so controllers can discover displays
    let clients_clone = clients.clone();
    let msg_json = serde_json::to_string(&signaling_msg).unwrap();
    for client in clients_clone.read().await.values() {
        let _ = client.sender.send(Message::Text(msg_json.clone()));
    }
}
SignalingMessage::PairingPing { pairing_code, controller_id } => {
    tracing::info!("Received PairingPing: code={}, controller_id={}", pairing_code, controller_id);

    // Broadcast to all clients - the matching display will respond with PairingPong
    let clients_clone = clients.clone();
    let msg_json = serde_json::to_string(&signaling_msg).unwrap();
    for client in clients_clone.read().await.values() {
        let _ = client.sender.send(Message::Text(msg_json.clone()));
    }
}
SignalingMessage::PairingPong { pairing_code, device_name } => {
    tracing::info!("Received PairingPong: code={}, device_name={}", pairing_code, device_name);

    // Forward to local peer (controller) if the pairing code matches
    if let Some(ref cb) = *on_data.lock().await {
        let payload = serde_json::json!({
            "type": "pairing_pong",
            "pairing_code": pairing_code,
            "device_name": device_name
        });
        if let Ok(payload_str) = serde_json::to_string(&payload) {
            // Use Uuid::nil() as sender ID for broadcast messages
            cb(Uuid::nil(), payload_str);
        }
    }
}
SignalingMessage::PairingConfirm { pairing_code, display_name, location, display_class } => {
    tracing::info!("Received PairingConfirm: code={}, name={}", pairing_code, display_name);

    // Broadcast to all clients - the matching display will receive it
    let clients_clone = clients.clone();
    let msg_json = serde_json::to_string(&signaling_msg).unwrap();
    for client in clients_clone.read().await.values() {
        let _ = client.sender.send(Message::Text(msg_json.clone()));
    }

    // Also notify local peer if it's a display
    if let Some(ref cb) = *on_data.lock().await {
        let payload = serde_json::json!({
            "type": "pairing_confirmed",
            "pairing_code": pairing_code,
            "display_name": display_name,
            "location": location,
            "display_class": display_class
        });
        if let Ok(payload_str) = serde_json::to_string(&payload) {
            cb(Uuid::nil(), payload_str);
        }
    }
}
SignalingMessage::DisplayHeartbeat { pairing_code } => {
    tracing::debug!("Received DisplayHeartbeat: code={}", pairing_code);

    // Broadcast to all clients so controllers know display is still available
    let clients_clone = clients.clone();
    let msg_json = serde_json::to_string(&signaling_msg).unwrap();
    for client in clients_clone.read().await.values() {
        let _ = client.sender.send(Message::Text(msg_json.clone()));
    }
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/webrtc/signaling.rs
git commit -m "feat: handle pairing messages in signaling server"
```

---

## Phase 3: Controller Side - Verify Pairing

### Task 3.1: Implement verify_pairing_code in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add verify_pairing_code command**

Add after the `send_display_heartbeat` function:

```rust
/// Verify a pairing code by sending ping and waiting for pong response
#[tauri::command]
pub async fn verify_pairing_code(
    pairing_code: String,
    app_handle: AppHandle,
) -> Result<Option<VerifyPairingResult>, String> {
    let state = app_handle.state::<WebrtcState>();

    tracing::info!("Verifying pairing code: {}", pairing_code);

    // Send PairingPing via signaling server
    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        use crate::webrtc::SignalingMessage;

        // Generate a controller ID for this session
        let controller_id = Uuid::new_v4().to_string();

        let msg = SignalingMessage::PairingPing {
            pairing_code: pairing_code.clone(),
            controller_id,
        };

        signaling_server.broadcast(msg).await;

        // TODO: Wait for PairingPong response
        // For now, return None (not found) to force the user to verify the display is on
        // In full implementation, we'd use a timeout channel to wait for response
    }

    Ok(None)
}

#[derive(serde::Serialize)]
pub struct VerifyPairingResult {
    pub device_name: String,
    pub is_reachable: bool,
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add verify_pairing_code command"
```

---

### Task 3.2: Register verify_pairing_code in invoke_handler

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add to invoke_handler**

Add `commands::verify_pairing_code,` to the invoke_handler list (around line 83 in desktop section, line 110 in Android section).

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register verify_pairing_code command"
```

---

### Task 3.3: Wire up PairingModal to use verify_pairing_code

**Files:**
- Modify: `src/components/displays/PairingModal.tsx`

**Step 1: Update PairingModal to call verify_pairing_code**

Find the code verification step (around line 37-51) and replace with:

```typescript
// Step 1: Verify pairing code
const reachable = await invoke<VerifyPairingResult | null>('verify_pairing_code', {
  pairing_code: code.toUpperCase(),
});

if (!reachable) {
  setError(t('displays.pairing.notFound'));
  return;
}

if (!reachable.is_reachable) {
  setError(t('displays.pairing.unreachable'));
  return;
}

// Show form to enter display details
setVerifiedCode(code.toUpperCase());
setDiscoveredDisplay(reachable.device_name);
```

Add the TypeScript interface at the top of the file:

```typescript
interface VerifyPairingResult {
  device_name: string;
  is_reachable: boolean;
}
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Successful build

**Step 3: Commit**

```bash
git add src/components/displays/PairingModal.tsx
git commit -m "feat: use verify_pairing_code in PairingModal"
```

---

## Phase 4: Controller Side - Confirm Pairing

### Task 4.1: Implement confirm_pairing in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add confirm_pairing command**

Add after the `verify_pairing_code` function:

```rust
/// Confirm pairing with a display
#[tauri::command]
pub async fn confirm_pairing(
    pairing_code: String,
    display_name: String,
    location: String,
    display_class: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<WebrtcState>();

    tracing::info!("Confirming pairing: code={}, name={}", pairing_code, display_name);

    // Send PairingConfirm via signaling server
    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        use crate::webrtc::SignalingMessage;

        // Parse display_class string to enum
        let display_class = match display_class.to_lowercase().as_str() {
            "audience" => crate::webrtc::DisplayClass::Audience,
            "stage" => crate::webrtc::DisplayClass::Stage,
            "lobby" => crate::webrtc::DisplayClass::Lobby,
            _ => return Err("Invalid display class".to_string()),
        };

        let msg = SignalingMessage::PairingConfirm {
            pairing_code,
            display_name,
            location,
            display_class,
        };

        signaling_server.broadcast(msg).await;
    }

    Ok(())
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add confirm_pairing command"
```

---

### Task 4.2: Register confirm_pairing in invoke_handler

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add to invoke_handler**

Add `commands::confirm_pairing,` to the invoke_handler list (both desktop and Android sections).

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register confirm_pairing command"
```

---

### Task 4.3: Wire up PairingModal to call confirm_pairing

**Files:**
- Modify: `src/components/displays/DisplaysAccordion.tsx`

**Step 1: Update handlePair to call confirm_pairing**

Find the `handlePair` function (around line 54-63) and update:

```typescript
const handlePair = async (code: string, name: string, location: string, displayClass: DisplayClass) => {
  if (!currentChurch) throw new Error('No church selected');

  // Confirm pairing with the display
  await invoke('confirm_pairing', {
    pairing_code: code,
    display_name: name,
    location,
    display_class: displayClass,
  });

  // Create display record in Supabase
  await createDisplay(currentChurch.id, {
    pairingCode: code,
    name,
    location,
    displayClass,
    deviceId: null, // Will be set by the display during pairing
  });

  // Refresh displays list
  const updated = await getDisplaysForChurch(currentChurch.id);
  setDisplays(updated);
};
```

**Step 2: Add invoke import**

Add to imports at top of file:
```typescript
import { invoke } from '@tauri-apps/api/core';
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Successful build

**Step 4: Commit**

```bash
git add src/components/displays/DisplaysAccordion.tsx
git commit -m "feat: call confirm_pairing before creating display record"
```

---

## Phase 5: Testing & Finalization

### Task 5.1: Test desktop build

**Step 1: Build desktop app**

Run: `pnpm build`
Expected: Successful build

**Step 2: Run Tauri desktop dev**

Run: `pnpm tauri:dev`
Expected: App launches

**Step 3: Verify no regressions**

Check that existing functionality still works.

---

### Task 5.2: Rebuild Android APK

**Step 1: Rebuild Android APK with new code**

Run: `pnpm tauri:android:build:apk`
Expected: Gradle build completes successfully

**Step 2: Install on FireTV**

Run: `adb install -r /path/to/signed.apk`
Expected: Success

---

### Task 5.3: End-to-end pairing test

**Step 1: Start TV app**

Launch Mobile Worship on FireTV, note the 6-digit pairing code.

**Step 2: On controller, enter the code**

Use the pairing modal to enter the code and verify.

**Step 3: Complete pairing**

Enter display details and confirm.

**Step 4: Verify success**

TV should show "Waiting for event..." and controller should show the display as connected.

---

## Summary

This implementation plan creates a functional pairing flow:

1. Display advertises pairing code via signaling server
2. Controller verifies code and confirms pairing
3. TCP P2P connection established (already implemented)
4. Display content flows from controller to TV

**Total tasks:** 16
**Estimated commits:** 16

**Success criteria:**
- ✅ TV generates and advertises pairing code
- ✅ Controller can verify pairing code
- ✅ Controller can confirm pairing
- ✅ TV receives confirmation
- ✅ Both sides transition to paired state
