# WebSocket Messaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace NATS messaging with a WebSocket-based pub/sub system where each device runs a WebSocket server, advertises itself via mDNS, and the controller connects directly to displays.

**Architecture:**
- Each device (controller or display) runs an embedded WebSocket server using `tokio-tungstenite`
- Devices advertise their service via mDNS (using `mdns` crate) with type `_mw-display._tcp.local.`
- Controller discovers devices and connects to their WebSocket servers
- Messages (lyrics, slides) are sent as JSON over WebSocket connections
- Display devices listen for incoming messages and update their UI

**Tech Stack:**
- Rust: `tokio-tungstenite` (WebSocket), `mdns` (discovery), `serde` (JSON serialization)
- TypeScript: native WebSocket API, custom hooks for connection management
- Message format: JSON with `type`, `church_id`, `event_id`, `data` fields

---

## Phase 1: Remove NATS Infrastructure

### Task 1: Remove NATS Rust Module

**Files:**
- Delete: `src-tauri/src/nats/` (entire directory)
- Delete: `src-tauri/resources/nats-server/` (entire directory)
- Modify: `src-tauri/src/lib.rs:5,61,66-67,85-96,110-119`
- Modify: `src-tauri/src/commands.rs:685-824`
- Modify: `src-tauri/Cargo.toml:29-33`

**Step 1: Delete NATS module directory**

Run:
```bash
rm -rf /Users/markb/dev/mw/app/src-tauri/src/nats
```

**Step 2: Delete NATS binaries**

Run:
```bash
rm -rf /Users/markb/dev/mw/app/src-tauri/resources/nats-server
```

**Step 3: Remove NATS module from lib.rs**

In `src-tauri/src/lib.rs`, remove:
- Line 5: `mod nats;`
- Line 61: `let nats_state = Arc::new(nats::NatsState::new());`
- Line 66-67: `.manage(Arc::new(auto_start_mode))` and `.manage(nats_state)` - keep only auto_start_mode
- Lines 85-96: All NATS command handlers from desktop invoke_handler
- Lines 110-119: All NATS command handlers from Android invoke_handler

**Step 4: Remove NATS commands from commands.rs**

In `src-tauri/src/commands.rs`, delete lines 685-824 (all NATS functions).

**Step 5: Remove NATS dependencies from Cargo.toml**

In `src-tauri/Cargo.toml`, remove:
```toml
# NATS
async-nats = "0.36"
mdns = "3.0"
futures-util = "0.3"
async-std = "1.12"
```

**Step 6: Update .taurignore**

In `src-tauri/.taurignore`, remove lines 8-10:
```text
# NATS server data (written during runtime)
nats-jetstream/
*.log
```

**Step 7: Verify compilation**

Run:
```bash
cd /Users/markb/dev/mw/app/src-tauri && cargo check
```

Expected: SUCCESS (no NATS references remaining)

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove NATS infrastructure"
```

---

### Task 2: Remove NATS Frontend Code

**Files:**
- Delete: `src/hooks/useNats.ts`
- Delete: `docs/plans/2025-12-29-nats-implementation.md`
- Delete: `docs/plans/2025-12-30-nats-testing-checklist.md`
- Modify: `src/components/AutoStartRedirect.tsx:4,25,77,82,94`
- Modify: `src/pages/live/Controller.tsx:32,164,333`
- Modify: `src/main.tsx:15-16`

**Step 1: Delete NATS hook**

Run:
```bash
rm /Users/markb/dev/mw/app/src/hooks/useNats.ts
```

**Step 2: Delete NATS documentation**

Run:
```bash
rm /Users/markb/dev/mw/app/docs/plans/2025-12-29-nats-implementation.md
rm /Users/markb/dev/mw/app/docs/plans/2025-12-30-nats-testing-checklist.md
```

**Step 3: Update AutoStartRedirect.tsx**

Remove all NATS-related code. The component should only handle auto-start redirects:

```typescript
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

const checkIsTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

