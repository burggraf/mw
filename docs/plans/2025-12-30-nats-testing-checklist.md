# NATS Testing Checklist

> **Status:** In Progress
> **Last Updated:** 2025-12-30
>
> Use this checklist to systematically test the new NATS infrastructure. Check off items as completed.

---

## Phase 1: Server Spawning (Desktop Only)

**Goal:** Verify NATS server can start and is accessible

- [ ] **1.1** Start dev server with `pnpm tauri:dev`
- [ ] **1.2** Look for `[AutoStart] Starting NATS server in background` in console
- [ ] **1.3** Note the assigned port from logs (e.g., "NATS server started on port 12345")
- [ ] **1.4** Verify `nats-jetstream/` directory was created in the project root
- [ ] **1.5** Verify server is listening: `lsof -i :<port>` or `netstat -an | grep <port>`

**Expected Result:** NATS server spawns successfully on a random port

---

## Phase 2: Client Connection (Manual IP)

**Goal:** Verify controller can connect to a NATS server

### Prerequisites
- [ ] **2.1** App builds and runs without errors
- [ ] **2.2** Have two machines available OR use localhost for testing

### Connection Test
- [ ] **2.3** Add debug connection UI to Controller (or use browser console)
- [ ] **2.4** Get the server IP and port from Phase 1
- [ ] **2.5** Call `connect('<ip>', <port>)` from console or debug UI
- [ ] **2.6** Verify `is_nats_connected` becomes `true`
- [ ] **2.7** Verify `serverUrl` returns the correct NATS URL

**Expected Result:** Connection succeeds, status shows connected

---

## Phase 3: Display Subscription (Missing - Need to Implement)

**Goal:** Displays can receive NATS messages

### Backend Implementation
- [ ] **3.1** Add Tauri command to subscribe to NATS messages
- [ ] **3.2** Emit Tauri events when NATS messages are received
- [ ] **3.3** Handle `lyrics.current` subscription
- [ ] **3.4** Handle `slide.update` subscription

### Frontend Implementation
- [ ] **3.5** Add `useNats` hook to Display page
- [ ] **3.6** Listen for NATS-based lyrics updates
- [ ] **3.7** Listen for NATS-based slide updates
- [ ] **3.8** Update Display UI when messages received

**Expected Result:** Display can receive and render messages from NATS

---

## Phase 4: Messaging Test (Same Machine)

**Goal:** Verify publish/subscribe works locally

### Setup
- [ ] **4.1** Implement Phase 3 (Display subscription) first
- [ ] **4.2** Start app in display mode on same machine

### Test Lyrics Publishing
- [ ] **4.3** From browser console, call:
  ```javascript
  publishLyrics({
    church_id: 'test',
    event_id: 'test',
    song_id: 'test',
    title: 'Test Song',
    lyrics: '# Verse 1\nTest lyrics',
    timestamp: Date.now()
  })
  ```
- [ ] **4.4** Verify Display receives the lyrics
- [ ] **4.5** Verify Display shows the lyrics correctly

### Test Slide Publishing
- [ ] **4.6** From browser console, call:
  ```javascript
  publishSlide({
    church_id: 'test',
    event_id: 'test',
    song_id: 'test',
    slide_index: 1,
    timestamp: Date.now()
  })
  ```
- [ ] **4.7** Verify Display receives the slide update
- [ ] **4.8** Verify Display shows the correct slide

**Expected Result:** Messages flow from publisher to subscriber

---

## Phase 5: Two-Device Test

**Goal:** Verify cross-device communication

### Setup
- [ ] **5.1** Machine A (Display): Start app, note IP address (e.g., `192.168.1.100`)
- [ ] **5.2** Machine A: Note NATS server port from logs
- [ ] **5.3** Machine B (Controller): Start app

### Connection
- [ ] **5.4** Machine B: Connect to `192.168.1.100:<port>`
- [ ] **5.5** Verify connection status shows "connected" on Machine B

### Test Messaging
- [ ] **5.6** Machine B: Select a song from setlist
- [ ] **5.7** Machine A: Verify lyrics appear
- [ ] **5.8** Machine B: Navigate to slide 2
- [ ] **5.9** Machine A: Verify slide updates

**Expected Result:** Real-time sync across devices

---

## Phase 6: mDNS Discovery (Optional)

**Goal:** Verify zero-config service discovery

**Note:** mDNS advertising is not yet implemented. This phase is for future work.

- [ ] **6.1** Implement mDNS advertising in `discovery.rs`
- [ ] **6.2** Displays advertise their presence on network
- [ ] **6.3** Controllers can discover displays without manual IP
- [ ] **6.4** Test discovery across multiple devices

---

## Phase 7: Error Handling

**Goal:** Verify graceful failure modes

- [ ] **7.1** Test connection to non-existent IP (should fail gracefully)
- [ ] **7.2** Test connection to wrong port (should fail gracefully)
- [ ] **7.3** Test what happens when server stops unexpectedly
- [ ] **7.4** Test reconnection flow
- [ ] **7.5** Test publishing when not connected (should handle error)

---

## Debug Commands

### Browser Console (Controller)
```javascript
// Check connection status
await invoke('is_nats_connected')

// Get server URL
await invoke('get_nats_server_url')

// Connect to server
await invoke('connect_nats_server', { host: '192.168.1.x', port: 4222 })

// Publish test lyrics
await invoke('publish_nats_lyrics', {
  churchId: 'test',
  eventId: 'test',
  songId: 'test',
  title: 'Test',
  lyrics: '# Test\n\nLyrics here',
  backgroundUrl: null
})

// Publish test slide
await invoke('publish_nats_slide', {
  churchId: 'test',
  eventId: 'test',
  songId: 'test',
  slideIndex: 0
})
```

### Terminal
```bash
# Check if NATS server is listening
lsof -i :<port>

# View NATS logs
cat nats-jetstream/nats.log

# Clean up JetStream data
rm -rf nats-jetstream/
```

---

## Current Limitations

1. **mDNS Advertising:** Not implemented - displays don't advertise themselves
2. **Display Subscription:** Not implemented - displays can't receive NATS messages yet
3. **Connection UI:** No user-facing connection interface
4. **Automatic Reconnection:** Not implemented
5. **Android TV:** NATS server not supported on Android yet (binary bundling TBD)

---

## Next Steps After Testing

1. Implement Display-side NATS subscription (Phase 3)
2. Add user-facing connection UI
3. Implement mDNS advertising
4. Add reconnection logic
5. Bundle NATS binaries for Windows/Linux
6. Android TV NATS support (foreground service + binary)
