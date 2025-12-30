export type DisplayClass = 'audience' | 'stage' | 'lobby';

export interface Display {
  id: string;
  churchId: string;
  name: string;
  location: string | null;
  displayClass: DisplayClass;
  deviceId: string; // Now required and unique
  host: string | null; // WebSocket host
  port: number | null; // WebSocket port
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisplayCreateInput {
  name: string;
  location?: string | null;
  displayClass?: DisplayClass;
  deviceId: string;
  host?: string | null;
  port?: number | null;
}

export interface DisplayUpdateInput {
  name?: string;
  location?: string | null;
  displayClass?: DisplayClass;
  host?: string | null;
  port?: number | null;
}

export interface DiscoveredDisplay {
  name: string; // Service fullname (e.g., "Mobile Worship Display._mw-display._tcp.local.")
  host: string; // IP address
  port: number; // WebSocket port
  serviceType: string;
  deviceId?: string; // Extracted from TXT records
}