export function AutoStartRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!checkIsTauri()) return

    const checkAutoStart = async () => {
      try {
        const mode = await invoke<string>('get_auto_start_mode')
        if (mode === 'controller') {
          navigate('/live/controller', { replace: true })
        } else if (mode === 'display') {
          navigate('/live/display', { replace: true })
        }
      } catch (e) {
        // No auto-start mode, continue to home
      }
    }
    checkAutoStart()
  }, [navigate])

  return null
}
```

**Step 4: Update Controller.tsx**

Remove NATS imports and usage (lines 32, 164, 333). We'll add WebSocket code later.

**Step 5: Clean up main.tsx**

Remove the StrictMode comment about NATS.

**Step 6: Verify TypeScript compilation**

Run:
```bash
cd /Users/markb/dev/mw/app && pnpm tsc --noEmit
```

Expected: SUCCESS (no NATS imports remaining)

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove NATS frontend code"
```

---

## Phase 2: Implement WebSocket Server (Rust)

### Task 3: Add WebSocket Dependencies and Module Structure

**Files:**
- Create: `src-tauri/src/websocket/mod.rs`
- Create: `src-tauri/src/websocket/server.rs`
- Create: `src-tauri/src/websocket/types.rs`
- Modify: `src-tauri/src/lib.rs:5`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add WebSocket dependencies to Cargo.toml**

Add to `src-tauri/Cargo.toml` dependencies:
```toml
# WebSocket server
tokio-tungstenite = "0.24"
futures-channel = "0.3"
```

**Step 2: Create websocket module**

Create `src-tauri/src/websocket/mod.rs`:
```rust
pub mod server;
pub mod types;

pub use server::*;
pub use types::*;
```

**Step 3: Create websocket types**

Create `src-tauri/src/websocket/types.rs`:
```rust
use serde::{Deserialize, Serialize};

/// Message types sent over WebSocket
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    #[serde(rename = "lyrics")]
    Lyrics(LyricsData),
    #[serde(rename = "slide")]
    Slide(SlideData),
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsData {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub title: String,
    pub lyrics: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_url: Option<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideData {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub slide_index: usize,
    pub timestamp: u64,
}
```

**Step 4: Add module to lib.rs**

Add to `src-tauri/src/lib.rs` after line 4:
```rust
mod websocket;
```

**Step 5: Commit**

```bash
git add src-tauri/src/websocket src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add websocket module structure"
```

---

### Task 4: Implement WebSocket Server

**Files:**
- Create: `src-tauri/src/websocket/server.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write WebSocket server implementation**

Create `src-tauri/src/websocket/server.rs`:
```rust
use crate::websocket::types::WsMessage;
use futures_channel::mpsc::{unbounded, UnboundedSender};
use futures_util::stream::StreamExt;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::WebSocketStream;
use tracing::{info, error, warn};

type Tx = UnboundedSender<Message>;
type Clients = Arc<Mutex<HashMap<SocketAddr, Tx>>>;

/// WebSocket server that handles incoming connections and broadcasts messages
pub struct WebSocketServer {
    clients: Clients,
    port: u16,
}

impl WebSocketServer {
    /// Create a new WebSocket server
    pub fn new() -> Self {
        Self {
            clients: Arc::new(Mutex::new(HashMap::new())),
            port: 0, // Will be assigned when started
        }
    }

