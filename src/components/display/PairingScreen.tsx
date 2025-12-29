import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface PairingScreenProps {
  onPaired: () => void;
}

export function PairingScreen({ onPaired: _onPaired }: PairingScreenProps) {
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    // Generate a random 6-character pairing code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPairingCode(code);

    // TODO: Send pairing advertisement via WebRTC
    // TODO: Start heartbeat interval
  }, []);

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">Mobile Worship</h1>
      <p className="text-2xl text-muted-foreground mb-12">Display</p>

      <div className="bg-card rounded-lg p-8 shadow-lg border border-border mb-8">
        <QRCodeSVG value={pairingCode} size={256} level="M" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-xl">Enter this code on your controller</p>
        <p className="text-6xl font-mono tracking-widest font-bold">
          {pairingCode}
        </p>
        <p className="text-muted-foreground mt-4">to pair this display</p>
      </div>

      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Press MENU or BACK for options
        </p>
      </div>
    </div>
  );
}
