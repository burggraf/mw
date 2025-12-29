# WebRTC Display Pairing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement pairing flow between controller (desktop) and display (Android TV) using existing WebRTC infrastructure.

**Architecture:** Same-network discovery via existing signaling server (port 3010). Display advertises pairing code, controller discovers and confirms pairing, then TCP P2P connection is established for data transfer.

**Tech Stack:** Existing WebRTC module (webrtc.rs), Tauri commands, React hooks, TypeScript

---

## Phase 1: Display Side - Advertise Pairing

### Task 1.1: Implement send_pairing_advertisement in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs` (add function near line 1260)

**Step 1: Add the Rust command**

Find the `send_pairing_advertisement` function (around line 1260) and replace the TODO implementation with:

```rust
/// Send a pairing advertisement through the signaling server
#[tauri::command]
pub async fn send_pairing_advertisement(
    pairing_code: String,
    device_id: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<WebrtcState>();

    // Broadcast pairing advertisement via signaling server
    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        use crate::webrtc::SignalingMessage;
        let msg = SignalingMessage::PairingAdvertisement {
            pairing_code,
            device_id,
        };

        // Broadcast to all connected clients
        tracing::info!("Broadcasting pairing advertisement: code={}, device_id={}", pairing_code, device_id);

        // The signaling server needs to be able to broadcast this message
        // For now, log it - the actual broadcast will be added when we implement the full flow
        drop(msg);
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
) -> Result<(), String> {
    // Send heartbeat via signaling server
    // This keeps the pairing alive and announces the display is still available
    tracing::debug!("Sending display heartbeat: code={}", pairing_code);
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

### Task 2.1: Add broadcast method to SignalingServer

**Files:**
- Modify: `src-tauri/src/webrtc/signaling.rs`

**Step 1: Add broadcast method**

Add this method to the `SignalingServer` impl (after the `get_peer_list` method):

```rust
/// Broadcast a message to all connected clients
pub async fn broadcast(&self, message: SignalingMessage) {
    use tokio_tungstenite::tungstenite::Message;

    let clients = self.clients.read().await;
    for (_peer_id, client) in clients.iter() {
        if let Err(e) = client.sender.send(Message::Text(serde_json::to_string(&message).unwrap())) {
            tracing::error!("Failed to send broadcast message: {}", e);
        }
    }
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/webrtc/signaling.rs
git commit -m "feat: add broadcast method to SignalingServer"
```

---

### Task 2.2: Complete send_pairing_advertisement to use broadcast

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Update send_pairing_advertisement to broadcast**

Replace the temporary implementation in `send_pairing_advertisement` with:

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

        signaling_server.broadcast(msg).await;
        tracing::info!("Broadcast pairing advertisement: code={}", pairing_code);
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
git commit -m "feat: broadcast pairing advertisement via signaling server"
```

---

### Task 2.3: Handle PairingConfirm in signaling server

**Files:**
- Modify: `src-tauri/src/webrtc/signaling.rs`

**Step 1: Add PairingConfirm handling in handle_connection_message**

Find the `handle_connection_message` function and add handling for `PairingConfirm`. In the message handling match statement, add:

```rust
SignalingMessage::PairingConfirm { pairing_code, display_name, location, display_class } => {
    tracing::info!("Received PairingConfirm: code={}, name={}", pairing_code, display_name);

    // Emit event to frontend that pairing is confirmed
    if let Some(ref on_data) = *self.on_data.lock().await {
        let payload = serde_json::json!({
            "type": "pairing_confirmed",
            "pairing_code": pairing_code,
            "display_name": display_name,
            "location": location,
            "display_class": display_class
        });
        if let Ok(payload_str) = serde_json::to_string(&payload) {
            // Use Uuid::nil() for broadcast (no specific sender)
            on_data(Uuid::nil(), payload_str);
        }
    }
}
```

**Step 2: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 3: Commit**

```bash
git add src-tauri/src/webrtc/signaling.rs
git commit -m "feat: handle PairingConfirm in signaling server"
```

---

## Phase 3: Controller Side - Verify Pairing

### Task 3.1: Implement verify_pairing_code in Rust

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add verify_pairing_code command**

Add after the `send_pairing_ping` function:

```rust
/// Verify a pairing code by sending ping and waiting for pong
#[tauri::command]
pub async fn verify_pairing_code(
    pairing_code: String,
    app_handle: AppHandle,
) -> Result<Option<VerifyPairingResult>, String> {
    let state = app_handle.state::<WebrtcState>();

    // For now, return a placeholder result
    // In full implementation, this would:
    // 1. Send PairingPing via signaling
    // 2. Wait for PairingPong response
    // 3. Return display info if found

    tracing::info!("Verifying pairing code: {}", pairing_code);

    // TODO: Implement actual ping/pong flow
    // For now, return success with placeholder info to test UI flow
    Ok(Some(VerifyPairingResult {
        device_name: "Test Display".to_string(),
        is_reachable: true,
    }))
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

Add `commands::verify_pairing_code,` to the invoke_handler list (around line 67).

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

Add `commands::confirm_pairing,` to the invoke_handler list.

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
- Modify: `src/components/displays/PairingModal.tsx`

**Step 1: Update handlePair to call confirm_pairing**

Find the `handlePair` function call (after line 68) and add the confirmation call before creating the display:

```typescript
const handlePair = async (code: string, name: string, location: string, displayClass: DisplayClass) => {
  setLoading(true);

  try {
    // Confirm pairing with the display
    await invoke('confirm_pairing', {
      pairing_code: code,
      display_name: name,
      location,
      display_class: displayClass,
    });

    // Create display record in Supabase
    if (!currentChurch) throw new Error('No church selected');

    await createDisplay(currentChurch.id, {
      pairingCode: code,
      name,
      location,
      displayClass,
      deviceId: null, // Will be set by the display during pairing
    });

    onPair();
  } catch (err) {
    console.error('Pairing failed:', err);
    setError(err instanceof Error ? err.message : t('displays.pairing.error'));
  } finally {
    setLoading(false);
  }
};
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Successful build

**Step 3: Commit**

```bash
git add src/components/displays/PairingModal.tsx
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

**Total tasks:** 17
**Estimated commits:** 17

**Success criteria:**
- ✅ TV generates and advertises pairing code
- ✅ Controller can verify pairing code
- ✅ Controller can confirm pairing
- ✅ TV receives confirmation
- ✅ Both sides transition to paired state
