# NATS Embedded Server Implementation Plan

## Overview

Replace WebRTC peer-to-peer mesh with NATS pub/sub architecture for local network sync between controllers (macOS/Windows/iOS) and displays (Android TV, macOS, Windows).

**MVP Scope:** macOS controller + Android TV display

**Key Decisions:**
- Bundle nats-server binaries in app resources (works offline immediately)
- Use tokio-mdns for service discovery
- Focus on macOS + Android TV first

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  macOS/iOS      │     │  Android TV 1   │     │  Android TV 2   │
│  Controller     │     │  Display        │     │  Display        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  NATS client          │  Embedded NATS        │  Embedded NATS
         │  (async-nats)         │  Server (port X)      │  Server (port Y)
         │                       │  + NATS client        │  + NATS client
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                          Local Network WiFi
                          mDNS Discovery
```

### Message Flow

1. **Each display spawns embedded NATS server** on random port
2. **Display publishes mDNS service**: `_nats._tcp.local` with TXT record containing port
3. **Controller discovers displays via mDNS**
4. **Controller connects to NATS cluster** (any node, they're routed)
5. **Controller publishes to `lyrics.current`** → all displays receive
6. **JetStream persists** lyrics/assets for recovery

## Phase 1: Remove WebRTC Code

### 1.1 Remove Rust Dependencies
**File:** `src-tauri/Cargo.toml`

Remove these dependencies:
```toml
webrtc = "0.11"
tokio-tungstenite = "0.24"
mdns = "3.0"
```

### 1.2 Remove WebRTC Module
**Directory:** `src-tauri/src/webrtc/`

Delete entire directory.

### 1.3 Clean Commands
**Files:**
- `src-tauri/src/commands.rs` - Remove all WebRTC-related commands
- `src-tauri/src/lib.rs` - Remove WebRTC module imports

### 1.4 Remove Frontend Code
**Files to delete:**
- `src/lib/webrtc-browser.ts`
- `src/routes/webrtc-debug.tsx`
- `src/components/webrtc/` directory
- `src/hooks/useWebRTC.ts`
- `src/hooks/useDisplayHeartbeat.ts`

**Files to modify:**
- `src/components/AutoStartRedirect.tsx` - Remove WebRTC peer startup
- `src/components/display/PairingScreen.tsx` - Replace with NATS discovery
- `src/pages/live/Controller.tsx` - Remove WebRTC display management
- `src/pages/live/Display.tsx` - Remove WebRTC controller code
- `src/services/displays.ts` - Replace with NATS-based service
- `src/types/live.ts` - Update for NATS architecture

## Phase 2: NATS Server Infrastructure

### 2.1 Download and Bundle NATS Binaries

**Create:** `scripts/download-nats-binaries.sh`

```bash
#!/bin/bash
# Downloads official nats-server binaries for each platform

NATS_VERSION="2.10.20"
BASE_URL="https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}"

mkdir -p src-tauri/resources/nats-server

# macOS ARM64
curl -L "${BASE_URL}/nats-server-v${NATS_VERSION}-darwin-arm64.gz" -z src-tauri/resources/nats-server/nats-server-macos-arm64.gz -o src-tauri/resources/nats-server/nats-server-macos-arm64.gz
gunzip -kf src-tauri/resources/nats-server/nats-server-macos-arm64.gz
chmod +x src-tauri/resources/nats-server/nats-server-macos-arm64

# macOS x86_64
curl -L "${BASE_URL}/nats-server-v${NATS_VERSION}-darwin-amd64.gz" -z src-tauri/resources/nats-server/nats-server-macos-x64.gz -o src-tauri/resources/nats-server/nats-server-macos-x64.gz
gunzip -kf src-tauri/resources/nats-server/nats-server-macos-x64.gz
chmod +x src-tauri/resources/nats-server/nats-server-macos-x64

# Windows x64
curl -L "${BASE_URL}/nats-server-v${NATS_VERSION}-windows-amd64.zip" -o src-tauri/resources/nats-server/nats-server-windows-x64.zip
unzip -o src-tauri/resources/nats-server/nats-server-windows-x64.zip -d src-tauri/resources/nats-server/
mv src-tauri/resources/nats-server/nats-server.exe src-tauri/resources/nats-server/nats-server-windows-x64.exe
chmod +x src-tauri/resources/nats-server/nats-server-windows-x64.exe

