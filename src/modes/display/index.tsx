/**
 * Display mode entry point
 * Used for Android TV - minimal UI, no auth, WebRTC only
 */

import { useState, useEffect } from 'react';
import { PairingScreen } from '@/components/display/PairingScreen';
import { WaitingScreen } from '@/components/display/WaitingScreen';
import { ActiveDisplay } from '@/components/display/ActiveDisplay';
import { TVMenu } from '@/components/display/TVMenu';

type DisplayState = 'pairing' | 'waiting' | 'active';

interface DisplayContent {
  type: 'lyrics' | 'media' | 'blank';
  title?: string;
  lines?: string[];
  mediaUrl?: string;
}

export function DisplayApp() {
  const [state, setState] = useState<DisplayState>('pairing');
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>();
  const [content, _setContent] = useState<DisplayContent>({ type: 'blank' });

  // Handle D-pad menu button (SELECT/BACK)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Back' || e.key === 'Enter') {
        // Only toggle menu if not already in pairing mode
        if (state !== 'pairing') {
          setMenuOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  const handleResume = () => setMenuOpen(false);
  const handlePair = () => setState('pairing');
  const handleUnpair = () => {
    setDisplayName(undefined);
    setState('pairing');
  };
  const handleAbout = () => alert('Mobile Worship Display v0.1.0');
  const handleExit = () => {
    if (confirm('Exit Mobile Worship?')) {
      window.close();
    }
  };

  return (
    <div className="h-screen w-screen bg-background">
      {state === 'pairing' && <PairingScreen />}

      {state === 'waiting' && (
        <WaitingScreen displayName={displayName} />
      )}

      {state === 'active' && <ActiveDisplay content={content} />}

      {/* TV Menu - not shown during pairing */}
      {state !== 'pairing' && menuOpen && (
        <TVMenu
          isPaired={true}
          onClose={() => setMenuOpen(false)}
          onResume={handleResume}
          onPair={handlePair}
          onUnpair={handleUnpair}
          onAbout={handleAbout}
          onExit={handleExit}
        />
      )}
    </div>
  );
}