    /// Start the WebSocket server on the specified port
    /// Returns the actual port the server is listening on
    pub async fn start(&mut self, port: u16) -> Result<u16, String> {
        let addr = format!("0.0.0.0:{}", port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind WebSocket server: {}", e))?;

        self.port = listener.local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?
            .port();

        info!("WebSocket server listening on port {}", self.port);

        let clients = self.clients.clone();

        // Spawn accept loop
        tokio::spawn(async move {
            while let Ok((stream, addr)) = listener.accept().await {
                let clients = clients.clone();
                tokio::spawn(handle_connection(stream, addr, clients));
            }
        });

        Ok(self.port)
    }

    /// Broadcast a message to all connected clients
    pub async fn broadcast(&self, message: WsMessage) -> Result<(), String> {
        let json = serde_json::to_string(&message)
            .map_err(|e| format!("Failed to serialize message: {}", e))?;
        let msg = Message::Text(json);

        let mut clients = self.clients.lock().await;
        let mut failed_addrs = Vec::new();

        for (&addr, tx) in clients.iter() {
            if tx.unbounded_send(msg.clone()).is_err() {
                failed_addrs.push(addr);
            }
        }

        // Remove disconnected clients
        for addr in failed_addrs {
            warn!("Removing disconnected client: {}", addr);
            clients.remove(&addr);
        }

        info!("Broadcast message to {} clients", clients.len());
        Ok(())
    }

    /// Get the server port
    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Default for WebSocketServer {
    fn default() -> Self {
        Self::new()
    }
}

/// Handle a single WebSocket connection
async fn handle_connection(
    raw_stream: TcpStream,
    addr: SocketAddr,
    clients: Clients,
) {
    info!("New WebSocket connection from {}", addr);

    let ws_stream = match tokio_tungstenite::accept_async(raw_stream).await {
        Ok(s) => s,
        Err(e) => {
            error!("Error during WebSocket handshake: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = unbounded::<Message>();

    // Add client to registry
    {
        let mut clients = clients.lock().await;
        clients.insert(addr, tx);
    }

    // Spawn task to send messages from channel to WebSocket
    let clients_clone = clients.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.next().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
        // Remove client on disconnect
        clients_clone.lock().await.remove(&addr);
        info!("WebSocket client disconnected: {}", addr);
    });

    // Handle incoming messages from client
    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Ping(data)) => {
                // Respond to pings
                let _ = clients.lock().await.get(&addr)
                    .and_then(|tx| tx.unbounded_send(Message::Pong(data)));
            }
            Ok(Message::Close(_)) => {
                info!("Client {} initiated close", addr);
                break;
            }
            Err(e) => {
                error!("Error receiving message from {}: {}", addr, e);
                break;
            }
            _ => {
                // Ignore other incoming messages for now
                // Displays only receive, controllers only send
            }
        }
    }
}
```

**Step 2: Add WebSocket server to app state**

In `src-tauri/src/lib.rs`, add after `mod websocket;`:
```rust
use std::sync::Arc;
use websocket::WebSocketServer;
```

Update the tauri::Builder setup:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .manage(Arc::new(auto_start_mode))
    .manage(Arc::new(WebSocketServer::new()))  // Add this
```

**Step 3: Commit**

```bash
git add src-tauri/src/websocket/server.rs src-tauri/src/lib.rs
git commit -m "feat: implement WebSocket server"
```

---

### Task 5: Add WebSocket Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add WebSocket commands to commands.rs**

Add to `src-tauri/src/commands.rs`:
```rust
/// Start the WebSocket server
#[tauri::command]
pub async fn start_websocket_server(app: tauri::AppHandle) -> Result<u16, String> {
    tracing::info!("start_websocket_server called");

    let ws_state = app.state::<Arc<crate::websocket::WebSocketServer>>();

    // We need interior mutability - use a mutex wrapper or recreate the pattern
    // For now, let's return an error indicating this needs to be implemented
    Err("WebSocket server startup needs state management refactoring".to_string())
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
    let ws_state = app.state::<Arc<crate::websocket::WebSocketServer>>();
    // TODO: Implement after adding proper state management
    Err("Not implemented yet".to_string())
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
    let ws_state = app.state::<Arc<crate::websocket::WebSocketServer>>();
    // TODO: Implement after adding proper state management
    Err("Not implemented yet".to_string())
}
```

**Step 2: Register commands in lib.rs**

Add to invoke_handler in `src-tauri/src/lib.rs` (both desktop and Android sections):
```rust
commands::start_websocket_server,
commands::publish_lyrics,
commands::publish_slide,
```

**Step 3: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add WebSocket Tauri commands (stubs)"
```

---

## Phase 3: Implement mDNS Discovery

### Task 6: Implement mDNS Discovery

**Files:**
- Create: `src-tauri/src/mdns/mod.rs`
- Create: `src-tauri/src/mdns/discovery.rs`
- Create: `src-tauri/src/mdns/service.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add mdns dependency**

