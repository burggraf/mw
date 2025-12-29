import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface PairingScreenProps {
  onPaired: () => void;
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const { t } = useTranslation();
  const [pairingCode, setPairingCode] = useState('');
  const [heartbeatInterval, setHeartbeatInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Generate a random 6-character pairing code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPairingCode(code);

    // Send pairing advertisement and start heartbeat
    const setupPairing = async () => {
      try {
        // Get or generate device ID
        const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
        localStorage.setItem('device_id', deviceId);

        // Send pairing advertisement
        await invoke('send_pairing_advertisement', {
          pairing_code: code,
          device_id: deviceId,
        });

        // Start heartbeat interval (every 5 seconds)
        const interval = setInterval(async () => {
          try {
            await invoke('send_display_heartbeat', { pairing_code: code });
          } catch (err) {
            console.error('Heartbeat failed:', err);
          }
        }, 5000);

        setHeartbeatInterval(interval);
      } catch (err) {
        console.error('Failed to send pairing advertisement:', err);
      }
    };

    setupPairing();

    // Listen for pairing confirmation
    const unlisten = listen<{ display_name: string; location?: string }>(
      'webrtc:pairing_confirmed',
      () => {
        onPaired();
      }
    );

    return () => {
      unlisten.then(fn => fn());
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [onPaired]);

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">{t('tv.pairing.title')}</h1>
      <p className="text-2xl text-muted-foreground mb-12">{t('tv.pairing.subtitle')}</p>

      <div className="bg-card rounded-lg p-8 shadow-lg border border-border mb-8">
        <QRCodeSVG value={pairingCode} size={256} level="M" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-xl">{t('tv.pairing.enterCode')}</p>
        <p className="text-6xl font-mono tracking-widest font-bold">
          {pairingCode}
        </p>
        <p className="text-muted-foreground mt-4">{t('tv.pairing.toPair')}</p>
      </div>

      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          {t('tv.pairing.menuHint')}
        </p>
      </div>
    </div>
  );
}
