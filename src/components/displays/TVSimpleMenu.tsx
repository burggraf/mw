import { useEffect, useState } from 'react';
import type { Display } from '@/types/display';
import { useTranslation } from 'react-i18next';

export interface TVSimpleMenuProps {
  /** The display if paired, null if unpaired */
  display: Display | null;
  /** Called when user selects "Pair" or "Resume" */
  onPairOrResume: () => void;
  /** Called when user selects "Unpair" */
  onUnpair: () => void;
  /** Called when user selects "About" */
  onAbout: () => void;
  /** Called when user selects "Exit" */
  onExit: () => void;
  /** Whether to show the menu (toggled by back button or center click) */
  isVisible: boolean;
  /** Called when user wants to hide the menu */
  onHide: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  action: () => void;
}

export function TVSimpleMenu({
  display,
  onPairOrResume,
  onUnpair,
  onAbout,
  onExit,
  isVisible,
  onHide,
}: TVSimpleMenuProps) {
  const { t } = useTranslation();
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Build menu items based on paired state
  const menuItems: MenuItem[] = [
    {
      key: 'pair-or-resume',
      label: display ? t('tv.menu.resume') : t('tv.menu.pair'),
      action: () => {
        onPairOrResume();
        onHide();
      },
    },
    {
      key: 'unpair',
      label: t('tv.menu.unpair'),
      action: () => {
        onUnpair();
        onHide();
      },
    },
    {
      key: 'about',
      label: t('tv.menu.about'),
      action: () => {
        onAbout();
        onHide();
      },
    },
    {
      key: 'exit',
      label: t('tv.menu.exit'),
      action: onExit,
    },
  ];

  // Handle D-pad navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          menuItems[focusedIndex].action();
          break;
        case 'Escape':
        case 'Backspace':
          event.preventDefault();
          onHide();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, focusedIndex, menuItems]);

  // Reset focus when menu opens
  useEffect(() => {
    if (isVisible) {
      setFocusedIndex(0);
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-8 min-w-[400px] shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          {display?.name || t('tv.menu.title')}
        </h2>

        <nav className="space-y-2">
          {menuItems.map((item, index) => (
            <button
              key={item.key}
              onClick={() => item.action()}
              className={`w-full text-left px-6 py-4 rounded-lg text-lg font-medium transition-all ${
                index === focusedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <span className="flex items-center gap-3">
                {index === focusedIndex && <span className="text-xl">▶</span>}
                <span className={index === focusedIndex ? '' : 'ml-8'}>{item.label}</span>
              </span>
            </button>
          ))}
        </nav>

        <p className="text-sm text-muted-foreground text-center mt-6">
          {t('tv.menu.hint')}
        </p>
      </div>
    </div>
  );
}