# Android ARM64 (uses same Linux binary)
curl -L "${BASE_URL}/nats-server-v${NATS_VERSION}-linux-arm64.gz" -o src-tauri/resources/nats-server/nats-server-android-arm64.gz
gunzip -kf src-tauri/resources/nats-server/nats-server-android-arm64.gz
chmod +x src-tauri/resources/nats-server/nats-server-android-arm64
```

### 2.2 Configure External Binaries in Tauri

**File:** `src-tauri/tauri.conf.json`

```json
{
  "bundle": {
    "externalBin": [
      "resources/nats-server/nats-server-macos-arm64",
      "resources/nats-server/nats-server-macos-x64",
      "resources/nats-server/nats-server-windows-x64.exe",
      "resources/nats-server/nats-server-android-arm64"
    ]
  }
}
```

### 2.3 Create NATS Rust Module

**Create:** `src-tauri/src/nats/mod.rs`

```rust
pub mod server;
pub mod client;
pub mod discovery;
pub mod types;

pub use server::*;
pub use client::*;
pub use discovery::*;
pub use types::*;
```

### 2.4 NATS Types

**Create:** `src-tauri/src/nats/types.rs`

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatsConfig {
    pub server_port: Option<u16>,
    pub cluster_name: String,
    pub jetstream_dir: String,
}

impl Default for NatsConfig {
    fn default() -> Self {
        Self {
            server_port: None, // 0 = random port assigned by OS
            cluster_name: "lyric_cluster".to_string(),
            jetstream_dir: "./nats-jetstream".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredNode {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsMessage {
    pub church_id: String,
    pub song_id: String,
    pub title: String,
    pub lyrics: String,
    pub background_url: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayState {
    pub display_id: String,
    pub name: String,
    pub connected: bool,
    pub last_heartbeat: i64,
    pub current_lyrics: Option<LyricsMessage>,
}
```

## Phase 3: NATS Server Spawn (Rust)

### 3.1 Server Process Management

**Create:** `src-tauri/src/nats/server.rs`

```rust
use crate::nats::types::NatsConfig;
use std::path::PathBuf;
use std::process::{Child, Command};
use tauri::AppHandle;
use tokio::fs;

pub struct NatsServer {
    process: Option<Child>,
    port: u16,
    config: NatsConfig,
}

impl NatsServer {
    pub async fn new(config: NatsConfig) -> Result<Self, String> {
        // Get app local data dir for JetStream storage
        let jetstream_dir = config.jetstream_dir.clone();
        fs::create_dir_all(&jetstream_dir)
            .await
            .map_err(|e| format!("Failed to create JetStream dir: {}", e))?;

        // Determine which binary to use
        let binary_path = Self::get_nats_binary()?;

        // Spawn nats-server with random port (port 0)
        let mut child = Command::new(&binary_path)
            .arg("--port")
            .arg("0") // Random port
            .arg("--pid")
            .arg("0") // No PID file
            .arg("--cluster_name")
            .arg(&config.cluster_name)
            .arg("--cluster")
            .arg("nats://0.0.0.0:6222")
            .arg("--routes")
            .arg("auto")
            .arg("--jetstream")
            .arg("--store_dir")
            .arg(&jetstream_dir)
            .arg("--log_file")
            .arg(format!("{}/nats.log", jetstream_dir))
            .arg("--logtime")
            .spawn()
            .map_err(|e| format!("Failed to spawn nats-server: {}", e))?;

        // Read port from log file (nats-server writes it on startup)
        let port = Self::wait_for_port(&jetstream_dir).await?;

        Ok(Self {
            process: Some(child),
            port,
            config,
        })
    }

    #[cfg(target_os = "macos")]
    fn get_nats_binary() -> Result<String, String> {
        let arch = std::env::consts::ARCH;
        let name = if arch == "aarch64" {
            "nats-server-macos-arm64"
        } else {
            "nats-server-macos-x64"
        };
        Self::resolve_binary(name)
    }

    #[cfg(target_os = "windows")]
    fn get_nats_binary() -> Result<String, String> {
        Self::resolve_binary("nats-server-windows-x64.exe")
    }

    #[cfg(target_os = "android")]
    fn get_nats_binary() -> Result<String, String> {
        Self::resolve_binary("nats-server-android-arm64")
    }

    fn resolve_binary(name: &str) -> Result<String, String> {
        // Try CWD/resources first (dev), then bundled path (prod)
        let paths = [
            format!("resources/nats-server/{}", name),
            format!("./{}", name), // Android case
        ];

        for path in paths {
            if std::path::Path::new(&path).exists() {
                return Ok(path);
            }
        }

        Err(format!("NATS binary not found: {}", name))
    }

    async fn wait_for_port(jetstream_dir: &str) -> Result<u16, String> {
        let log_path = format!("{}/nats.log", jetstream_dir);
        let path = std::path::Path::new(&log_path);

        // Wait up to 5 seconds for server to start
        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            if let Ok(content) = fs::read_to_string(&path).await {
                // Parse "Server is ready" line with port
                for line in content.lines() {
                    if line.contains("Server is ready") {
                        // Extract port from log line
                        if let Some(port_str) = line.split("port ").nth(1) {
                            if let Ok(port) = port_str
                                .split_whitespace()
                                .next()
                                .and_then(|s| s.parse::<u16>().ok())
                            {
                                return Ok(port);
                            }
                        }
                    }
                }
            }
        }

        Err("NATS server didn't start within timeout".to_string())
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn stop(mut self) -> Result<(), String> {
        if let Some(mut child) = self.process.take() {
            child
                .kill()
                .map_err(|e| format!("Failed to kill nats-server: {}", e))?;
            child
                .wait()
                .map_err(|e| format!("Failed to wait for nats-server: {}", e))?;
        }
        Ok(())
    }
}
```

