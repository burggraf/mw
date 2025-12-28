import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { PeerType, PeerInfo, LeaderStatus } from '@/types/live';
import { BrowserWebRTCClient } from '@/lib/webrtc-browser';

// Check if running in Tauri
// Use a more robust check that works in dev mode
const isTauri = typeof window !== 'undefined' && (
  '__TAURI__' in window ||
  '__TAURI_INTERNALS__' in window
);

// Re-export types for convenience
export type { PeerInfo, LeaderStatus };

export interface UseWebRTCReturn {
  peers: PeerInfo[];
  leaderStatus: LeaderStatus;
  isConnected: boolean;
  myPeerId: string | null;
  isLeader: boolean;
  isRunningInTauri: boolean;
  startPeer: (peerType: PeerType, displayName: string) => Promise<string>;
  sendMessage: (targetPeerId: string, message: string) => Promise<void>;
  connectionState: 'disconnected' | 'discovering' | 'connected' | 'error';
  error: string | null;
}

function invokeWrapper<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    // Browser fallback for testing
    console.log('[Browser Mock] invoke:', command, args);
    return Promise.reject(new Error('Not running in Tauri - WebRTC only works in the desktop app'));
  }
  return invoke<T>(command, args);
}

function listenWrapper<T>(event: string, handler: (event: { payload: T }) => void) {
  if (!isTauri) {
    // Browser fallback - do nothing
    return { then: () => {}, catch: () => {} } as any;
  }
  return listen<T>(event, handler);
}

export function useWebRTC(): UseWebRTCReturn {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [leaderStatus, setLeaderStatus] = useState<LeaderStatus>({
    leaderId: null,
    amILeader: false,
    peerCount: 0,
  });
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const myPeerIdRef = useRef<string | null>(null);  // Ref to always have current value
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'discovering' | 'connected' | 'error'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isRunningInTauri] = useState(isTauri);

  // Store browser client instance
  const [browserClient] = useState<BrowserWebRTCClient | null>(() =>
    isTauri ? null : new BrowserWebRTCClient({
      signalingUrl: 'ws://localhost:3010',
      peerType: 'controller',
      displayName: 'Browser Client',
      onPeersChanged: (peers) => setPeers(peers),
      onLeaderChanged: (leaderId) => {
        setLeaderStatus(prev => ({
          ...prev,
          leaderId,
          amILeader: leaderId === myPeerId,
        }));
      },
      onConnectionStateChange: setConnectionState,
      onError: setError,
    })
  );

  const isConnected = connectionState === 'connected';
  const isLeader = leaderStatus.amILeader;

  const startPeer = useCallback(async (peerType: PeerType, displayName: string) => {
    try {
      setConnectionState('discovering');
      setError(null);

      if (isTauri) {
        // Use Tauri backend
        const peerId = await invokeWrapper<string>('start_peer', { peerType, displayName });
        myPeerIdRef.current = peerId;  // Update ref
        setMyPeerId(peerId);
        setConnectionState('connected');

        // Fetch leader status to ensure we have the latest state
        // (events may have fired before our ref was set)
        try {
          const status = await invokeWrapper<any>('get_leader_status', {});
          // Map snake_case from Rust to camelCase for TypeScript
          setLeaderStatus({
            leaderId: status.leader_id,
            amILeader: status.am_i_leader,
            peerCount: status.peer_count,
          });
        } catch (e) {
          // Ignore errors on initial status fetch
        }

        return peerId;
      } else {
        // Use browser client
        if (!browserClient) {
          throw new Error('Browser client not initialized');
        }
        // Update the client's peer type and display name
        (browserClient as any).config.peerType = peerType;
        (browserClient as any).config.displayName = displayName;
        const peerId = await browserClient.start();
        myPeerIdRef.current = peerId;  // Update ref
        setMyPeerId(peerId);
        setConnectionState('connected');
        return peerId;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setConnectionState('error');
      throw e;
    }
  }, [browserClient]);

  const sendMessage = useCallback(async (targetPeerId: string, message: string) => {
    try {
      if (isTauri) {
        await invokeWrapper('send_control_message', { targetPeerId, message });
      } else {
        if (!browserClient) {
          throw new Error('Browser client not initialized');
        }
        await browserClient.sendMessage(targetPeerId, message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [browserClient]);

  // Tauri-specific event listeners
  useEffect(() => {
    if (!isTauri) return;
    const unbind = listenWrapper<PeerInfo[]>('webrtc:peer_list_changed', (event) => {
      setPeers(event.payload);
    });
    return () => { unbind.then?.((fn: (() => void) | undefined) => fn?.()); };
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const unbind = listenWrapper<string>('webrtc:leader_changed', (event) => {
      const newLeaderId = event.payload;
      const myId = myPeerIdRef.current;
      const amILeader = newLeaderId === myId;
      setLeaderStatus(prev => ({
        ...prev,
        leaderId: newLeaderId,
        amILeader,
      }));
    });
    return () => { unbind.then?.((fn: (() => void) | undefined) => fn?.()); };
  }, []);  // Set up listener immediately, not waiting for myPeerId

  useEffect(() => {
    if (!isConnected || !isTauri) return;
    const interval = setInterval(async () => {
      try {
        // Poll for leader status
        const status = await invokeWrapper<any>('get_leader_status', {});
        setLeaderStatus({
          leaderId: status.leader_id,
          amILeader: status.am_i_leader,
          peerCount: status.peer_count,
        });

        // Poll for peer list from signaling server
        const peers = await invokeWrapper<PeerInfo[]>('get_connected_peers', {});
        setPeers(peers);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Cleanup browser client on unmount
  useEffect(() => {
    return () => {
      if (browserClient) {
        browserClient.stop();
      }
    };
  }, [browserClient]);

  return {
    peers, leaderStatus, isConnected, myPeerId, isLeader, isRunningInTauri,
    startPeer, sendMessage, connectionState, error,
  };
}
