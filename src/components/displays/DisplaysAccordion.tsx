import { useEffect, useState } from 'react';
import { useChurch } from '@/contexts/ChurchContext';
import { getDisplaysForChurch, createDisplay, updateDisplay, deleteDisplay } from '@/services/displays';
import type { Display, DisplayClass } from '@/types/display';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PairingModal } from './PairingModal';
import { DisplayEditModal } from './DisplayEditModal';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

interface DisplaysAccordionProps {
  onDisplayClick?: (display: Display) => void;
}

export function DisplaysAccordion({ onDisplayClick }: DisplaysAccordionProps) {
  const { t } = useTranslation();
  const { currentChurch } = useChurch();
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Fetch displays
  useEffect(() => {
    if (!currentChurch) {
      setDisplays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    getDisplaysForChurch(currentChurch.id)
      .then(setDisplays)
      .finally(() => setLoading(false));

    // Set up polling for offline detection
    const interval = setInterval(async () => {
      const updated = await getDisplaysForChurch(currentChurch.id);
      setDisplays(updated);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [currentChurch]);

  const handlePair = async (code: string, name: string, location: string, displayClass: DisplayClass) => {
    if (!currentChurch) throw new Error('No church selected');
    await createDisplay(currentChurch.id, {
      pairingCode: code,
      name,
      location,
      displayClass,
      deviceId: null, // Will be set by the display during pairing
    });
  };

  const handleUpdate = async (id: string, name: string, location: string, displayClass: DisplayClass) => {
    const updated = await updateDisplay(id, { name, location, displayClass });
    setDisplays(prev => prev.map(d => d.id === id ? updated : d));
  };

  const handleUnregister = async (id: string) => {
    await deleteDisplay(id);
    setDisplays(prev => prev.filter(d => d.id !== id));
  };

  const handleDisplayClick = (display: Display) => {
    setEditingDisplay(display);
    setEditModalOpen(true);
    onDisplayClick?.(display);
  };

  return (
    <>
      <SidebarGroup>
        <div className="flex items-center justify-between pr-2">
          <SidebarGroupLabel>{t('displays.title')}</SidebarGroupLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setPairingModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            {loading ? (
              <SidebarMenuItem>
                <p className="text-sm text-muted-foreground px-2">{t('common.loading')}</p>
              </SidebarMenuItem>
            ) : displays.length === 0 ? (
              <SidebarMenuItem>
                <p className="text-sm text-muted-foreground px-2">{t('displays.empty')}</p>
              </SidebarMenuItem>
            ) : (
              displays.map(display => (
                <SidebarMenuItem key={display.id}>
                  <SidebarMenuButton onClick={() => handleDisplayClick(display)}>
                    <span className="flex-1 text-left truncate">{display.name}</span>
                    <div className={`w-2 h-2 rounded-full ${display.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <PairingModal
        open={pairingModalOpen}
        onOpenChange={setPairingModalOpen}
        onPair={handlePair}
      />

      <DisplayEditModal
        display={editingDisplay}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onUpdate={handleUpdate}
        onUnregister={handleUnregister}
      />
    </>
  );
}
