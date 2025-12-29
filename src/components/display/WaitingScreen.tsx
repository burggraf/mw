import { useTranslation } from 'react-i18next';

interface WaitingScreenProps {
  displayName?: string;
  displayLocation?: string;
}

export function WaitingScreen({
  displayName = 'Mobile Worship Display',
  displayLocation,
}: WaitingScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
      {displayLocation && (
        <p className="text-2xl text-muted-foreground mb-8">{displayLocation}</p>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-2xl">{t('tv.waiting.waitingForEvent')}</p>
      </div>

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-sm text-muted-foreground">
          {t('tv.waiting.menuHint')}
        </p>
      </div>
    </div>
  );
}
