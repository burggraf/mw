# WebRTC Display Pairing Implementation Design

**Goal:** Implement pairing flow between controller (desktop) and display (Android TV) using existing WebRTC infrastructure.

**Architecture:** Same-network discovery via existing signaling server (port 3010) + mDNS broadcast for automatic discovery. Display advertises pairing code, controller discovers and confirms pairing, then TCP P2P connection is established for data transfer.

**Tech Stack:** Existing WebRTC module (webrtc.rs), Tauri commands, React hooks

---

## Pairing Flow

```
┌─────────────────┐         mDNS/Signaling        ┌─────────────────┐
│   Controller    │◄─────────────────────────────►│   Display (TV) │
│  (macOS/Win)    │                             │  (Android TV)   │
└─────────────────┘                             └─────────────────┘
       │                                                 │
       │ 1. Discover via mDNS (existing)                 │
       │                                                 │
       │ 2. Show pairing screen                            │
       │    - Enter code OR select from list              │
       │                                                 │
       │ 3. Verify code (PairingPing)                     │
       │◄─────────────────────────────────────────────────►│
       │                                                 │
       │ 4. Receive Pong (PairingPong)                    │
       │◄─────────────────────────────────────────────────►│
       │                                                 │
       │ 5. Confirm pairing (PairingConfirm)               │
       │◄─────────────────────────────────────────────────►│
       │                                                 │
       │ 6. Establish TCP P2P (port 3011)                 │
       │◄─────────────────────────────────────────────────►│
       │                                                 │
       │ 7. Send display content                          │
       ├─────────────────────────────────────────────────►│
```

---

## Message Types (Already Defined)

All pairing messages already exist in `src-tauri/src/webrtc/types.rs`:

- `PairingAdvertisement` - Display broadcasts availability
- `PairingPing` - Controller pings to verify display
- `PairingPong` - Display responds with device info
- `PairingConfirm` - User confirms pairing on controller
- `DisplayHeartbeat` - Display keeps-alive every 5s

---

## Display Side (TV) Implementation

### 1. PairingScreen.tsx

When component mounts:
```typescript
useEffect(() => {
  // Generate pairing code
  const code = generatePairingCode();
  setPairingCode(code);

  // Send pairing advertisement via signaling
  invoke('send_pairing_advertisement', {
    pairing_code: code,
    device_id: await getDeviceId()
  });

  // Start heartbeat interval
  const heartbeat = setInterval(() => {
    invoke('send_display_heartbeat', { pairing_code: code });
  }, 5000);

  // Listen for pairing confirmation
  const unlisten = listen('webrtc:pairing_confirmed', (event) => {
    const { display_name, location } = event.payload;
    setDisplayName(display_name);
    setState('waiting');
  });

  return () => {
    clearInterval(heartbeat);
    unlisten();
  };
}, []);
```

### 2. Rust Commands (commands.rs)

**send_pairing_advertisement:**
```rust
#[tauri::command]
pub async fn send_pairing_advertisement(
    pairing_code: String,
    device_id: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle.state::<WebrtcState>();
    if let Some(signaling_server) = &*state.signaling_server.lock().await {
        // Broadcast to all connected clients
        signaling_server.broadcast(SignalingMessage::PairingAdvertisement {
            pairing_code,
            device_id,
        });
    }
    Ok(())
}
```

**send_display_heartbeat:**
```rust
#[tauri::command]
pub async fn send_display_heartbeat(pairing_code: String) -> Result<(), String> {
    // Send via signaling server to keep pairing alive
    // Implementation uses existing signaling infrastructure
    Ok(())
}
```

---

## Controller Side Implementation

### 1. PairingModal.tsx

**Verification step:**
```typescript
const verifyCode = async (code: string) => {
  const result = await invoke<DisplayInfo | null>('verify_pairing_code', {
    pairing_code: code.toUpperCase()
  });

  if (!result) {
    setError('Display not found or unreachable');
    return;
  }

  // Show display info, prompt for name/location
  setDiscoveredDisplay(result);
};
```

**Confirmation step:**
```typescript
const handlePair = async (code: string, name: string, location: string) => {
  await invoke('confirm_pairing', {
    pairing_code: code,
    display_name: name,
    location,
    display_class: displayClass
  });

  // Create Supabase record
  await createDisplay(churchId, {
    pairingCode: code,
    name,
    location,
    displayClass
  });
};
```

### 2. Rust Commands

**verify_pairing_code:**
```rust
#[tauri::command]
pub async fn verify_pairing_code(
    pairing_code: String,
    app_handle: AppHandle,
) -> Result<Option<DisplayInfo>, String> {
    // Send PairingPing via signaling
    // Wait for PairingPong response
    // Return display info if found
}
```

**confirm_pairing:**
```rust
#[tauri::command]
pub async fn confirm_pairing(
    pairing_code: String,
    display_name: String,
    location: String,
    display_class: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Send PairingConfirm via signaling
    // TV receives and transitions to paired state
}
```

---

## Signaling Server Enhancement

Add handler for `PairingConfirm` in `signaling.rs`:

```rust
SignalingMessage::PairingConfirm { .. } => {
    // Emit event to frontend that pairing is confirmed
    if let Some(ref on_data) = *self.on_data.lock().await {
        on_data(peer_id, serde_json::to_string(msg)?);
    }
}
```

---

## Error Handling

| Scenario | Detection | Response |
|----------|------------|----------|
| Display not found | Ping timeout | "Display not found" |
| Display offline | No Pong response | "Display unreachable" |
| Invalid code | No matching Pong | "Invalid pairing code" |
| Connection lost | Heartbeat fails | Return to pairing state |

---

## Implementation Tasks

1. Implement `send_pairing_advertisement` in Rust
2. Implement `send_display_heartbeat` in Rust
3. Add `PairingConfirm` handler in signaling server
4. Implement `verify_pairing_code` in Rust
5. Implement `confirm_pairing` in Rust
6. Wire up `PairingScreen` to call commands
7. Wire up `PairingModal` to use new flow
8. Test pairing end-to-end

---

## Success Criteria

1. TV generates pairing code and advertises via signaling
2. Controller can verify pairing code (ping/pong)
3. Controller can confirm pairing
4. TV receives confirmation and transitions to waiting state
5. TCP P2P connection established between controller and display
6. Display content flows from controller to TV
