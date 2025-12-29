/**
 * Display mode entry point
 * Used for Android TV - minimal UI, no auth, WebRTC only
 */

import { useState } from 'react';
import { TVMenu } from '@/components/display/TVMenu';

type DisplayState = 'pairing' | 'waiting' | 'active';

export function DisplayApp() {
  const [state, setState] = useState<DisplayState>('pairing');
  const [menuOpen, setMenuOpen] = useState(false);

  // TODO: Implement WebRTC connection
  // TODO: Implement pairing flow
  // TODO: Implement content display

  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center">
      <h1 className="text-4xl">Display Mode</h1>
      <p className="text-xl mt-4">State: {state}</p>

      {/* TV Menu - triggered by SELECT/BACK button */}
      {menuOpen && (
        <TVMenu
          isPaired={false}
          onClose={() => setMenuOpen(false)}
          onResume={() => setMenuOpen(false)}
          onPair={() => setState('pairing')}
          onUnpair={() => setState('pairing')}
          onAbout={() => alert('Mobile Worship Display v0.1.0')}
          onExit={() => window.close()}
        />
      )}
    </div>
  );
}