Add to `src-tauri/Cargo.toml`:
```toml
# mDNS discovery
mdns = "3.0"
```

**Step 2: Create mDNS module structure**

Create `src-tauri/src/mdns/mod.rs`:
```rust
pub mod discovery;
pub mod service;

pub use discovery::*;
pub use service::*;
```

**Step 3: Create service advertisement**

Create `src-tauri/src/mdns/service.rs`:
```rust
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, error};

/// Service advertiser using mDNS
pub struct ServiceAdvertiser {
    responder: Option<mdns::Responder>,
}

impl ServiceAdvertiser {
    /// Create a new advertiser
    pub fn new() -> Self {
        Self { responder: None }
    }

    /// Start advertising the service
    pub async fn advertise(&mut self, name: &str, port: u16) -> Result<(), String> {
        let service = mdns::Service {
            name: name.to_string(),
            service_type: "_mw-display._tcp.local.".to_string(),
            port,
            priority: 0,
            weight: 0,
            properties: vec![],
        };

        let responder = mdns::Responder::new()
            .map_err(|e| format!("Failed to create mDNS responder: {}", e))?;

        // Register our service
        responder.register(service);
        self.responder = Some(responder);

        info!("Advertising mDNS service: {} on port {}", name, port);
        Ok(())
    }

    /// Stop advertising
    pub fn stop(&mut self) {
        self.responder = None;
    }
}

impl Default for ServiceAdvertiser {
    fn default() -> Self {
        Self::new()
    }
}

/// Global advertiser state
pub struct AdvertiserState {
    advertiser: Arc<Mutex<ServiceAdvertiser>>,
}

impl AdvertiserState {
    pub fn new() -> Self {
        Self {
            advertiser: Arc::new(Mutex::new(ServiceAdvertiser::new())),
        }
    }

    pub async fn advertise(&self, name: &str, port: u16) -> Result<(), String> {
        let mut adv = self.advertiser.lock().await;
        adv.advertise(name, port).await
    }

    pub async fn stop(&self) {
        let mut adv = self.advertiser.lock().await;
        adv.stop();
    }
}

impl Default for AdvertiserState {
    fn default() -> Self {
        Self::new()
    }
}
```

**Step 4: Create discovery**

Create `src-tauri/src/mdns/discovery.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, error, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDevice {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub service_type: String,
}

/// Discover Mobile Worship display devices via mDNS
pub async fn discover_disdevices(timeout_secs: u64) -> Vec<DiscoveredDevice> {
    info!("Starting mDNS discovery for {} seconds", timeout_secs);

    let mut devices = Vec::new();
    let service_type = "_mw-display._tcp.local.";

    // Create a channel to receive discovered services
    let (tx, mut rx) = futures_channel::mpsc::unbounded();

    // Spawn discovery task
    let discovery_handle = tokio::spawn(async move {
        let mut responder = match mdns::Responder::new() {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to create mDNS responder for discovery: {}", e);
                return;
            }
        };

        // Browse for services
        match responder.browse(service_type) {
            Ok(mut stream) => {
                let timeout = Duration::from_secs(timeout_secs);
                let start = std::time::Instant::now();

                while start.elapsed() < timeout {
                    match tokio::time::timeout(
                        Duration::from_secs(1),
                        stream.next()
                    ).await {
                        Ok(Some(service)) => {
                            debug!("Discovered service: {:?}", service);
                            let _ = tx.unbounded_send(DiscoveredDevice {
                                name: service.name,
                                host: service.address.unwrap_or("unknown".to_string()),
                                port: service.port,
                                service_type: service.service_type,
                            });
                        }
                        Ok(None) => break,
                        Err(_) => continue, // Timeout, check total timeout
                    }
                }
            }
            Err(e) => {
                error!("Failed to browse mDNS services: {}", e);
            }
        }
    });

    // Collect results
    let timeout = Duration::from_secs(timeout_secs);
    let start = std::time::Instant::now();

    while start.elapsed() < timeout {
        match tokio::time::timeout(Duration::from_millis(100), rx.next()).await {
            Ok(Some(device)) => devices.push(device),
            Err(_) => continue,
            Ok(None) => break,
        }
    }

    discovery_handle.abort();
    info!("Discovery complete, found {} devices", devices.len());
    devices
}
```

