import { useState, useEffect, useCallback, useRef } from 'react';
import type { PeerType, PeerInfo, LeaderStatus } from '@/types/live';
import { BrowserWebRTCClient } from '@/lib/webrtc-browser';
import { isTauri, safeInvoke } from '@/lib/tauri';

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

async function invokeWrapper<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    // Browser fallback for testing
    console.log('[Browser Mock] invoke:', command, args);
    return Promise.reject(new Error('Not running in Tauri - WebRTC only works in the desktop app'));
  }
  const result = await safeInvoke<T>(command, args);
  if (result === null) {
    throw new Error(`Failed to invoke ${command}`);
  }
  return result;
}

async function listenWrapper<T>(event: string, handler: (event: { payload: T }) => void) {
  if (!isTauri()) {
    // Browser fallback - do nothing
    return () => {};
  }
  const { listen } = await import('@tauri-apps/api/event');
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
  const [isRunningInTauri] = useState(isTauri());

  // Store browser client instance
  const [browserClient] = useState<BrowserWebRTCClient | null>(() =>
    isTauri() ? null : new BrowserWebRTCClient({
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

      if (isTauri()) {
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
      if (isTauri()) {
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
    if (!isTauri()) return;
    const unbindPromise = listenWrapper<PeerInfo[]>('webrtc:peer_list_changed', (event) => {
      setPeers(event.payload);
    });
    return () => {
      unbindPromise.then?.((unlisten: (() => void) | undefined) => unlisten?.()).catch?.(() => {});
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const unbindPromise = listenWrapper<string>('webrtc:leader_changed', (event) => {
      const newLeaderId = event.payload;
      const myId = myPeerIdRef.current;
      const amILeader = newLeaderId === myId;
      setLeaderStatus(prev => ({
        ...prev,
        leaderId: newLeaderId,
        amILeader,
      }));
    });
    return () => {
      unbindPromise.then?.((unlisten: (() => void) | undefined) => unlisten?.()).catch?.(() => {});
    };
  }, []);  // Set up listener immediately, not waiting for myPeerId

  // Bridge Tauri's webrtc:data_received event to window event for pages to listen
  useEffect(() => {
    const inTauri = isTauri();
    console.log('[useWebRTC] Setting up webrtc:data_received bridge, isTauri:', inTauri);
    if (!inTauri) {
      console.warn('[useWebRTC] NOT in Tauri - event bridge will NOT work!');
      return;
    }

    // Test if Tauri event system is working at all
    import('@tauri-apps/api/event').then(({ listen }) => {
      const testUnbind = listen<any>('test-event', (e) => {
        console.log('[useWebRTC] Test event received:', e.payload);
      });
      console.log('[useWebRTC] Test event listener registered');
      // Store testUnbind for cleanup if needed
      (window as any).__testUnbind = testUnbind;
    });

    const unbindPromise = listenWrapper<{from_peer_id: string, message: string}>('webrtc:data_received', (event) => {
      console.log('[useWebRTC] Received Tauri event, bridging to window:', event.payload);
      // Dispatch as window CustomEvent so pages can listen via addEventListener
      const customEvent = new CustomEvent('webrtc:data_received', {
        detail: event.payload
      });
      window.dispatchEvent(customEvent);
      console.log('[useWebRTC] Dispatched window event');
    });
    console.log('[useWebRTC] Event listener registered, unbindPromise:', unbindPromise);

    // Store unbind function for manual debugging
    (window as any).__dataReceivedUnbind = unbindPromise;

    return () => {
      console.log('[useWebRTC] Cleaning up event listener');
      unbindPromise.then?.((unlisten: (() => void) | undefined) => unlisten?.()).catch?.(() => {});
      // Also clean up test listener
      const testUnbind = (window as any).__testUnbind;
      if (testUnbind) {
        testUnbind.then?.((unlisten: (() => void) | undefined) => unlisten?.()).catch?.(() => {});
        delete (window as any).__testUnbind;
      }
      delete (window as any).__dataReceivedUnbind;
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !isTauri()) return;
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
