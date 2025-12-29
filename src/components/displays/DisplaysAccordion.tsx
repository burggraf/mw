import { useEffect, useState } from 'react';
import { useChurch } from '@/contexts/ChurchContext';
import { getDisplaysForChurch, createDisplay, updateDisplay, deleteDisplay } from '@/services/displays';
import type { Display, DisplayClass } from '@/types/display';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PairingModal } from './PairingModal';
import { DisplayEditModal } from './DisplayEditModal';

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
    return createDisplay(currentChurch.id, {
      pairingCode: code,
      name,
      location,
      displayClass,
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
      <div className="flex items-center justify-between pr-2">
        <Accordion type="single" className="flex-1">
          <AccordionItem value="displays" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              {t('displays.title')}
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              {loading ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : displays.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('displays.empty')}</p>
              ) : (
                <div className="space-y-1">
                  {displays.map(display => (
                    <button
                      key={display.id}
                      onClick={() => handleDisplayClick(display)}
                      className="w-full text-left p-2 rounded-md hover:bg-accent flex items-center justify-between group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{display.name}</p>
                        {display.location && (
                          <p className="text-xs text-muted-foreground truncate">{display.location}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className={`w-2 h-2 rounded-full ${display.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {t(`displays.class.${display.displayClass}`)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setPairingModalOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

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
