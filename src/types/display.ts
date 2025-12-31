export type DisplayClass = 'audience' | 'stage' | 'lobby';

export interface Display {
  id: string;
  churchId: string;
  displayId: string; // Per-display UUID based on EDID fingerprint
  deviceId: string; // Device this display belongs to (multiple displays per device)
  name: string;
  location: string | null;
  displayClass: DisplayClass;
  // Hardware info from EDID
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  width: number | null; // Pixel width
  height: number | null; // Pixel height
  physicalWidthCm: number | null; // Physical width in cm
  physicalHeightCm: number | null; // Physical height in cm
  platform: string | null; // Platform/OS info (e.g., "Fire OS 7", "Android 11")
  // Connection info
  host: string | null; // WebSocket host
  port: number | null; // WebSocket port
  // Status
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisplayCreateInput {
  displayId: string; // Required: per-display UUID
  deviceId: string; // Required: device this display belongs to
  name: string;
  location?: string | null;
  displayClass?: DisplayClass;
  // Optional hardware info
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  width?: number | null;
  height?: number | null;
  physicalWidthCm?: number | null;
  physicalHeightCm?: number | null;
  platform?: string | null;
  // Optional connection info
  host?: string | null;
  port?: number | null;
}

export interface DisplayUpdateInput {
  name?: string;
  location?: string | null;
  displayClass?: DisplayClass;
  // Hardware info can be updated (e.g., if EDID changes)
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  width?: number | null;
  height?: number | null;
  physicalWidthCm?: number | null;
  physicalHeightCm?: number | null;
  platform?: string | null;
  // Connection info
  host?: string | null;
  port?: number | null;
}

export interface DiscoveredDisplay {
  name: string; // Service fullname (e.g., "Mobile Worship Display._mw-display._tcp.local.")
  host: string; // IP address
  port: number; // WebSocket port
  serviceType: string;
  displayId: string; // Per-display UUID from TXT records (required for per-display tracking)
  deviceId?: string; // Device UUID from TXT records (for backward compat)
  displayName?: string; // Human-readable name from TXT records
  width?: number; // Resolution width from TXT records
  height?: number; // Resolution height from TXT records
  platform?: string; // Platform/OS info from TXT records
}

// Extended monitor info returned from Tauri with EDID data
export interface MonitorInfo {
  displayId: string; // Persistent UUID based on EDID fingerprint
  id: number; // OS-assigned index (volatile)
  name: string; // OS-provided name
  manufacturer: string; // From EDID (e.g., "DEL" for Dell)
  model: string; // From EDID (e.g., "DELL U2723QE")
  serialNumber: string; // From EDID (may be empty)
  positionX: number;
  positionY: number;
  sizeX: number; // Pixel width
  sizeY: number; // Pixel height
  physicalWidthCm: number; // Physical width in cm from EDID
  physicalHeightCm: number; // Physical height in cm from EDID
  scaleFactor: number;
  isPrimary: boolean;
}