**Step 5: Wire up in lib.rs**

Add to `src-tauri/src/lib.rs`:
```rust
mod mdns;
```

Add to tauri::Builder:
```rust
.manage(Arc::new(mdns::AdvertiserState::new()))
```

**Step 6: Add discovery commands**

Add to `src-tauri/src/commands.rs`:
```rust
/// Discover display devices via mDNS
#[tauri::command]
pub async fn discover_display_devices(timeout_secs: Option<u64>) -> Result<Vec<crate::mdns::DiscoveredDevice>, String> {
    let timeout = timeout_secs.unwrap_or(5);
    Ok(crate::mdns::discover_disdevices(timeout).await)
}

/// Start advertising this device as a display
#[tauri::command]
pub async fn start_advertising(app: tauri::AppHandle, name: String, port: u16) -> Result<(), String> {
    let advertiser = app.state::<Arc<crate::mdns::AdvertiserState>>();
    advertiser.advertise(&name, port).await
}
```

**Step 7: Commit**

```bash
git add src-tauri/src/mdns src-tauri/src/lib.rs src-tauri/src/commands.rs src-tauri/Cargo.toml
git commit -m "feat: implement mDNS discovery and advertising"
```

---

## Phase 4: Implement Frontend WebSocket Client

### Task 7: Create WebSocket Hook

**Files:**
- Create: `src/hooks/useWebSocket.ts`
- Modify: `src/pages/live/Controller.tsx`
- Modify: `src/pages/live/Display.tsx`

**Step 1: Create WebSocket hook**

Create `src/hooks/useWebSocket.ts`:
```typescript
import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface DisplayDevice {
  name: string
  host: string
  port: number
  service_type: string
}

export interface LyricsMessage {
  church_id: string
  event_id: string
  song_id: string
  title: string
  lyrics: string
  background_url?: string
  timestamp: number
}

export interface SlideMessage {
  church_id: string
  event_id: string
  song_id: string
  slide_index: number
  timestamp: number
}

type WsMessage =
  | { type: 'lyrics'; data: LyricsMessage }
  | { type: 'slide'; data: SlideMessage }
  | { type: 'ping' }

export function useWebSocket() {
  const [devices, setDevices] = useState<DisplayDevice[]>([])
  const [connections, setConnections] = useState<Map<string, WebSocket>>(new Map())
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [serverPort, setServerPort] = useState<number | null>(null)
  const connectionsRef = useRef(connections)

  // Keep ref in sync
  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  // Start WebSocket server (for displays)
  const startServer = useCallback(async () => {
    try {
      const port = await invoke<number>('start_websocket_server')
      setServerPort(port)
      setIsServerRunning(true)
      return port
    } catch (e) {
      console.error('Failed to start WebSocket server:', e)
      throw e
    }
  }, [])

  // Discover devices via mDNS
  const discoverDevices = useCallback(async (timeout = 5) => {
    try {
      const found = await invoke<DisplayDevice[]>('discover_display_devices', { timeoutSecs: timeout })
      setDevices(found)
      return found
    } catch (e) {
      console.error('Failed to discover devices:', e)
      return []
    }
  }, [])

  // Connect to a display device
  const connectToDevice = useCallback((device: DisplayDevice) => {
    const key = `${device.host}:${device.port}`

    if (connectionsRef.current.has(key)) {
      console.log(`Already connected to ${key}`)
      return
    }

    console.log(`Connecting to ${device.name} at ws://${device.host}:${device.port}`)
    const ws = new WebSocket(`ws://${device.host}:${device.port}`)

    ws.onopen = () => {
      console.log(`Connected to ${device.name}`)
      setConnections(prev => new Map(prev).set(key, ws))
    }

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${device.name}:`, error)
    }

    ws.onclose = () => {
      console.log(`Disconnected from ${device.name}`)
      setConnections(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }

    return ws
  }, [])

  // Disconnect from a device
  const disconnectFromDevice = useCallback((device: DisplayDevice) => {
    const key = `${device.host}:${device.port}`
    const ws = connectionsRef.current.get(key)
    if (ws) {
      ws.close()
      setConnections(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  // Broadcast lyrics to all connected devices
  const broadcastLyrics = useCallback((message: LyricsMessage) => {
    const payload: WsMessage = { type: 'lyrics', data: message }
    const json = JSON.stringify(payload)

    connectionsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`Cannot send to ${key}: not ready`)
      }
    })
  }, [])

  // Broadcast slide to all connected devices
  const broadcastSlide = useCallback((message: SlideMessage) => {
    const payload: WsMessage = { type: 'slide', data: message }
    const json = JSON.stringify(payload)

    connectionsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`Cannot send to ${key}: not ready`)
      }
    })
  }, [])

  // Disconnect all on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(ws => ws.close())
    }
  }, [])

  return {
    devices,
    connections,
    isServerRunning,
    serverPort,
    startServer,
    discoverDevices,
    connectToDevice,
    disconnectFromDevice,
    broadcastLyrics,
    broadcastSlide,
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useWebSocket.ts
git commit -m "feat: add WebSocket hook for device communication"
```

