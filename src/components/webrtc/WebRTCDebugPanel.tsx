import { useState } from 'react';
import { useWebRTC } from '@/hooks/useWebRTC';
import type { PeerType } from '@/types/live';

export function WebRTCDebugPanel() {
  const {
    peers, leaderStatus, isConnected, myPeerId, isLeader,
    startPeer, connectionState, error,
  } = useWebRTC();

  const [peerType, setPeerType] = useState<PeerType>('controller');
  const [displayName, setDisplayName] = useState('Test Device');

  const handleStart = async () => {
    try { await startPeer(peerType, displayName); }
    catch (e) { console.error('Failed to start peer:', e); }
  };

  return (
    <div className="p-4 border rounded-lg bg-card">
      <h2 className="text-lg font-semibold mb-4">WebRTC Debug Panel</h2>

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

      <div>
        <h3 className="text-md font-semibold mb-2">Connected Peers</h3>
        {peers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No peers connected</p>
        ) : (
          <ul className="space-y-1">
            {peers.map((peer) => (
              <li key={peer.id} className={`text-sm p-2 rounded ${peer.id === myPeerId ? 'bg-accent' : 'bg-muted'}`}>
                <div className="font-medium">{peer.displayName}</div>
                <div className="text-xs text-muted-foreground">
                  {peer.peerType} {peer.isLeader && '(Leader)'}
                </div>
                <div className="text-xs">Status: {peer.isConnected ? 'Connected' : 'Disconnected'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
