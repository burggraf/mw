import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { generatePairingCode } from '@/services/displays';
import { useDisplayHeartbeat } from '@/hooks/useDisplayHeartbeat';
import { QRCode } from '@/components/ui/qr-code';

export function TVPairingScreen() {
  const { t } = useTranslation();
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    // Generate pairing code
    const code = generatePairingCode();
    setPairingCode(code);

    // Announce to signaling server
    invoke('send_pairing_advertisement', {
      pairingCode: code,
      deviceId: 'tv-device', // TODO: get actual device ID
    }).catch(console.error);
  }, []);

  // Send heartbeat every 5 seconds
  useDisplayHeartbeat({
    pairingCode,
    interval: 5000,
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
      <h1 className="text-4xl font-bold mb-8">{t('tv.pairing.title', 'Pair This Display')}</h1>

      <div className="mb-8">
        <QRCode value={pairingCode} size={256} />
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg">{t('tv.pairing.enterCode', 'Enter this code on your controller')}</p>
        <p className="text-5xl font-mono tracking-widest">{pairingCode}</p>
        <p className="text-muted-foreground">{t('tv.pairing.toPair', 'to pair this display')}</p>
      </div>
    </div>
  );
}
