import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useState, useEffect, useCallback } from 'react';
import type { PeerType } from '@/types/live';

export interface PeerInfo {
  id: string;
  peerType: 'controller' | 'display';
  displayName: string;
  isConnected: boolean;
  isLeader: boolean;
}

export interface LeaderStatus {
  leaderId: string | null;
  amILeader: boolean;
  peerCount: number;
}

export interface UseWebRTCReturn {
  peers: PeerInfo[];
  leaderStatus: LeaderStatus;
  isConnected: boolean;
  myPeerId: string | null;
  isLeader: boolean;
  startPeer: (peerType: PeerType, displayName: string) => Promise<string>;
  sendMessage: (targetPeerId: string, message: string) => Promise<void>;
  connectionState: 'disconnected' | 'discovering' | 'connected' | 'error';
  error: string | null;
}

export function useWebRTC(): UseWebRTCReturn {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [leaderStatus, setLeaderStatus] = useState<LeaderStatus>({
    leaderId: null,
    amILeader: false,
    peerCount: 0,
  });
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    'disconnected' | 'discovering' | 'connected' | 'error'
  >('disconnected');
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectionState === 'connected';
  const isLeader = leaderStatus.amILeader;

  const startPeer = useCallback(async (peerType: PeerType, displayName: string) => {
    try {
      setConnectionState('discovering');
      setError(null);
      const peerId = await invoke<string>('start_peer', { peerType, displayName });
      setMyPeerId(peerId);
      setConnectionState('connected');
      return peerId;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      setConnectionState('error');
      throw e;
    }
  }, []);

  const sendMessage = useCallback(async (targetPeerId: string, message: string) => {
    try {
      await invoke('send_control_message', { targetPeerId, message });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  useEffect(() => {
    const unbind = listen<PeerInfo[]>('webrtc:peer_list_changed', (event) => {
      setPeers(event.payload);
    });
    return () => { unbind.then(fn => fn()); };
  }, []);

  useEffect(() => {
    const unbind = listen<string>('webrtc:leader_changed', (event) => {
      setLeaderStatus(prev => ({
        ...prev,
        leaderId: event.payload,
        amILeader: event.payload === myPeerId,
      }));
    });
    return () => { unbind.then(fn => fn()); };
  }, [myPeerId]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(async () => {
      try {
        const status = await invoke<LeaderStatus>('get_leader_status');
        setLeaderStatus(status);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [isConnected]);

  return {
    peers, leaderStatus, isConnected, myPeerId, isLeader,
    startPeer, sendMessage, connectionState, error,
  };
}
