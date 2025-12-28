# WebRTC Communication Layer Design

**Date:** 2025-12-28
**Status:** Design Approved
**Related Milestones:** Milestone 0 - WebRTC Foundation

## Overview

The Mobile Worship live control system uses WebRTC data channels for real-time, low-latency communication between operator devices (controllers) and display hosts. Every Tauri application has the capability to become a signaling server through leader election, creating a resilient local-network system that requires no external infrastructure.

## Design Goals

- **Local network only** - No cloud dependencies, all traffic stays on-premises
- **Leader election** - Any device can become the signaling server
- **Low latency** - WebRTC data channels for direct P2P communication
- **Resilient** - Automatic re-election on leader failure
- **Small scale** - Optimized for 1-10 devices, supports up to 20

## Device Roles

### 1. Signaling Server (Leader)

One elected device that:
- Runs the HTTP/WebSocket signaling server on port 3010 (configurable)
- Maintains the peer registry (all connected controllers and displays)
- Facilitates WebRTC connection establishment (SDP/ICE exchange)
- May also be a controller or display itself

### 2. Controller (Operator)

Devices that:
- Send live state changes (slide selection, black screen, etc.)
- Run on macOS/iOS/Windows/Android via Tauri
- Connect to the signaling server, establish data channels to all displays
- Can be elected as leader if needed

### 3. Display Host

Devices that:
- Receive and render the live presentation
- Run on FireTV, macOS, Windows via Tauri
- Listen for state changes via WebRTC data channels
- Can be elected as leader if needed (unusual but supported)

## Network Topology

- **Signaling:** Star topology (all peers → leader)
- **Data:** Full-mesh (each controller connects directly to each display via WebRTC)

## Leader Election

### Algorithm: Bully Variant

**Priority Calculation:**
1. Device type: Controller > Display > Other
2. Startup time: Earlier wins
3. Random UUID tiebreaker

**Discovery Phase:**
```
┌─────────┐     mDNS discover      ┌─────────┐
│ Device  │ ──────────────────────▶ │ Leader  │
│  Start  │ ◀────────────────────── │  Found? │
└─────────┘    (leader advertised)  └────┬────┘
                                            │ No
                                            ▼
                                     ┌──────────────┐
                                     │  Election   │
                                     │  (mDNS)     │
                                     └──────┬───────┘
                                            │
                     ┌────────────────────────┴────────────────────────┐
                     │ I am Leader                                      │ I am Follower
                     ▼                                                  ▼
              ┌──────────────┐                                  ┌──────────────┐
              │ Start WS     │                                  │ Connect to   │
              │ Server on    │                                  │ Leader WS    │
              │ port 3010    │                                  │              │
              └──────────────┘                                  └──────────────┘
```

**Failure Detection & Re-election:**
- Followers send heartbeat to leader every 2 seconds
- If leader misses 3 heartbeats (6 seconds), followers initiate new election
- Leader gracefully shuts down signaling server if it detects another leader (priority tie)

### mDNS Service

```
Service: _mobile-worship._tcp.local
TXT records:
  - leader-id=<uuid>
  - priority=<number>
  - peer-type=<controller|display>
```

## Signaling Protocol

### Registration Message

```json
// Follower → Leader
{
  "type": "register",
  "peerId": "uuid-v4",
  "peerType": "controller" | "display",
  "displayName": "Mark's iPhone",
  "displayClass": "audience" | "stage" | "lobby"
}
```

### WebRTC Signaling Flow

1. Controller sends via WebSocket:
   ```json
   {"type": "offer", "targetPeerId": "...", "sdp": "..."}
   ```

2. Leader forwards to target Display via WebSocket

3. Display responds via WebSocket:
   ```json
   {"type": "answer", "targetPeerId": "...", "sdp": "..."}
   ```

4. Leader forwards to Controller

5. ICE candidates exchanged through Leader until connection established

6. Data channel opens, direct P2P communication begins

## WebRTC Data Channel Communication

### Data Channel Configuration

- Label: `"live-control"`
- Ordered: `true`
- Reliability: Reliable mode

### Live State Messages (Controller → Display)

```typescript
type LiveControlMessage =
  | { type: "slide"; eventId: string; itemId: string; slideIndex: number; messageId: string }
  | { type: "black"; eventId: string; isBlack: boolean; messageId: string }
  | { type: "ping"; timestamp: number }
  | { type: "sync"; eventId: string; fullState: LiveState; messageId: string }
```

### Response Messages (Display → Controller)

```typescript
type LiveControlResponse =
  | { type: "ack"; messageId: string }
  | { type: "pong"; timestamp: number }
  | { type: "error"; code: string; message: string }
```

### Message Delivery Semantics

- Each control message has a UUID for deduplication
- Displays acknowledge with `ack` containing the messageId
- Controllers retry messages without acknowledgment after 100ms
- Idempotent operations (slide, black, sync) safe to retry

## Rust Implementation

### Dependencies

