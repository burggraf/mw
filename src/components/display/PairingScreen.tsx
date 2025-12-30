import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

export function PairingScreen() {
  const { t } = useTranslation();
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    // Generate a random 6-character pairing code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPairingCode(code);

    // TODO: Implement NATS-based pairing
    // 1. Spawn NATS server
    // 2. Advertise via mDNS with pairing code in TXT record
    // 3. Wait for controller to connect and verify pairing
    console.log('[PairingScreen] NATS pairing TODO - code:', code);
  }, []);

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

      {/* TODO: Remove when NATS pairing is implemented */}
      <div className="mt-8 px-4 py-2 bg-yellow-500/20 text-yellow-200 rounded-lg text-sm">
        NATS pairing coming soon - pairing code displayed but not yet functional
      </div>
    </div>
  );
}
