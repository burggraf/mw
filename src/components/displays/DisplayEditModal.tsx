import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { Display, DisplayClass } from '@/types/display';

interface DisplayEditModalProps {
  display: Display | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, name: string, location: string, displayClass: DisplayClass) => Promise<void>;
  onUnregister: (id: string) => Promise<void>;
}

export function DisplayEditModal({ display, open, onOpenChange, onUpdate, onUnregister }: DisplayEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(display?.name || '');
  const [location, setLocation] = useState(display?.location || '');
  const [displayClass, setDisplayClass] = useState<DisplayClass>(display?.displayClass || 'audience');
  const [saving, setSaving] = useState(false);
  const [unregistering, setUnregistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnregisterConfirm, setShowUnregisterConfirm] = useState(false);

  // Sync form when display changes
  useEffect(() => {
    if (display) {
      setName(display.name);
      setLocation(display.location || '');
      setDisplayClass(display.displayClass);
      setError(null);
      setShowUnregisterConfirm(false);
    }
  }, [display?.id, display?.name, display?.location, display?.displayClass]);

  const handleUpdate = async () => {
    if (!display || !name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await onUpdate(display.id, name, location, displayClass);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.edit.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUnregister = async () => {
    if (!display) return;

    setUnregistering(true);
    setError(null);

    try {
      await onUnregister(display.id);
      setShowUnregisterConfirm(false);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.edit.unregisterError'));
    } finally {
      setUnregistering(false);
    }
  };

  if (!display) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('displays.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('displays.edit.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('displays.pairing.nameLabel')}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('displays.pairing.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-location">{t('displays.pairing.locationLabel')}</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('displays.pairing.locationPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-class">{t('displays.pairing.classLabel')}</Label>
            <Select value={displayClass} onValueChange={(v: DisplayClass) => setDisplayClass(v)}>
              <SelectTrigger id="edit-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="audience">{t('displays.class.audience')}</SelectItem>
                <SelectItem value="stage">{t('displays.class.stage')}</SelectItem>
                <SelectItem value="lobby">{t('displays.class.lobby')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t">
            <div className={`w-2 h-2 rounded-full ${display.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {display.isOnline ? t('displays.status.online') : t('displays.status.offline')}
            </span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={() => setShowUnregisterConfirm(true)}
            disabled={unregistering}
            className="mr-auto"
          >
            {unregistering ? t('displays.edit.unregistering') : t('displays.edit.unregister')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleUpdate} disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>

        {showUnregisterConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-4">
            <div className="max-w-sm space-y-4">
              <p className="text-center">{t('displays.edit.unregisterConfirm')}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setShowUnregisterConfirm(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={handleUnregister} disabled={unregistering}>
                  {unregistering ? t('displays.edit.unregistering') : t('displays.edit.confirmUnregister')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
