export type DisplayClass = 'audience' | 'stage' | 'lobby';

export interface Display {
  id: string;
  churchId: string;
  pairingCode: string;
  name: string;
  location: string | null;
  displayClass: DisplayClass;
  deviceId: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisplayCreateInput {
  pairingCode: string;
  name: string;
  location: string | null;
  displayClass: DisplayClass;
  deviceId: string | null;
}

export interface DisplayUpdateInput {
  name?: string;
  location?: string | null;
  displayClass?: DisplayClass;
}

export interface DisplayHeartbeatInput {
  pairingCode: string;
  deviceId: string | null;
}
