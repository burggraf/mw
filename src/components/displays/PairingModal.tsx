import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { DisplayClass } from '@/types/display';

interface PairingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPair: (code: string, name: string, location: string, displayClass: DisplayClass) => Promise<void>;
}

export function PairingModal({ open, onOpenChange, onPair }: PairingModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<'enter-code' | 'register'>('enter-code');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [displayClass, setDisplayClass] = useState<DisplayClass>('audience');
  const [error, setError] = useState<string | null>(null);

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError(t('displays.pairing.invalidCode'));
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const reachable = await invoke<boolean>('send_pairing_ping', {
        pairing_code: code.toUpperCase(),
        controller_id: 'controller', // TODO: get actual controller ID
      });

      if (reachable) {
        setStep('register');
      } else {
        setError(t('displays.pairing.unreachable'));
      }
    } catch (err) {
      setError(t('displays.pairing.error'));
    } finally {
      setVerifying(false);
    }
  };

  const handlePair = async () => {
    if (!name.trim()) {
      setError(t('displays.pairing.nameRequired'));
      return;
    }

    try {
      await onPair(code.toUpperCase(), name, location, displayClass);
      // Reset form
      setCode('');
      setName('');
      setLocation('');
      setDisplayClass('audience');
      setStep('enter-code');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.pairing.error'));
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset when closing
      setCode('');
      setName('');
      setLocation('');
      setDisplayClass('audience');
      setStep('enter-code');
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'enter-code'
              ? t('displays.pairing.enterCodeTitle')
              : t('displays.pairing.registerTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'enter-code'
              ? t('displays.pairing.enterCodeDescription')
              : t('displays.pairing.registerDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 'enter-code' ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pairing-code">{t('displays.pairing.codeLabel')}</Label>
              <Input
                id="pairing-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="text-center text-2xl tracking-widest"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('displays.pairing.nameLabel')}</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('displays.pairing.namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{t('displays.pairing.locationLabel')}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('displays.pairing.locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">{t('displays.pairing.classLabel')}</Label>
              <Select value={displayClass} onValueChange={(v: DisplayClass) => setDisplayClass(v)}>
                <SelectTrigger id="class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">{t('displays.class.audience')}</SelectItem>
                  <SelectItem value="stage">{t('displays.class.stage')}</SelectItem>
                  <SelectItem value="lobby">{t('displays.class.lobby')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === 'enter-code' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleVerifyCode} disabled={verifying || code.length !== 6}>
                {verifying ? t('displays.pairing.verifying') : t('displays.pairing.verify')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('enter-code')}>
                {t('common.back')}
              </Button>
              <Button onClick={handlePair}>
                {t('displays.pairing.pair')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
