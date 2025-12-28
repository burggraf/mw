import { useState, useEffect } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import type { PeerType } from '@/types/live';

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export function WebRTCDebugPanel() {
  const {
    peers, leaderStatus, isConnected, myPeerId, isLeader, isRunningInTauri,
    startPeer, sendMessage, connectionState, error,
  } = useWebRTC();

  const [peerType, setPeerType] = useState<PeerType>('controller');
  const [displayName, setDisplayName] = useState(isTauri ? 'Test Device' : 'Browser Client');
  const [testMessage, setTestMessage] = useState('Hello from WebRTC!');
  const [receivedMessages, setReceivedMessages] = useState<Array<{ from: string; message: string; time: string }>>([]);

  // Handle received messages (both Tauri and browser mode)
  useEffect(() => {
    if (isConnected) {
      // Listen for custom message event dispatched by WebRTC data channel
      const handleMessage = ((event: CustomEvent<{ fromPeerId: string; message: string }>) => {
        setReceivedMessages(prev => [...prev, {
          from: event.detail.fromPeerId,
          message: event.detail.message,
          time: new Date().toLocaleTimeString(),
        }]);
      }) as EventListener;

      window.addEventListener('webrtc:data_message', handleMessage);
      return () => window.removeEventListener('webrtc:data_message', handleMessage);
    }
  }, [isConnected]);

  const handleStart = async () => {
    try { await startPeer(peerType, displayName); }
    catch (e) { console.error('Failed to start peer:', e); }
  };

  const handleSendTestMessage = async (targetPeerId: string) => {
    try {
      await sendMessage(targetPeerId, testMessage);
      setReceivedMessages(prev => [...prev, {
        from: `Me -> ${targetPeerId.slice(0, 8)}`,
        message: testMessage,
        time: new Date().toLocaleTimeString(),
      }]);
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  };

  const otherPeers = peers.filter(p => p.id !== myPeerId);

  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">WebRTC Debug Panel</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${isRunningInTauri ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
          {isRunningInTauri ? 'Tauri Mode' : 'Browser Mode'}
        </span>
      </div>

      <div className={`mb-4 p-2 text-sm rounded ${isRunningInTauri ? 'bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100' : 'bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100'}`}>
        {isRunningInTauri
          ? 'Running in Tauri desktop app. Click Start Peer to initialize WebRTC and signaling server.'
          : 'Running in browser mode. Connects to Tauri app signaling server at ws://localhost:3010 (Tauri app must Start Peer first)'}
      </div>

      <div className="mb-4 p-2 bg-muted rounded">
        <div className="text-sm font-medium">Connection State: {connectionState}</div>
        {isConnected && (
          <>
            <div className="text-sm">My Peer ID: {myPeerId}</div>
            <div className="text-sm">Is Leader: {isLeader ? 'Yes' : 'No'}</div>
            <div className="text-sm">Leader ID: {leaderStatus.leaderId || 'None'}</div>
            <div className="text-sm">Peer Count: {leaderStatus.peerCount}</div>
          </>
        )}
        {error && <div className="text-sm text-destructive">Error: {error}</div>}
      </div>

      {!isConnected && (
        <div className="mb-4 space-y-2">
          <select value={peerType} onChange={(e) => setPeerType(e.target.value as PeerType)}
                  className="w-full p-2 border rounded">
            <option value="controller">Controller</option>
            <option value="display">Display</option>
          </select>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                 placeholder="Display Name" className="w-full p-2 border rounded" />
          <button onClick={handleStart} className="w-full p-2 bg-primary text-primary-foreground rounded">
            Start Peer
          </button>
        </div>
      )}

      {isConnected && otherPeers.length > 0 && (
        <div className="mb-4 space-y-2">
          <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)}
                 placeholder="Test message" className="w-full p-2 border rounded" />
          <div className="text-xs text-muted-foreground">
            Send test message to peers via WebRTC data channel
          </div>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-md font-semibold mb-2">Connected Peers</h3>
        {peers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No peers connected</p>
        ) : (
          <ul className="space-y-2">
            {peers.map((peer) => (
              <li key={peer.id} className={`text-sm p-2 rounded ${peer.id === myPeerId ? 'bg-accent' : 'bg-muted'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{peer.display_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {peer.peer_type} {peer.is_leader && '(Leader)'}
                    </div>
                    <div className="text-xs">Status: {peer.is_connected ? 'Connected' : 'Disconnected'}</div>
                  </div>
                  {peer.id !== myPeerId && isConnected && (
                    <button
                      onClick={() => handleSendTestMessage(peer.id)}
                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded"
                    >
                      Send Test
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {receivedMessages.length > 0 && (
        <div>
          <h3 className="text-md font-semibold mb-2">Message Log</h3>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {receivedMessages.slice(-10).map((msg, i) => (
              <li key={i} className="text-xs p-2 bg-muted rounded">
                <span className="text-muted-foreground">[{msg.time}]</span>{' '}
                <span className="font-medium">{msg.from}:</span> {msg.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
