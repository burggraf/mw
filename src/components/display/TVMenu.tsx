import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface TVMenuProps {
  isPaired: boolean;
  onClose: () => void;
  onResume: () => void;
  onPair: () => void;
  onUnpair: () => void;
  onAbout: () => void;
  onExit: () => void;
}

export function TVMenu({
  isPaired,
  onClose,
  onResume,
  onPair,
  onUnpair,
  onAbout,
  onExit,
}: TVMenuProps) {
  const { t } = useTranslation();

  // Handle ESC key to close menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-foreground rounded-lg p-8 min-w-[400px]">
        <h2 className="text-2xl font-bold mb-6">{t('tv.menu.resume')}</h2>

        <div className="space-y-2">
          <button
            onClick={onResume}
            className="w-full text-left px-4 py-3 rounded hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {t('tv.menu.resume')}
          </button>

          {!isPaired ? (
            <button
              onClick={onPair}
              className="w-full text-left px-4 py-3 rounded hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {t('tv.menu.pair')}
            </button>
          ) : (
            <button
              onClick={onUnpair}
              className="w-full text-left px-4 py-3 rounded hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {t('tv.menu.unpair')}
            </button>
          )}

          <button
            onClick={onAbout}
            className="w-full text-left px-4 py-3 rounded hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {t('tv.menu.about')}
          </button>

          <button
            onClick={onExit}
            className="w-full text-left px-4 py-3 rounded hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {t('tv.menu.exit')}
          </button>
        </div>
      </div>
    </div>
  );
}