---

### Task 8: Update Controller Page

**Files:**
- Modify: `src/pages/live/Controller.tsx`

**Step 1: Replace NATS with WebSocket in Controller**

In `src/pages/live/Controller.tsx`, replace `useNats` with `useWebSocket`:

```typescript
import { useWebSocket, type LyricsMessage } from '@/hooks/useWebSocket'
```

Update the component:
```typescript
const {
  devices,
  connections,
  discoverDevices,
  connectToDevice,
  disconnectFromDevice,
  broadcastLyrics,
  broadcastSlide,
} = useWebSocket()
```

Update lyrics publishing (was `publishLyrics`):
```typescript
// When song changes, broadcast to all connected displays
useEffect(() => {
  if (currentSong) {
    const message: LyricsMessage = {
      church_id: church?.id || '',
      event_id: currentEvent?.id || '',
      song_id: currentSong.id,
      title: currentSong.title,
      lyrics: currentSong.content,
      timestamp: Date.now(),
    }
    broadcastLyrics(message)
  }
}, [currentSong, church, currentEvent, broadcastLyrics])
```

Update slide publishing:
```typescript
// When slide changes, broadcast
useEffect(() => {
  if (currentSong) {
    const message: SlideMessage = {
      church_id: church?.id || '',
      event_id: currentEvent?.id || '',
      song_id: currentSong.id,
      slide_index: currentSlideIndex,
      timestamp: Date.now(),
    }
    broadcastSlide(message)
  }
}, [currentSlideIndex, currentSong, church, currentEvent, broadcastSlide])
```

**Step 2: Commit**

```bash
git add src/pages/live/Controller.tsx
git commit -m "refactor: controller uses WebSocket instead of NATS"
```

---

### Task 9: Update Display Page

**Files:**
- Modify: `src/pages/live/Display.tsx`

**Step 1: Add WebSocket server to Display**

The display should start a WebSocket server and listen for messages.