## Phase 4: NATS Client (Rust)

### 4.1 Add Dependencies

**File:** `src-tauri/Cargo.toml`

```toml
[dependencies]
# NATS
async-nats = "0.36"
tokio-mdns = "0.11"  # For service discovery

# Existing
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

### 4.2 Client Implementation

**Create:** `src-tauri/src/nats/client.rs`

```rust
use async_nats::Client;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::nats::types::{LyricsMessage, DiscoveredNode};

pub struct NatsClient {
    client: Option<Client>,
    server_url: Arc<RwLock<Option<String>>>,
}

impl NatsClient {
    pub fn new() -> Self {
        Self {
            client: None,
            server_url: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn connect(&mut self, url: String) -> Result<(), String> {
        let client = async_nats::connect(url.clone())
            .await
            .map_err(|e| format!("Failed to connect to NATS: {}", e))?;

        self.client = Some(client);
        *self.server_url.write().await = Some(url);
        Ok(())
    }

    pub async fn publish_lyrics(&self, lyrics: LyricsMessage) -> Result<(), String> {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let payload = serde_json::to_vec(&lyrics)
            .map_err(|e| format!("Failed to serialize lyrics: {}", e))?;

        client
            .publish("lyrics.current", payload.into())
            .await
            .map_err(|e| format!("Failed to publish lyrics: {}", e))?;

        Ok(())
    }

    pub async fn subscribe_to_lyrics<F>(&self, mut callback: F) -> Result<(), String>
    where
        F: FnMut(LyricsMessage) + Send + 'static,
    {
        let client = self.client.as_ref()
            .ok_or_else(|| "Not connected to NATS".to_string())?;

        let mut subscriber = client
            .subscribe("lyrics.current")
            .await
            .map_err(|e| format!("Failed to subscribe: {}", e))?;

        tokio::spawn(async move {
            while let Some(msg) = subscriber.next().await {
                if let Ok(lyrics) = serde_json::from_slice::<LyricsMessage>(msg.payload.as_ref()) {
                    callback(lyrics);
                }
            }
        });

        Ok(())
    }
}
```

## Phase 5: mDNS Discovery

### 5.1 Service Discovery

**Create:** `src-tauri/src/nats/discovery.rs`

```rust
use crate::nats::types::DiscoveredNode;
use futures_util::stream::StreamExt;
use std::time::Duration;
use tokio::time::timeout;
use tokio_mdns::{
    self,
    dns_parser::{Class, Type},
};

const SERVICE_NAME: &str = "_nats-cluster._tcp.local";
const DISCOVERY_TIMEOUT_SEC: u64 = 3;

pub async fn discover_cluster_nodes() -> Vec<DiscoveredNode> {
    let mut nodes = Vec::new();

    // Create mDNS responder
    let stream = tokio_mdns::discover::all(
        SERVICE_NAME,
        Duration::from_secs(DISCOVERY_TIMEOUT_SEC)
    ).unwrap();

    let mut responses = stream.take(20); // Limit responses

    while let Some(Ok(response)) = responses.next().await {
        if let Some(addr) = response.ipv4_addr() {
            let port = extract_nats_port(&response);
            if let Some(port) = port {
                nodes.push(DiscoveredNode {
                    id: format!("{}:{}", addr, port),
                    name: extract_device_name(&response),
                    host: addr.to_string(),
                    port,
                    platform: "unknown".to_string(),
                });
            }
        }
    }

    nodes
}

fn extract_nats_port(response: &tokio_mdns::Response) -> Option<u16> {
    // Check TXT records for port info
    for record in &response.records {
        if record.kind == Type::TXT {
            // Parse TXT record for "port=12345"
            // TXT records are byte strings
        }
    }
    // Default: try to extract from SRV or use default
    Some(4222) // Default NATS port
}

fn extract_device_name(response: &tokio_mdns::Response) -> String {
    // Extract from PTR or TXT records
    "NATS Node".to_string()
}

pub async fn advertise_nats_service(port: u16, device_name: &str) -> Result<(), String> {
    // Advertise our NATS server via mDNS
    let svc = tokio_mdns::service::ServiceBuilder::new()
        .name(device_name)
        .service_name(SERVICE_NAME)
        .port(port)
        .build()
        .map_err(|e| format!("Failed to create mDNS service: {}", e))?;

    // Start advertising
    tokio::spawn(async move {
        let _ = svc.run().await;
    });

    Ok(())
}
```

## Phase 6: Tauri Commands

### 6.1 Register Commands

**File:** `src-tauri/src/commands.rs`

```rust
use crate::nats::{server, client, discovery, types};

#[tauri::command]
async fn spawn_nats_server() -> Result<u16, String> {
    let config = types::NatsConfig::default();
    let nats = server::NatsServer::new(config).await?;
    Ok(nats.port())
}

#[tauri::command]
async fn discover_nats_cluster() -> Result<Vec<types::DiscoveredNode>, String> {
    let nodes = discovery::discover_cluster_nodes().await;
    Ok(nodes)
}

#[tauri::command]
async fn connect_to_nats(server_url: String) -> Result<(), String> {
    // Global client management
    tauri::async_runtime::spawn(async move {
        // Connect and store in global state
    });
    Ok(())
}

#[tauri::command]
async fn publish_lyrics(lyrics: types::LyricsMessage) -> Result<(), String> {
    // Get global client and publish
    Ok(())
}

#[tauri::command]
async fn stop_nats_server() -> Result<(), String> {
    // Stop the running server
    Ok(())
}
```

**File:** `src-tauri/src/lib.rs`

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::spawn_nats_server,
            commands::discover_nats_cluster,
            commands::connect_to_nats,
            commands::publish_lyrics,
            commands::stop_nats_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Phase 7: React Integration

### 7.1 Create React Hook

**Create:** `src/hooks/useNats.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback } from 'react';

export interface NatsNode {
  id: string;
  name: string;
  host: string;
  port: number;
  platform: string;
}

export interface LyricsMessage {
  church_id: string;
  song_id: string;
  title: string;
  lyrics: string;
  background_url?: string;
  timestamp: number;
}

export function useNats() {
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [discoveredNodes, setDiscoveredNodes] = useState<NatsNode[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentLyrics, setCurrentLyrics] = useState<LyricsMessage | null>(null);

  // Spawn NATS server (for displays)
  const spawnServer = useCallback(async () => {
    try {
      const port = await invoke<number>('spawn_nats_server');
      setServerPort(port);
      return port;
    } catch (e) {
      console.error('Failed to spawn NATS server:', e);
      throw e;
    }
  }, []);

  // Discover cluster nodes (for controllers)
  const discoverCluster = useCallback(async () => {
    try {
      const nodes = await invoke<NatsNode[]>('discover_nats_cluster');
      setDiscoveredNodes(nodes);
      return nodes;
    } catch (e) {
      console.error('Failed to discover cluster:', e);
      return [];
    }
  }, []);

  // Connect to NATS cluster
  const connect = useCallback(async (serverUrl: string) => {
    try {
      await invoke('connect_to_nats', { serverUrl });
      setConnected(true);
    } catch (e) {
      console.error('Failed to connect:', e);
      throw e;
    }
  }, []);

  // Publish lyrics
  const publishLyrics = useCallback(async (lyrics: LyricsMessage) => {
    try {
      await invoke('publish_lyrics', { lyrics });
    } catch (e) {
      console.error('Failed to publish lyrics:', e);
      throw e;
    }
  }, []);

  // Stop server
  const stopServer = useCallback(async () => {
    try {
      await invoke('stop_nats_server');
      setServerPort(null);
    } catch (e) {
      console.error('Failed to stop server:', e);
    }
  }, []);

  return {
    serverPort,
    discoveredNodes,
    connected,
    currentLyrics,
    spawnServer,
    discoverCluster,
    connect,
    publishLyrics,
    stopServer,
  };
}
```

### 7.2 Update Display Mode

**Modify:** `src/modes/display/index.tsx`

```typescript
import { useNats } from '@/hooks/useNats';

export function DisplayMode() {
  const { spawnServer, currentLyrics } = useNats();

  useEffect(() => {
    // Auto-start NATS server on display devices
    spawnServer().catch(console.error);
  }, [spawnServer]);

  return (
    <div className="w-full h-full bg-black">
      {/* Display lyrics from currentLyrics */}
      {currentLyrics && (
        <div className="text-white text-4xl">
          {currentLyrics.lyrics}
        </div>
      )}
    </div>
  );
}
```

### 7.3 Update Controller Page

**Modify:** `src/pages/live/Controller.tsx`

```typescript
import { useNats } from '@/hooks/useNats';

export function ControllerPage() {
  const { discoverCluster, connect, publishLyrics, discoveredNodes, connected } = useNats();

  const handleConnect = async () => {
    const nodes = await discoverCluster();
    if (nodes.length > 0) {
      await connect(`nats://${nodes[0].host}:${nodes[0].port}`);
    }
  };

  const handleSendLyrics = async () => {
    await publishLyrics({
      church_id: 'test',
      song_id: '1',
      title: 'Amazing Grace',
      lyrics: '# Verse 1\nAmazing grace...',
      timestamp: Date.now(),
    });
  };

  return (
    <div>
      <button onClick={handleConnect}>Connect to Cluster</button>
      <button onClick={handleSendLyrics}>Send Lyrics</button>
      <div>Connected: {connected ? 'Yes' : 'No'}</div>
      <div>Discovered Nodes: {discoveredNodes.length}</div>
    </div>
  );
}
```

## Phase 8: Android TV Specifics

### 8.1 Android Manifest Permissions

**File:** `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 8.2 Android NATS Binary Placement

**Script:** Copy nats-server-android-arm64 to app assets

Place binary in: `src-tauri/gen/android/app/src/main/res/raw/nats-server`

### 8.3 Foreground Service for NATS

**Create:** `src-tauri/gen/android/app/src/main/java/com/mobleworship/NatsService.java`

```java
public class NatsService extends Service {
    private Process natsProcess;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Start notification for foreground service
        startForeground(1, createNotification());

        // Launch nats-server binary
        try {
            ProcessBuilder pb = new ProcessBuilder();
            pb.command(getNatsBinaryPath(),
                "--port", "0",
                "--jetstream",
                "--store_dir", getFilesDir() + "/nats-jetstream");
            natsProcess = pb.start();
        } catch (IOException e) {
            Log.e("NatsService", "Failed to start NATS", e);
        }

        return START_STICKY;
    }

    private String getNatsBinaryPath() {
        // Copy binary from assets to app data dir on first run
        // Return path to copied binary
        return getFilesDir() + "/nats-server";
    }
}
```

## Implementation Order

1. **Phase 1**: Remove WebRTC code (30 min)
2. **Phase 2**: Download NATS binaries, update Cargo.toml (15 min)
3. **Phase 3**: Implement server spawn module (1 hour)
4. **Phase 4**: Implement client module (30 min)
5. **Phase 5**: Implement mDNS discovery (1 hour)
6. **Phase 6**: Wire up Tauri commands (30 min)
7. **Phase 7**: Create React hooks and update UI (1 hour)
8. **Phase 8**: Android TV specific implementation (1 hour)
9. **Testing**: End-to-end test macOS controller → Android TV display (1 hour)

**Total Estimate:** ~6 hours

## Success Criteria

- [ ] macOS app spawns NATS server successfully
- [ ] Android TV app spawns NATS server successfully
- [ ] mDNS discovery finds Android TV from macOS
- [ ] macOS connects to Android TV NATS server
- [ ] Publishing lyrics from macOS displays on Android TV
- [ ] Lyrics update < 100ms from publish to display
- [ ] App restart rejoins cluster automatically
