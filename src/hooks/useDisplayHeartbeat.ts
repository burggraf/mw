import { useEffect, useRef } from 'react';
import { isTauri, safeInvoke } from '@/lib/tauri';

interface UseDisplayHeartbeatOptions {
  /** The pairing code for this display */
  pairingCode: string | null;
  /** Heartbeat interval in milliseconds (default: 5000ms) */
  interval?: number;
  /** Whether heartbeat is enabled (default: true) */
  enabled?: boolean;
  /** Callback when heartbeat succeeds */
  onHeartbeat?: () => void;
  /** Callback when heartbeat fails */
  onError?: (error: unknown) => void;
}

/**
 * Hook for displays to send periodic heartbeats to the signaling server.
 * This keeps the display marked as online in the database.
 *
 * @example
 * ```tsx
 * function MyDisplay() {
 *   const { pairingCode } = usePairingCode();
 *   useDisplayHeartbeat({ pairingCode });
 *   return <div>Display content</div>;
 * }
 * ```
 */
export function useDisplayHeartbeat({
  pairingCode,
  interval = 5000,
  enabled = true,
  onHeartbeat,
  onError,
}: UseDisplayHeartbeatOptions) {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Don't start if not enabled, no pairing code, or not in Tauri
    if (!enabled || !pairingCode || !isTauri()) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Send heartbeat immediately
    const sendHeartbeat = async () => {
      try {
        await safeInvoke('send_display_heartbeat', {
          pairingCode,
        });
        onHeartbeat?.();
      } catch (error) {
        onError?.(error);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = window.setInterval(sendHeartbeat, interval);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pairingCode, interval, enabled, onHeartbeat, onError]);
}

/**
 * Hook for controllers to mark stale displays as offline.
 * This should be called once per church to manage offline detection.
 *
 * @example
 * ```tsx
 * function ControllerPage() {
 *   const { currentChurch } = useChurch();
 *   useDisplayOfflinePolling({ churchId: currentChurch?.id });
 *   return <div>Controller content</div>;
 * }
 * ```
 */
export function useDisplayOfflinePolling(options: {
  /** The church ID to poll displays for */
  churchId: string | null;
  /** Polling interval in milliseconds (default: 30000ms) */
  interval?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}) {
  const { churchId, interval = 30000, enabled = true } = options;
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !churchId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Import dynamically to avoid circular dependencies
    const markStaleDisplaysOffline = async () => {
      try {
        const { markStaleDisplaysOffline } = await import('@/services/displays');
        await markStaleDisplaysOffline(churchId);
      } catch (error) {
        console.error('Failed to mark stale displays offline:', error);
      }
    };

    // Initial check
    markStaleDisplaysOffline();

    // Set up interval
    intervalRef.current = window.setInterval(markStaleDisplaysOffline, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [churchId, interval, enabled]);
}
