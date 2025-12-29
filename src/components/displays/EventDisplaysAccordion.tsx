import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Display } from '@/types/display';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ErrorBoundary } from '@/components/ui/error-boundary';

interface EventDisplaysAccordionProps {
  /** Available displays for the church */
  displays: Display[];
  /** Currently selected display IDs for this event */
  selectedDisplayIds: string[];
  /** Callback when selection changes */
  onSelectionChange: (displayIds: string[]) => void;
  /** Optional label override */
  label?: string;
}

export function EventDisplaysAccordion({
  displays,
  selectedDisplayIds,
  onSelectionChange,
  label,
}: EventDisplaysAccordionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleToggle = (displayId: string) => {
    const newSelection = selectedDisplayIds.includes(displayId)
      ? selectedDisplayIds.filter(id => id !== displayId)
      : [...selectedDisplayIds, displayId];
    onSelectionChange(newSelection);
  };

  const getClassBadgeVariant = (displayClass: Display['displayClass']): 'default' | 'secondary' | 'outline' => {
    switch (displayClass) {
      case 'audience':
        return 'default';
      case 'stage':
        return 'secondary';
      case 'lobby':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getClassLabel = (displayClass: Display['displayClass']): string => {
    switch (displayClass) {
      case 'audience':
        return t('displays.class.audience', 'Audience');
      case 'stage':
        return t('displays.class.stage', 'Stage');
      case 'lobby':
        return t('displays.class.lobby', 'Lobby');
    }
  };

  return (
    <ErrorBoundary errorMessage="Failed to load displays">
      <div className="space-y-3">
        <Accordion type="single" value={open ? 'displays' : undefined} onValueChange={(v) => setOpen(v === 'displays')}>
          <AccordionItem value="displays" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              {label || t('displays.forEvent', 'Displays for this event')}
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              {displays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('displays.empty', 'No displays registered. Click + to add one.')}
                </p>
              ) : (
                <div className="space-y-1">
                  {displays.map((display) => {
                    const isSelected = selectedDisplayIds.includes(display.id);

                    return (
                      <div
                        key={display.id}
                        className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                          isSelected
                            ? 'bg-primary/5 border-primary/20'
                            : 'bg-card hover:bg-accent'
                        }`}
                      >
                        <Checkbox
                          id={`display-${display.id}`}
                          checked={isSelected}
                          onCheckedChange={() => handleToggle(display.id)}
                          className="mt-0.5"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <label
                              htmlFor={`display-${display.id}`}
                              className="text-sm font-medium truncate cursor-pointer"
                            >
                              {display.name}
                            </label>
                            <Badge variant={getClassBadgeVariant(display.displayClass)} className="text-xs">
                              {getClassLabel(display.displayClass)}
                            </Badge>
                          </div>
                          {display.location && (
                            <p className="text-xs text-muted-foreground truncate">
                              {display.location}
                            </p>
                          )}
                        </div>

                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${
                          display.isOnline ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Selection summary */}
        {selectedDisplayIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('displays.selectedCount', { count: selectedDisplayIds.length })}
          </p>
        )}
      </div>
    </ErrorBoundary>
  );
}
