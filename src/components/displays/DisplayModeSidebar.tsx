import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, MoreHorizontal, Check } from 'lucide-react';
import type { Display } from '@/types/display';
import { useChurch } from '@/contexts/ChurchContext';
import {
  generatePairingCode,
  createDisplay,
} from '@/services/displays';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DisplayClass } from '@/types/display';

interface DisplayTarget {
  id: string;
  name: string;
  isDefault: boolean;
  // In a real implementation, this would detect actual screens
  // For now, we use placeholder values
}

interface DisplayModeSidebarProps {
  /** Registered displays for the current church */
  displays: Display[];
  /** Callback when a display is registered */
  onDisplayRegistered?: (display: Display) => void;
  /** Callback when a display is unregistered */
  onDisplayUnregistered?: (displayId: string) => void;
}

export function DisplayModeSidebar({
  displays,
  onDisplayRegistered,
  onDisplayUnregistered,
}: DisplayModeSidebarProps) {
  const { t } = useTranslation();
  const { currentChurch } = useChurch();

  // Detect available displays (placeholder - real implementation would use Screen API)
  const [availableDisplays] = useState<DisplayTarget[]>([
    { id: 'main', name: 'Main Display', isDefault: true },
    // { id: 'secondary', name: 'Secondary Display', isDefault: false },
  ]);

  // Pairing dialog state
  const [pairingDisplayId, setPairingDisplayId] = useState<string | null>(null);
  const [pairingName, setPairingName] = useState('');
  const [pairingLocation, setPairingLocation] = useState('');
  const [pairingClass, setPairingClass] = useState<DisplayClass>('audience');
  const [isPairing, setIsPairing] = useState(false);

  // Get registered display for a target
  const getRegisteredDisplay = (targetId: string): Display | undefined => {
    return displays.find(d => d.deviceId === targetId);
  };

  // Handle pairing a display
  const handleStartPairing = (targetId: string) => {
    const target = availableDisplays.find(d => d.id === targetId);
    if (!target) return;

    setPairingDisplayId(targetId);
    setPairingName(target.name);
    setPairingLocation('');
    setPairingClass('audience');
  };

  const handleConfirmPair = async () => {
    if (!currentChurch || !pairingDisplayId) return;

    setIsPairing(true);
    try {
      const pairingCode = generatePairingCode();

      const newDisplay = await createDisplay(currentChurch.id, {
        pairingCode,
        name: pairingName,
        location: pairingLocation || null,
        displayClass: pairingClass,
        deviceId: pairingDisplayId,
      });

      onDisplayRegistered?.(newDisplay);
      setPairingDisplayId(null);
    } catch (error) {
      console.error('Failed to pair display:', error);
    } finally {
      setIsPairing(false);
    }
  };

  const handleUnpair = async (display: Display) => {
    // TODO: Implement unpair functionality
    onDisplayUnregistered?.(display.id);
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t('displayMode.title')}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {availableDisplays.map((target) => {
              const registered = getRegisteredDisplay(target.id);
              const isPaired = !!registered;

              return (
                <SidebarMenuItem key={target.id}>
                  <SidebarMenuButton>
                    <Monitor className="size-4" />
                    <span>{target.name}</span>
                    {isPaired && (
                      <SidebarMenuBadge>
                        <Check className="size-3" />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                  <SidebarMenuAction>
                    {isPaired ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => registered && handleUnpair(registered)}>
                            {t('displayMode.unpair')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartPairing(target.id)}
                      >
                        {t('displayMode.pair')}
                      </Button>
                    )}
                  </SidebarMenuAction>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Pairing Dialog */}
      <Dialog
        open={pairingDisplayId !== null}
        onOpenChange={(open) => !open && setPairingDisplayId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('displays.pairing.registerTitle')}</DialogTitle>
            <DialogDescription>
              {t('displays.pairing.registerDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pairing-name">
                {t('displays.pairing.nameLabel')}
              </Label>
              <Input
                id="pairing-name"
                value={pairingName}
                onChange={(e) => setPairingName(e.target.value)}
                placeholder={t('displays.pairing.namePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pairing-location">
                {t('displays.pairing.locationLabel')}
              </Label>
              <Input
                id="pairing-location"
                value={pairingLocation}
                onChange={(e) => setPairingLocation(e.target.value)}
                placeholder={t('displays.pairing.locationPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pairing-class">
                {t('displays.pairing.classLabel')}
              </Label>
              <Select
                value={pairingClass}
                onValueChange={(value) => setPairingClass(value as DisplayClass)}
              >
                <SelectTrigger id="pairing-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">
                    {t('displays.class.audience')}
                  </SelectItem>
                  <SelectItem value="stage">
                    {t('displays.class.stage')}
                  </SelectItem>
                  <SelectItem value="lobby">
                    {t('displays.class.lobby')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPairingDisplayId(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConfirmPair}
              disabled={!pairingName || isPairing}
            >
              {isPairing ? t('displays.pairing.pair') + '...' : t('displays.pairing.pair')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
