/**
 * Browser-native WebRTC client for connecting to Tauri signaling server
 *
 * This allows the web version to connect to a Tauri app acting as signaling server
 * for cross-platform WebRTC testing.
 */

import type { PeerInfo, LeaderStatus } from '@/types/live';

// Signaling message types matching Rust backend
type SignalingMessage =
  | { type: 'register'; peer_id: string; peer_type: 'controller' | 'display'; display_name: string; priority: [number, number] }
  | { type: 'offer'; from_peer_id: string; to_peer_id: string; sdp: string }
  | { type: 'answer'; from_peer_id: string; to_peer_id: string; sdp: string }
  | { type: 'ice_candidate'; from_peer_id: string; to_peer_id: string; candidate: string; sdp_mid: string | null; sdp_mline_index: number | null }
  | { type: 'heartbeat'; peer_id: string }
  | { type: 'peer_list'; peers: PeerInfo[] }
  | { type: 'data'; from_peer_id: string; to_peer_id: string; message: string };

interface BrowserWebRTCConfig {
  signalingUrl: string;
  peerType: 'controller' | 'display';
  displayName: string;
  onPeersChanged: (peers: PeerInfo[]) => void;
  onLeaderChanged: (leaderId: string | null) => void;
  onDataMessage?: (fromPeerId: string, message: string) => void;
  onConnectionStateChange?: (state: 'disconnected' | 'discovering' | 'connected' | 'error') => void;
  onError?: (error: string) => void;
}

export class BrowserWebRTCClient {
  private config: BrowserWebRTCConfig;
  private ws: WebSocket | null = null;
  private peerId: string;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private connectionState: 'disconnected' | 'discovering' | 'connected' | 'error' = 'disconnected';
  private peers: PeerInfo[] = [];
  private leaderId: string | null = null;

  constructor(config: BrowserWebRTCConfig) {
    this.config = config;
    this.peerId = crypto.randomUUID();
  }

  get myPeerId(): string {
    return this.peerId;
  }

  get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  get isLeader(): boolean {
    return this.leaderId === this.peerId;
  }

  getPeers(): PeerInfo[] {
    return this.peers;
  }

  getLeaderStatus(): LeaderStatus {
    return {
      leaderId: this.leaderId,
      amILeader: this.isLeader,
      peerCount: this.peers.length,
    };
  }

  async start(): Promise<string> {
    this.connectionState = 'discovering';
    this.config.onConnectionStateChange?.('discovering');

    try {
      // Connect to signaling server
      await this.connectToSignaling();
      this.connectionState = 'connected';
      this.config.onConnectionStateChange?.('connected');
      return this.peerId;
    } catch (error) {
      this.connectionState = 'error';
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.config.onError?.(errorMsg);
      throw error;
    }
  }

  async sendMessage(targetPeerId: string, message: string): Promise<void> {
    // For MVP, send via signaling relay instead of direct WebRTC data channel
    // Direct WebRTC data channels require full peer connection implementation
    const dataMsg = {
      type: 'data' as const,
      from_peer_id: this.peerId,
      to_peer_id: targetPeerId,
      message,
    };
    this.ws?.send(JSON.stringify(dataMsg));
  }

  stop(): void {
    // Stop heartbeat
    this.stopHeartbeat();

    // Close all data channels
    for (const channel of this.dataChannels.values()) {
      channel.close();
    }
    this.dataChannels.clear();

    // Close all peer connections
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionState = 'disconnected';
    this.config.onConnectionStateChange?.('disconnected');
  }

