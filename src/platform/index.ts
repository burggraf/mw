import { isTauri, safeInvoke } from '@/lib/tauri';

export type Platform = 'desktop' | 'android-tv' | 'web';
export type AppMode = 'controller' | 'display';

let cachedPlatform: Platform | null = null;

/**
 * Detect the current platform using Tauri's platform detection
 * Returns 'web' when running in a browser without Tauri
 */
export async function detectPlatform(): Promise<Platform> {
  if (cachedPlatform) return cachedPlatform;

  if (!isTauri()) {
    cachedPlatform = 'web';
    return cachedPlatform;
  }

  const platform = await safeInvoke<string>('get_platform');
  if (platform === 'android') {
    cachedPlatform = 'android-tv';
  } else {
    cachedPlatform = 'desktop';
  }

  return cachedPlatform;
}

/**
 * Get the app mode based on platform
 * Desktop = controller (full UI with auth)
 * Android TV = display (minimal UI, no auth)
 */
export function getMode(platform: Platform): AppMode {
  return platform === 'android-tv' ? 'display' : 'controller';
}

/**
 * Convenience function to get app mode directly
 */
export async function getAppMode(): Promise<AppMode> {
  const platform = await detectPlatform();
  return getMode(platform);
}

/**
 * Check if we're running on Android TV
 */
export async function isAndroidTV(): Promise<boolean> {
  const platform = await detectPlatform();
  return platform === 'android-tv';
}

/**
 * Check if we're running in controller mode
 */
export async function isControllerMode(): Promise<boolean> {
  const mode = await getAppMode();
  return mode === 'controller';
}
