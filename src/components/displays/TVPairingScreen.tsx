import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { generatePairingCode } from '@/services/displays';

export function TVPairingScreen() {
  const [pairingCode, setPairingCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    // Generate pairing code
    const code = generatePairingCode();
    setPairingCode(code);

    // Generate QR code URL (using a public QR code API)
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${code}`);

    // Announce to signaling server
    invoke('send_pairing_advertisement', {
      pairingCode: code,
      deviceId: 'tv-device', // TODO: get actual device ID
    }).catch(console.error);

    // Send heartbeat every 5 seconds
    const heartbeat = setInterval(() => {
      invoke('send_display_heartbeat', { pairingCode: code })
        .catch(console.error);
    }, 5000);

    return () => clearInterval(heartbeat);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
      <h1 className="text-4xl font-bold mb-8">Pair This Display</h1>

      <div className="bg-card rounded-lg p-8 shadow-lg mb-8">
        <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg">Enter this code on your controller</p>
        <p className="text-5xl font-mono tracking-widest">{pairingCode}</p>
        <p className="text-muted-foreground">to pair this display</p>
      </div>
    </div>
  );
}