Add to `Display.tsx`:
```typescript
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useChurch } from '@/contexts/ChurchContext'
import { useEvent } from '@/contexts/EventContext'

interface LyricsMessage {
  church_id: string
  event_id: string
  song_id: string
  title: string
  lyrics: string
  background_url?: string
  timestamp: number
}

interface SlideMessage {
  church_id: string
  event_id: string
  song_id: string
  slide_index: number
  timestamp: number
}

type WsMessage =
  | { type: 'lyrics'; data: LyricsMessage }
  | { type: 'slide'; data: SlideMessage }
  | { type: 'ping' }

export function Display() {
  const { church } = useChurch()
  const { currentEvent } = useEvent()
  const [lyrics, setLyrics] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [slideIndex, setSlideIndex] = useState<number>(0)

  useEffect(() => {
    let ws: WebSocket | null = null

    const startServerAndListen = async () => {
      try {
        // Start the WebSocket server
        const port = await invoke<number>('start_websocket_server')
        console.log('WebSocket server started on port', port)

        // Also advertise via mDNS
        const deviceName = `${church?.name || 'Mobile Worship'} Display`
        await invoke('start_advertising', { name: deviceName, port })
        console.log('Advertising as', deviceName)

        // Connect to our own server to receive messages
        ws = new WebSocket(`ws://localhost:${port}`)

        ws.onopen = () => {
          console.log('Connected to local WebSocket server')
        }

        ws.onmessage = (event) => {
          try {
            const message: WsMessage = JSON.parse(event.data)

            if (message.type === 'lyrics') {
              // Check if this message is for our church/event
              if (message.data.church_id === church?.id &&
                  message.data.event_id === currentEvent?.id) {
                setLyrics(message.data.lyrics)
                setTitle(message.data.title)
              }
            } else if (message.type === 'slide') {
              if (message.data.church_id === church?.id &&
                  message.data.event_id === currentEvent?.id) {
                setSlideIndex(message.data.slide_index)
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
        }

        ws.onclose = () => {
          console.log('WebSocket closed')
        }
      } catch (e) {
        console.error('Failed to start WebSocket server:', e)
      }
    }

    startServerAndListen()

    return () => {
      if (ws) ws.close()
    }
  }, [church, currentEvent])

  // Render lyrics and slide...
}
```

**Step 2: Commit**

```bash
git add src/pages/live/Display.tsx
git commit -m "feat: display uses WebSocket server to receive messages"
```

---

## Phase 5: Integration and Testing

### Task 10: Test Two-Device Connection

**Step 1: Build the app**

Run:
```bash
cd /Users/markb/dev/mw/app && pnpm tauri build --debug
```

**Step 2: Start display device**

Run:
```bash
open "src-tauri/target/debug/bundle/macos/Mobile Worship.app" --args --display
```

Expected:
- Display shows blank/black screen waiting for content
- Console shows "WebSocket server started on port XXXX"
- Console shows "Advertising as <church name> Display"

**Step 3: Start controller device**

In a new terminal:
```bash
open "src-tauri/target/debug/bundle/macos/Mobile Worship.app" --args --controller
```

**Step 4: Discover and connect**

In the controller, click "Discover Displays" or similar button.
Expected:
- Display device appears in list
- Can click to connect
- Connection status shows "Connected"

**Step 5: Test lyrics sync**

On controller, select a song and navigate slides.
Expected:
- Display updates to show the same lyrics
- Slide changes sync immediately

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration testing issues"
```

---

## Summary

This plan removes all NATS code and replaces it with:
1. Embedded WebSocket server on each device
2. mDNS for device discovery
3. Direct WebSocket connections from controller to displays
4. JSON message format for lyrics and slide updates

The architecture is simpler and avoids the complexity of embedding NATS:
- No external binaries to bundle
- No file watching issues
- Direct peer-to-peer communication
- Standard WebSocket protocol (well-understood, debuggable)

---

## Files Changed Summary

**Deleted (8 files):**
- `src-tauri/src/nats/` (5 files)
- `src-tauri/resources/nats-server/` (2 files)
- `src/hooks/useNats.ts`

**Created (10 files):**
- `src-tauri/src/websocket/mod.rs`
- `src-tauri/src/websocket/server.rs`
- `src-tauri/src/websocket/types.rs`
- `src-tauri/src/mdns/mod.rs`
- `src-tauri/src/mdns/discovery.rs`
- `src-tauri/src/mdns/service.rs`
- `src/hooks/useWebSocket.ts`

**Modified (6 files):**
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/.taurignore`
- `src/pages/live/Controller.tsx`
- `src/pages/live/Display.tsx`
- `src/components/AutoStartRedirect.tsx`
