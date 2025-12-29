# Android TV Display App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an Android TV app for FireTV devices that serves as a display-only client, receiving content from controllers via WebRTC.

**Architecture:** Single codebase with runtime mode detection. Platform detection via Tauri command routes to controller mode (desktop) or display mode (Android TV). Display mode skips Supabase auth, uses WebRTC for content delivery, and implements D-pad navigable TV menu.

**Tech Stack:** Tauri 2.0 (Android support), React 18, TypeScript, WebRTC, Android TV SDK (LEANBACK)

---

## Phase 1: Platform Detection Infrastructure

### Task 1.1: Add get_platform Tauri command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Add platform command to commands.rs**

Open `src-tauri/src/commands.rs` and add at the end of the file:

```rust
#[tauri::command]
pub async fn get_platform() -> String {
    #[cfg(target_os = "android")]
    return "android".to_string();

    #[cfg(not(target_os = "android"))]
    return "desktop".to_string();
}
```

**Step 2: Register command in main.rs**

Open `src-tauri/src/main.rs`, find the `invoke_handler` section, and add `get_platform` to the handler list.

Find this line:
```rust
.invoke_handler(tauri::generate_handler![
```

Add `get_platform` to the list of commands. The final list should include:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    get_platform,
])
```

Also add the import at the top of the file:
```rust
use crate::commands::get_platform;
```

**Step 3: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors, successful compilation

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add get_platform Tauri command"
```

---

### Task 1.2: Create platform detection module

**Files:**
- Create: `src/platform/index.ts`

**Step 1: Create platform detection module**

Create `src/platform/index.ts` with:

```typescript
import { invoke } from '@tauri-apps/api/core';

export type Platform = 'desktop' | 'android-tv';
export type AppMode = 'controller' | 'display';

let cachedPlatform: Platform | null = null;

/**
 * Detect the current platform using Tauri's platform detection
 */
export async function detectPlatform(): Promise<Platform> {
  if (cachedPlatform) return cachedPlatform;

  try {
    const platform = await invoke<string>('get_platform');
    cachedPlatform = platform === 'android' ? 'android-tv' : 'desktop';
  } catch {
    // Fallback for web/dev mode - assume desktop/controller
    cachedPlatform = 'desktop';
  }

  return cachedPlatform;
}

/**
 * Get the app mode based on platform
 * Desktop = controller (full UI with auth)
 * Android TV = display (minimal UI, no auth)
 */
export function getMode(platform: Platform): AppMode {
  return platform === 'android-tv' ? 'display' : 'controller';
}

/**
 * Convenience function to get app mode directly
 */
export async function getAppMode(): Promise<AppMode> {
  const platform = await detectPlatform();
  return getMode(platform);
}

/**
 * Check if we're running on Android TV
 */
export async function isAndroidTV(): Promise<boolean> {
  const platform = await detectPlatform();
  return platform === 'android-tv';
}

/**
 * Check if we're running in controller mode
 */
export async function isControllerMode(): Promise<boolean> {
  const mode = await getAppMode();
  return mode === 'controller';
}
```

**Step 2: Commit**

```bash
git add src/platform/index.ts
git commit -m "feat: add platform detection module"
```

---

### Task 1.3: Create mode entry points

**Files:**
- Create: `src/modes/controller/index.tsx`
- Create: `src/modes/display/index.tsx`

**Step 1: Create controller mode entry**

Create `src/modes/controller/index.tsx` with:

```typescript
/**
 * Controller mode entry point
 * Used for desktop apps - full UI with auth, routing, etc.
 */

// Export the existing App component as controller mode
// We'll move the existing App logic here
export { App as ControllerApp } from '../../App';
```

**Step 2: Create display mode entry**

Create `src/modes/display/index.tsx` with:

```typescript
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
```

**Step 3: Commit**

```bash
git add src/modes/controller/index.tsx src/modes/display/index.tsx
git commit -m "feat: add controller and display mode entry points"
```

---

### Task 1.4: Update main.tsx with mode routing

**Files:**
- Modify: `src/main.tsx`

**Step 1: Read existing main.tsx**

Run: `cat src/main.tsx`

**Step 2: Update main.tsx to route based on platform**

After reading the file, modify it to use platform detection. The updated file should look like:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getAppMode } from './platform';
import { ControllerApp } from './modes/controller';
import { DisplayApp } from './modes/display';
import './i18n'; // Initialize i18n
import './index.css';

/**
 * Main entry point - routes to controller or display mode
 * based on the detected platform
 */