```toml
[dependencies]
webrtc = "0.11"           # WebRTC data channels
tokio-tungstenite = "0.24" # WebSocket server
mdns = "3.0"              # mDNS discovery
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
tokio = { version = "1", features = ["full"] }
```

### Module Structure

```
src-tauri/src/
├── lib.rs           # Tauri commands
├── webrtc/
│   ├── mod.rs       # module exports
│   ├── peer.rs      # Peer struct, connection state
│   ├── signaling.rs # WebSocket signaling server
│   ├── discovery.rs # mDNS leader discovery
│   ├── election.rs  # Leader election logic
│   └── channel.rs   # WebRTC data channel management
└── types.rs         # Shared types for frontend/Rust boundary
```

### Tauri Commands (Frontend ↔ Rust)

```rust
#[tauri::command]
async fn start_peer(
    peer_type: PeerType,
    display_name: String,
    app_handle: tauri::AppHandle
) -> Result<String, String>

#[tauri::command]
async fn send_control_message(
    target_peer_id: String,
    message: LiveControlMessage
) -> Result<(), String>

#[tauri::command]
async fn get_connected_peers() -> Result<Vec<PeerInfo>, String>

#[tauri::command]
async fn get_leader_status() -> Result<LeaderStatus, String>
```

### Events Pushed to Frontend

```rust
app_handle.emit("webrtc:connected", peer_id)?;
app_handle.emit("webrtc:disconnected", peer_id)?;
app_handle.emit("webrtc:message", (from_peer_id, message))?;
app_handle.emit("webrtc:leader_changed", new_leader_id)?;
app_handle.emit("webrtc:peer_list_changed", peer_list)?;
```

### Key Structs

```rust
pub struct Peer {
    id: Uuid,
    peer_type: PeerType,
    display_name: String,
    is_leader: bool,
    signaling_server: Option<WebSocketServer>,
    data_channels: HashMap<Uuid, RTCDataChannel>,
}

pub enum PeerType {
    Controller,
    Display { display_class: DisplayClass },
}

pub struct PeerInfo {
    pub id: Uuid,
    pub peer_type: PeerType,
    pub display_name: String,
    pub is_connected: bool,
}
```

## Frontend Integration

### React Hook (Proposed)

```typescript
// src/hooks/useWebRTC.ts
export function useWebRTC(peerType: PeerType, displayName: string) {
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [isLeader, setIsLeader] = useState(false)
  const [connected, setConnected] = useState(false)

  const sendMessage = useCallback((targetPeerId: string, message: LiveControlMessage) => {
    return invoke<void>('send_control_message', { targetPeerId, message })
  }, [])

  // Event listeners via Tauri event system
  useEffect(() => {
    const unlisten = listen('webrtc:peer_list_changed', ({ payload }) => {
      setPeers(payload as PeerInfo[])
    })
    // ... other listeners
    return () => unlisten.then(fn => fn())
  }, [])

  return { peers, isLeader, connected, sendMessage }
}
```

## Error Handling

| Scenario | Recovery Strategy |
|----------|-------------------|
| Leader unresponsive (no heartbeat) | Trigger re-election, all peers reconnect |
| Data channel closed unexpectedly | Attempt reconnect 3x with exponential backoff, notify user if failed |
| WebRTC connection fails (ICE timeout) | Fall back to signaling via WebSocket (slower but functional) |
| Network change (WiFi → cellular) | Re-initiate discovery, re-establish all connections |
| Duplicate leader detected | Lower priority device backs down gracefully |

## Testing Strategy

### Unit Tests
- Leader election logic
- Message serialization/deserialization
- Priority calculation

### Integration Tests
- WebSocket signaling server
- mDNS discovery simulation

### Manual Testing Scenarios
1. **2 devices:** 1 controller + 1 display
2. **3 devices:** 1 controller + 2 displays (audience + stage)
3. **5 devices:** 2 controllers + 3 displays
4. **Leader failure:** Disconnect leader, verify re-election
5. **Controller handoff:** Disconnect controller, verify other controller takes over
6. **State sync:** Verify slide changes propagate to all displays

### Platform Testing Priority
1. macOS (desktop) - primary development platform
2. iOS - once Tauri iOS build is working
3. Android - secondary priority

## Future Considerations

### Out of Scope for MVP
- Cloud signaling fallback (Cloudflare Workers)
- TURN relay for cross-network control
- Remote operator access (off-network)
- Persistent state sync to cloud
- Encryption beyond WebRTC's built-in DTLS

### Potential Future Enhancements
- Remote access via VPN requirement
- TURN server for NAT traversal
- State persistence and sync
- Multi-site support
- Recording/replay of live events

## References

- [webrtc-rs/data](https://github.com/webrtc-rs/data) - Pure Rust WebRTC DataChannel
- [webrtc-data crate](https://crates.io/crates/webrtc-data)
- [IETF mDNS ICE Candidates](https://datatracker.ietf.org/doc/html/draft-mdns-ice-candidates)
- [Bully Algorithm](https://en.wikipedia.org/wiki/Bully_algorithm)
- [js-libp2p WebRTC](https://docs.libp2p.io/guides/getting-started/webrtc/)