  private async connectToSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.signalingUrl);

      this.ws.onopen = () => {
        console.log('[Browser WebRTC] Connected to signaling server');

        // Send register message
        const registerMsg: SignalingMessage = {
          type: 'register',
          peer_id: this.peerId,
          peer_type: this.config.peerType,
          display_name: this.config.displayName,
          priority: this.getPriority(),
        };
        this.sendSignaling(registerMsg);

        // Start heartbeat
        this.startHeartbeat();

        resolve();
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalingMessage;
          await this.handleSignalingMessage(msg);
        } catch (error) {
          console.error('[Browser WebRTC] Failed to parse signaling message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Browser WebRTC] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        console.log('[Browser WebRTC] Disconnected from signaling server');
        this.connectionState = 'disconnected';
        this.config.onConnectionStateChange?.('disconnected');
      };
    });
  }

  private getPriority(): [number, number] {
    const deviceTypeScore = this.config.peerType === 'controller' ? 2 : 1;
    const startupTimeMs = Date.now();
    return [deviceTypeScore, startupTimeMs];
  }

  private sendSignaling(msg: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    switch (msg.type) {
      case 'peer_list':
        this.peers = msg.peers;
        this.config.onPeersChanged(msg.peers);

        // Find leader
        const leader = msg.peers.find(p => p.is_leader);
        if (leader?.id !== this.leaderId) {
          this.leaderId = leader?.id || null;
          this.config.onLeaderChanged(this.leaderId);
        }

        // Connect to new peers
        for (const peer of msg.peers) {
          if (peer.id !== this.peerId && peer.is_connected && !this.peerConnections.has(peer.id)) {
            await this.connectToPeer(peer);
          }
        }
        break;

      case 'offer':
        await this.handleOffer(msg);
        break;

      case 'answer':
        await this.handleAnswer(msg);
        break;

      case 'ice_candidate':
        await this.handleIceCandidate(msg);
        break;

      case 'heartbeat':
        // Heartbeat received
        break;

      case 'data':
        if (msg.to_peer_id === this.peerId) {
          console.log('[Browser WebRTC] Received data message from', msg.from_peer_id, ':', msg.message);
          this.config.onDataMessage?.(msg.from_peer_id, msg.message);
          // Dispatch custom event for React components to listen to
          window.dispatchEvent(new CustomEvent('webrtc:data_message', {
            detail: { fromPeerId: msg.from_peer_id, message: msg.message }
          }));
        }
        break;
    }
  }

  private async connectToPeer(peer: PeerInfo): Promise<void> {
    console.log('[Browser WebRTC] Connecting to peer:', peer.id);

    // Create peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.peerConnections.set(peer.id, pc);

    // Create data channel for initiator
    const dc = pc.createDataChannel('control', { ordered: true });
    this.setupDataChannel(dc, peer.id);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: 'ice_candidate',
          from_peer_id: this.peerId,
          to_peer_id: peer.id,
          candidate: event.candidate.candidate,
          sdp_mid: event.candidate.sdpMid,
          sdp_mline_index: event.candidate.sdpMLineIndex,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Browser WebRTC] Connection state to', peer.id, ':', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.peerConnections.delete(peer.id);
        this.dataChannels.delete(peer.id);
      }
    };

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          }
        };
      }
    });

    // Send offer
    this.sendSignaling({
      type: 'offer',
      from_peer_id: this.peerId,
      to_peer_id: peer.id,
      sdp: pc.localDescription?.sdp || '',
    });
  }

  private async handleOffer(msg: SignalingMessage & { type: 'offer' }): Promise<void> {
    if (msg.to_peer_id !== this.peerId) return;

    console.log('[Browser WebRTC] Received offer from', msg.from_peer_id);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.peerConnections.set(msg.from_peer_id, pc);

    // Handle incoming data channel
    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, msg.from_peer_id);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: 'ice_candidate',
          from_peer_id: this.peerId,
          to_peer_id: msg.from_peer_id,
          candidate: event.candidate.candidate,
          sdp_mid: event.candidate.sdpMid,
          sdp_mline_index: event.candidate.sdpMLineIndex,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Browser WebRTC] Connection state to', msg.from_peer_id, ':', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.peerConnections.delete(msg.from_peer_id);
        this.dataChannels.delete(msg.from_peer_id);
      }
    };

    // Set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer
    this.sendSignaling({
      type: 'answer',
      from_peer_id: this.peerId,
      to_peer_id: msg.from_peer_id,
      sdp: answer.sdp || '',
    });
  }

  private async handleAnswer(msg: SignalingMessage & { type: 'answer' }): Promise<void> {
    if (msg.to_peer_id !== this.peerId) return;

    console.log('[Browser WebRTC] Received answer from', msg.from_peer_id);

    const pc = this.peerConnections.get(msg.from_peer_id);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
    }
  }

  private async handleIceCandidate(msg: SignalingMessage & { type: 'ice_candidate' }): Promise<void> {
    if (msg.to_peer_id !== this.peerId) return;

    const pc = this.peerConnections.get(msg.from_peer_id);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate({
        candidate: msg.candidate,
        sdpMid: msg.sdp_mid ?? undefined,
        sdpMLineIndex: msg.sdp_mline_index ?? undefined,
      }));
    }
  }

  private setupDataChannel(dc: RTCDataChannel, peerId: string): void {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      console.log('[Browser WebRTC] Data channel to', peerId, 'is open');
    };

    dc.onmessage = (event) => {
      console.log('[Browser WebRTC] Received message from', peerId, ':', event.data);
      this.config.onDataMessage?.(peerId, event.data);
      // Dispatch custom event for React components to listen to
      window.dispatchEvent(new CustomEvent('webrtc:data_message', {
        detail: { fromPeerId: peerId, message: event.data }
      }));
    };

    dc.onerror = (error) => {
      console.error('[Browser WebRTC] Data channel error:', error);
    };

    dc.onclose = () => {
      console.log('[Browser WebRTC] Data channel to', peerId, 'closed');
    };
  }

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendSignaling({
        type: 'heartbeat',
        peer_id: this.peerId,
      });
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
