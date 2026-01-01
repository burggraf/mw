/**
 * Tauri platform detection utilities
 *
 * Use these to gracefully handle features that only work in Tauri (native) vs web browser.
 */

/**
 * Synchronously check if running in Tauri environment.
 * This checks for the presence of the Tauri IPC bridge.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Safely invoke a Tauri command, returning null if not in Tauri environment.
 * Use this for optional Tauri features that should gracefully degrade.
 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  if (!isTauri()) {
    return null
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(command, args)
  } catch (error) {
    console.warn(`[Tauri] Command '${command}' failed:`, error)
    return null
  }
}

/**
 * Platform capabilities based on environment
 */
export interface PlatformCapabilities {
  /** Can discover displays via mDNS */
  canDiscoverDisplays: boolean
  /** Can advertise as a display via mDNS */
  canAdvertiseDisplay: boolean
  /** Can open windows on specific monitors */
  canManageWindows: boolean
  /** Can host a WebSocket server (display mode) */
  canHostWebSocket: boolean
  /** Can connect to displays as WebSocket client */
  canConnectToDisplays: boolean
}

/**
 * Get the capabilities of the current platform
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const tauri = isTauri()

  return {
    canDiscoverDisplays: tauri,
    canAdvertiseDisplay: tauri,
    canManageWindows: tauri,
    canHostWebSocket: tauri,
    // WebSocket client works in both environments
    canConnectToDisplays: true,
  }
}
