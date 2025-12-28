# Milestone 0: WebRTC Foundation

**Status:** Planning
**Prerequisites:** None
**Depends On:** Nothing (foundational work)

## Overview

Implement the WebRTC communication layer that enables real-time peer-to-peer communication between all Tauri applications. This is a foundational milestone that must be completed before live control features can be built.

## Goals

- [ ] Every Tauri app can discover peers via mDNS
- [ ] Leader election determines which device runs the signaling server
- [ ] WebSocket signaling server for WebRTC connection establishment
- [ ] WebRTC data channels for direct P2P message passing
- [ ] Tauri commands and events for frontend integration
- [ ] Basic echo test to verify bidirectional communication

## Implementation Tasks

### Phase 1: Rust Project Setup

- [ ] Add WebRTC dependencies to `Cargo.toml`
  - [ ] `webrtc = "0.11"`
  - [ ] `tokio-tungstenite = "0.24"`
  - [ ] `mdns = "3.0"`
  - [ ] `serde`, `serde_json`, `uuid`, `tokio`

- [ ] Create module structure
  ```
  src-tauri/src/webrtc/
  ├── mod.rs
  ├── peer.rs
  ├── signaling.rs
  ├── discovery.rs
  ├── election.rs
  └── channel.rs
  ```

### Phase 2: Core Types

- [ ] Define `PeerType` enum (Controller, Display)
- [ ] Define `DisplayClass` enum (audience, stage, lobby)
- [ ] Define `Peer` struct with connection state
- [ ] Define `PeerInfo` for frontend communication
- [ ] Define message types (signaling, data channel)

### Phase 3: mDNS Discovery

- [ ] Implement mDNS service announcement
  - [ ] Service: `_mobile-worship._tcp.local`
  - [ ] TXT records: leader-id, priority, peer-type

- [ ] Implement mDNS service discovery
  - [ ] Query for existing leaders on startup
  - [ ] Parse leader advertisements
  - [ ] Emit event when leader found

### Phase 4: Leader Election

- [ ] Implement priority calculation
  - [ ] Device type (Controller > Display)
  - [ ] Startup time (earlier wins)
  - [ ] UUID tiebreaker

- [ ] Implement election protocol
  - [ ] Announce candidacy via mDNS
  - [ ] Compare priorities with other candidates
  - [ ] Accept or decline leadership
  - [ ] Handle duplicate leader scenario

- [ ] Implement heartbeat mechanism
  - [ ] Followers send heartbeat every 2s
  - [ ] Leader tracks last heartbeat from each follower
  - [ ] Trigger re-election on 3 missed heartbeats

### Phase 5: WebSocket Signaling Server

- [ ] Implement WebSocket server on configurable port (default 3010)
- [ ] Handle registration messages from followers
- [ ] Maintain peer registry
- [ ] Forward WebRTC offers/answers between peers
- [ ] Forward ICE candidates between peers
- [ ] Emit peer list changes to all connected peers

### Phase 6: WebRTC Data Channels

- [ ] Create WebRTC peer connection
- [ ] Create data channel with label "live-control"
- [ ] Handle SDP offer/answer exchange
- [ ] Handle ICE candidate exchange
- [ ] Detect data channel open state
- [ ] Send/receive messages via data channel
- [ ] Handle data channel close

### Phase 7: Tauri Integration

- [ ] Implement `start_peer` command
- [ ] Implement `send_control_message` command
- [ ] Implement `get_connected_peers` command
- [ ] Implement `get_leader_status` command
- [ ] Emit `webrtc:connected` event
- [ ] Emit `webrtc:disconnected` event
- [ ] Emit `webrtc:message` event
- [ ] Emit `webrtc:leader_changed` event
- [ ] Emit `webrtc:peer_list_changed` event

### Phase 8: Frontend Hook

- [ ] Create `src/hooks/useWebRTC.ts`
- [ ] Track peer list state
- [ ] Track leader status
- [ ] Provide `sendMessage` function
- [ ] Handle connection state changes
- [ ] Display connection status in UI

### Phase 9: Testing

- [ ] Unit tests for leader election
- [ ] Unit tests for priority calculation
- [ ] Unit tests for message serialization
- [ ] Integration test for WebSocket signaling
- [ ] Manual test: 2-device echo (controller ↔ display)
- [ ] Manual test: 3-device mesh (1 controller, 2 displays)
- [ ] Manual test: Leader re-election on disconnect

## Success Criteria

1. Two Tauri apps on same network can discover each other
2. One is elected leader, runs WebSocket server
3. WebRTC data channel established between peers
4. Messages sent via data channel are received
5. Leader failure triggers re-election
6. Frontend can send/receive messages via Tauri commands

## Platform Targets

- [ ] macOS (primary development)
- [ ] iOS (pending Tauri iOS build setup)
- [ ] Android (stretch goal)

## Related Documents

- [WebRTC Design](./2025-12-28-webrtc-design.md)
- [Milestone 4: Live Control](./milestone-4-live-control.md)

## Estimated Work

This is a new, complex subsystem. Plan for:
- Core implementation: 3-5 days
- Testing and debugging: 2-3 days
- Total: 1-2 weeks

## Notes

- This is foundational infrastructure
- Must be solid before building live control features
- Consider creating a separate test app for easier debugging
- iOS support depends on Tauri iOS build being functional