async function main() {
  const mode = await getAppMode();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {mode === 'controller' ? <ControllerApp /> : <DisplayApp />}
    </StrictMode>
  );
}

main();
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Successful build with no TypeScript errors

**Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "feat: add platform-based routing to main entry point"
```

---

## Phase 2: Display Mode Components

### Task 2.1: Create TVMenu component

**Files:**
- Create: `src/components/display/TVMenu.tsx`

**Step 1: Create TVMenu component**

Create `src/components/display/TVMenu.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TVMenuOption = 'resume' | 'pair' | 'unpair' | 'about' | 'exit';

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
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { key: TVMenuOption; label: string }[] = [
    { key: isPaired ? ('resume' as TVMenuOption) : 'pair', label: isPaired ? 'Resume' : 'Pair' },
    ...(isPaired ? [{ key: 'unpair' as TVMenuOption, label: 'Unpair' }] : []),
    { key: 'about', label: 'About' },
    { key: 'exit', label: 'Exit' },
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        setSelectedIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case 'ArrowDown':
        setSelectedIndex((i) => (i + 1) % options.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectOption(options[selectedIndex].key);
        break;
      case 'Escape':
      case 'Back':
        onClose();
        break;
    }
  };

  const selectOption = (key: TVMenuOption) => {
    switch (key) {
      case 'resume':
        onResume();
        break;
      case 'pair':
        onPair();
        break;
      case 'unpair':
        onUnpair();
        break;
      case 'about':
        onAbout();
        break;
      case 'exit':
        onExit();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/95 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
      onClick={onClose}
      tabIndex={0}
    >
      <div
        className="bg-card rounded-lg p-8 shadow-lg min-w-80 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Menu</h2>
        <div className="space-y-2">
          {options.map((option, index) => (
            <button
              key={option.key}
              onClick={() => selectOption(option.key)}
              className={`w-full text-left px-4 py-3 text-lg rounded-md transition-colors ${
                index === selectedIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {index === selectedIndex && <span className="mr-2">▶</span>}
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground text-center mt-6">
          Use ▲ ▼ to navigate, ENTER to select
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/display/TVMenu.tsx
git commit -m "feat: add TVMenu component with D-pad navigation"
```

---

### Task 2.2: Create PairingScreen component

**Files:**
- Create: `src/components/display/PairingScreen.tsx`

**Step 1: Create PairingScreen component**

Create `src/components/display/PairingScreen.tsx` with:

```typescript
import { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';

interface PairingScreenProps {
  onPaired: () => void;
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    // Generate a random 6-character pairing code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPairingCode(code);

    // TODO: Send pairing advertisement via WebRTC
    // TODO: Start heartbeat interval
  }, []);

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">Mobile Worship</h1>
      <p className="text-2xl text-muted-foreground mb-12">Display</p>

      <div className="bg-card rounded-lg p-8 shadow-lg border border-border mb-8">
        <QRCode value={pairingCode} size={256} level="M" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-xl">Enter this code on your controller</p>
        <p className="text-6xl font-mono tracking-widest font-bold">
          {pairingCode}
        </p>
        <p className="text-muted-foreground mt-4">to pair this display</p>
      </div>

      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Press MENU or BACK for options
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/display/PairingScreen.tsx
git commit -m "feat: add PairingScreen component with QR code"
```

---

### Task 2.3: Create WaitingScreen component

**Files:**
- Create: `src/components/display/WaitingScreen.tsx`

**Step 1: Create WaitingScreen component**

Create `src/components/display/WaitingScreen.tsx` with:

```typescript
interface WaitingScreenProps {
  displayName?: string;
  displayLocation?: string;
}

export function WaitingScreen({
  displayName = 'Mobile Worship Display',
  displayLocation,
}: WaitingScreenProps) {
  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2">{displayName}</h1>
      {displayLocation && (
        <p className="text-2xl text-muted-foreground mb-8">{displayLocation}</p>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-2xl">Waiting for event...</p>
      </div>

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-sm text-muted-foreground">
          Press MENU or BACK for options
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/display/WaitingScreen.tsx
git commit -m "feat: add WaitingScreen component"
```

---

### Task 2.4: Create ActiveDisplay component

**Files:**
- Create: `src/components/display/ActiveDisplay.tsx`

**Step 1: Create ActiveDisplay component**

Create `src/components/display/ActiveDisplay.tsx` with:

```typescript
interface DisplayContent {
  type: 'lyrics' | 'media' | 'blank';
  title?: string;
  lines?: string[];
  mediaUrl?: string;
}

interface ActiveDisplayProps {
  content: DisplayContent;
}

export function ActiveDisplay({ content }: ActiveDisplayProps) {
  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center p-16">
      {content.type === 'blank' && (
        <div className="text-center">
          <p className="text-4xl text-muted-foreground">Blank</p>
        </div>
      )}

      {content.type === 'lyrics' && (
        <div className="text-center max-w-5xl">
          {content.title && (
            <h2 className="text-3xl font-bold mb-8 text-muted-foreground">
              {content.title}
            </h2>
          )}
          <div className="space-y-4">
            {content.lines?.map((line, i) => (
              <p key={i} className="text-5xl font-semibold">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {content.type === 'media' && content.mediaUrl && (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={content.mediaUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-sm text-muted-foreground">
          Press MENU or BACK for options
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/display/ActiveDisplay.tsx
git commit -m "feat: add ActiveDisplay component for lyrics and media"
```

---

### Task 2.5: Update DisplayApp to use new components

**Files:**
- Modify: `src/modes/display/index.tsx`

**Step 1: Update DisplayApp with all components**

Replace the contents of `src/modes/display/index.tsx` with:

```typescript
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
  const [content, setContent] = useState<DisplayContent>({ type: 'blank' });

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

  const handlePaired = () => {
    setDisplayName('Main Display');
    setState('waiting');
  };

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
      {state === 'pairing' && <PairingScreen onPaired={handlePaired} />}

      {state === 'waiting' && (
        <WaitingScreen displayName={displayName} />
      )}

      {state === 'active' && <ActiveDisplay content={content} />}

      {/* TV Menu - not shown during pairing */}
      {state !== 'pairing' && menuOpen && (
        <TVMenu
          isPaired={state !== 'pairing'}
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
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Successful build

**Step 3: Commit**

```bash
git add src/modes/display/index.tsx
git commit -m "feat: integrate display mode components"
```

---

## Phase 3: Tauri Android Setup

### Task 3.1: Initialize Tauri Android

**Step 1: Initialize Android in Tauri**

Run: `pnpm tauri android init`
Expected: Creates `src-tauri/gen/android/` directory with Android project structure

**Step 2: Verify generated files**

Run: `ls -la src-tauri/gen/android/`
Expected: Shows `app/` directory with gradle files

**Step 3: Commit generated files**

```bash
git add src-tauri/gen/android/
git commit -m "feat: initialize Tauri Android project"
```

---

### Task 3.2: Configure AndroidManifest.xml for TV

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Step 1: Read the generated AndroidManifest.xml**

Run: `cat src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Step 2: Update AndroidManifest.xml for Android TV**

Update the file to include TV-specific configuration:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Android TV Features -->
    <uses-feature
        android:name="android.software.leanback"
        android:required="true" />
    <uses-feature
        android:name="android.hardware.touchscreen"
        android:required="false" />

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.MobileWorship">

        <activity
            android:name=".MainActivity"
            android:banner="@drawable/banner"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="landscape">

            <!-- TV Launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

**Step 3: Commit**

```bash
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "feat: configure AndroidManifest for Android TV"
```

---

### Task 3.3: Update tauri.conf.json for Android

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Read current tauri.conf.json**

Run: `cat src-tauri/tauri.conf.json`

**Step 2: Add Android configuration**

Update the tauri.conf.json to include Android-specific settings:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Mobile Worship",
  "version": "0.1.0",
  "identifier": "com.mobileworship.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Mobile Worship",
        "width": 800,
        "height": 600
      }
    ],
    "android": {
      "minSdkVersion": 21
    },
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "minSdkVersion": 21
    }
  }
}
```

**Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: add Android configuration to tauri.conf.json"
```

---

### Task 3.4: Add npm scripts for Android

**Files:**
- Modify: `package.json`

**Step 1: Add Android scripts**

Add these scripts to `package.json` in the `scripts` section:

```json
"tauri:android:init": "tauri android init",
"tauri:android:dev": "tauri android dev",
"tauri:android:build": "tauri android build",
"tauri:android:build:apk": "tauri android build --apk"
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "feat: add Android build scripts to package.json"
```

---

### Task 3.5: Add banner.png for Android TV

**Files:**
- Create: `src-tauri/gen/android/app/src/main/res/drawable/banner.png`

**Step 1: Create Android TV banner**

Android TV requires a banner (320x180px). For now, create a placeholder.

Run: `convert -size 320x180 xc:#4f46e5 -gravity center -pointsize 24 -fill white -annotate +0+0 "MW" src-tauri/gen/android/app/src/main/res/drawable/banner.png`

If ImageMagick is not available, you'll need to create this image manually or use the existing app icon.

**Step 2: Commit**

```bash
git add src-tauri/gen/android/app/src/main/res/drawable/banner.png
git commit -m "feat: add Android TV banner"
```

---

## Phase 4: Build and Test

### Task 4.1: Test desktop build

**Step 1: Build desktop app**

Run: `pnpm build`
Expected: Successful build

**Step 2: Run Tauri desktop dev**

Run: `pnpm tauri:dev`
Expected: App launches in controller mode

**Step 3: Verify platform detection**

In the running app, open browser console (F12) and verify no errors related to platform detection.

**Step 4: Stop dev server**

Press Ctrl+C to stop.

---

### Task 4.2: Build Android APK

**Step 1: Build Android APK**

Run: `pnpm tauri:android:build:apk`
Expected: Gradle build completes successfully

**Step 2: Locate APK**

Run: `ls -la src-tauri/gen/android/app/build/outputs/apk/release/`
Expected: Shows `.apk` file

**Step 3: Note APK location for installation**

The APK will be at: `src-tauri/gen/android/app/build/outputs/apk/release/app-release-arm64-v8a.apk` (or similar)

---

### Task 4.3: Install on FireTV via ADB

**Prerequisites:** FireTV device on same network, ADB debugging enabled

**Step 1: Connect to FireTV**

First, get your FireTV IP from Settings > My Fire TV > Network

Run: `adb connect 192.168.1.xxx:5555` (replace with your FireTV IP)
Expected: `connected to 192.168.1.xxx:5555`

**Step 2: Verify connection**

Run: `adb devices`
Expected: Shows your FireTV device

**Step 3: Install APK**

Run: `adb install -r src-tauri/gen/android/app/build/outputs/apk/release/app-release-arm64-v8a.apk`
Expected: `Success`

**Step 4: Launch app on FireTV**

Go to FireTV home, find "Mobile Worship" app, launch it.

**Step 5: Verify pairing screen**

Expected: Shows QR code and 6-digit pairing code

---

## Phase 5: Translations

### Task 5.1: Add TV menu translations

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add to `src/i18n/locales/en.json`:

```json
{
  "tv": {
    "menu": {
      "resume": "Resume",
      "pair": "Pair Display",
      "unpair": "Unpair Display",
      "about": "About",
      "exit": "Exit"
    },
    "pairing": {
      "title": "Mobile Worship",
      "subtitle": "Display",
      "enterCode": "Enter this code on your controller",
      "toPair": "to pair this display",
      "menuHint": "Press MENU or BACK for options"
    },
    "waiting": {
      "waitingForEvent": "Waiting for event...",
      "menuHint": "Press MENU or BACK for options"
    }
  }
}
```

**Step 2: Add Spanish translations**

Add to `src/i18n/locales/es.json`:

```json
{
  "tv": {
    "menu": {
      "resume": "Continuar",
      "pair": "Emparejar",
      "unpair": "Desemparejar",
      "about": "Acerca de",
      "exit": "Salir"
    },
    "pairing": {
      "title": "Mobile Worship",
      "subtitle": "Pantalla",
      "enterCode": "Ingresa este código en tu controlador",
      "toPair": "para emparejar esta pantalla",
      "menuHint": "Presiona MENÚ o ATRÁS para opciones"
    },
    "waiting": {
      "waitingForEvent": "Esperando evento...",
      "menuHint": "Presiona MENÚ o ATRÁS para opciones"
    }
  }
}
```

**Step 3: Update components to use translations**

Update `TVMenu.tsx`, `PairingScreen.tsx`, and `WaitingScreen.tsx` to use `t()` function instead of hardcoded strings.

**Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json src/components/display/TVMenu.tsx src/components/display/PairingScreen.tsx src/components/display/WaitingScreen.tsx
git commit -m "feat: add TV display translations"
```

---

## Summary

This implementation plan creates an Android TV display app that:

1. **Detects platform at runtime** via Tauri's `get_platform` command
2. **Routes to display mode** on Android TV, controller mode on desktop
3. **Shows pairing screen** with QR code and 6-digit code
4. **Displays TV menu** with D-pad navigation (SELECT/BACK trigger)
5. **Builds APK** for FireTV installation via ADB

**Total tasks:** 20
**Estimated commits:** 20

**Success criteria:**
- ✅ Desktop app still runs in controller mode
- ✅ Android APK builds successfully
- ✅ APK installs on FireTV
- ✅ Display shows pairing screen with QR code
- ✅ TV menu works with FireTV remote (D-pad)
