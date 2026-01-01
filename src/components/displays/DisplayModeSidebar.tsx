import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, MoreHorizontal, Check, Cast } from 'lucide-react';
import type { Display } from '@/types/display';
import { useChurch } from '@/contexts/ChurchContext';
import { createDisplay } from '@/services/displays';
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
import type { DisplayClass, MonitorInfo } from '@/types/display';
import { isTauri, safeInvoke } from '@/lib/tauri';

interface DisplayTarget {
  id: string;
  name: string;
  isDefault: boolean;
  monitor: MonitorInfo;
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

  // Detect available displays from the system
  const [availableDisplays, setAvailableDisplays] = useState<DisplayTarget[]>([]);

  useEffect(() => {
    const fetchMonitors = async () => {
      // This component is Tauri-only - skip in web
      if (!isTauri()) return;

      try {
        const monitors = await safeInvoke<MonitorInfo[]>('get_available_monitors');
        if (!monitors) return;
        const targets: DisplayTarget[] = monitors.map((m) => ({
          id: m.displayId, // Use persistent UUID from EDID
          name: m.isPrimary ? t('displayMode.mainDisplay') : `${t('displayMode.display')} ${m.id + 1}`,
          isDefault: m.isPrimary,
          monitor: m,
        }));
        setAvailableDisplays(targets);
      } catch (error) {
        console.error('Failed to fetch monitors:', error);
        // Fallback to main display only with a mock monitor object
        setAvailableDisplays([{
          id: 'fallback-main-display',
          name: t('displayMode.mainDisplay'),
          isDefault: true,
          monitor: {
            displayId: 'fallback-main-display',
            id: 0,
            name: 'Main Display',
            manufacturer: '',
            model: '',
            serialNumber: '',
            positionX: 0,
            positionY: 0,
            sizeX: 1920,
            sizeY: 1080,
            physicalWidthCm: 0,
            physicalHeightCm: 0,
            scaleFactor: 1.0,
            isPrimary: true,
          },
        }]);
      }
    };

    fetchMonitors();
  }, [t]);

  // Pairing dialog state
  const [pairingDisplayId, setPairingDisplayId] = useState<string | null>(null);
  const [pairingName, setPairingName] = useState('');
  const [pairingLocation, setPairingLocation] = useState('');
  const [pairingClass, setPairingClass] = useState<DisplayClass>('audience');
  const [isPairing, setIsPairing] = useState(false);

  // Track open display windows
  const [openDisplayWindows, setOpenDisplayWindows] = useState<Set<number>>(new Set());

  // Open a display window on a specific monitor
  const handleOpenDisplay = async (monitorId: number, displayId: string, displayName: string) => {
    if (!isTauri()) return;

    try {
      console.log('[DisplayModeSidebar] Opening display window for monitor', monitorId, 'displayId:', displayId);
      await safeInvoke('open_display_window', {
        displayName,
        displayId,
        monitorId,
      });
      setOpenDisplayWindows(prev => new Set(prev).add(monitorId));
      console.log('[DisplayModeSidebar] Display window opened successfully');
    } catch (error) {
      console.error('[DisplayModeSidebar] Failed to open display window:', error);
    }
  };

  // Close a display window
  const handleCloseDisplay = async (monitorId: number) => {
    if (!isTauri()) return;

    try {
      console.log('[DisplayModeSidebar] Closing display window for monitor', monitorId);
      await safeInvoke('close_display_window', { monitorId });
      setOpenDisplayWindows(prev => {
        const next = new Set(prev);
        next.delete(monitorId);
        return next;
      });
    } catch (error) {
      console.error('[DisplayModeSidebar] Failed to close display window:', error);
    }
  };

  // Get registered display for a target (by displayId)
  const getRegisteredDisplay = (targetId: string): Display | undefined => {
    return displays.find(d => d.displayId === targetId);
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
      const newDisplay = await createDisplay(currentChurch.id, {
        displayId: pairingDisplayId, // Per-display UUID from EDID
        deviceId: pairingDisplayId, // Use same ID for local displays
        name: pairingName,
        location: pairingLocation || null,
        displayClass: pairingClass,
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
              const isDisplayOpen = openDisplayWindows.has(target.monitor.id);

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
                    {isDisplayOpen && (
                      <SidebarMenuBadge>
                        <Cast className="size-3" />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                  {isDisplayOpen ? (
                    <SidebarMenuAction asChild showOnHover={false}>
                      <button onClick={() => handleCloseDisplay(target.monitor.id)}>
                        {t('displayMode.close')}
                      </button>
                    </SidebarMenuAction>
                  ) : isPaired ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction asChild showOnHover={false}>
                          <button>
                            <MoreHorizontal className="size-4" />
                          </button>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDisplay(target.monitor.id, target.id, registered?.name || target.name)}>
                          <Cast className="mr-2 h-4 w-4" />
                          {t('displayMode.openDisplay')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => registered && handleUnpair(registered)}>
                          {t('displayMode.unpair')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <SidebarMenuAction asChild showOnHover={false}>
                      <button onClick={() => handleStartPairing(target.id)}>
                        {t('displayMode.pair')}
                      </button>
                    </SidebarMenuAction>
                  )}
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
