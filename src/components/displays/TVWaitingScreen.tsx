import type { Display } from '@/types/display';

interface TVWaitingScreenProps {
  display: Display;
}

export function TVWaitingScreen({ display }: TVWaitingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold mb-2">{display.name}</h1>
      {display.location && (
        <p className="text-xl text-muted-foreground mb-8">{display.location}</p>
      )}

      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-2xl">Waiting for event</p>
      </div>
    </div>
  );
}
