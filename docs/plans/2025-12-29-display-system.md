# Display System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a church-scoped display registration and pairing system with 6-digit codes, persistent database tracking, and platform-specific display modes (TV vs mobile/desktop).

**Architecture:**
- Database layer: New `displays` table with RLS policies for church-scoped registration
- Signaling layer: Extended WebRTC messages for pairing verification and heartbeats
- UI layer: Controller sidebar with displays accordion, TV simple menu, mobile/desktop display mode
- Status tracking: 5-second heartbeats from displays, 30-second timeout for offline detection

**Tech Stack:**
- Supabase (PostgreSQL, RLS)
- Tauri 2.0 (Rust signaling server)
- React 18 + TypeScript
- Shadcn UI components
- QR code generation library

---

## Phase 1: Foundation

### Task 1.1: Create displays table migration

**Files:**
- Create: `supabase/migrations/20251229_create_displays_table.sql`

**Step 1: Write the migration**

Create the migration file with:

```sql
-- Create displays table for church-scoped display registration
CREATE TABLE displays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

  -- Registration info
  pairing_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  display_class TEXT NOT NULL DEFAULT 'audience' CHECK (display_class IN ('audience', 'stage', 'lobby')),

  -- Device identification
  device_id TEXT,

  -- Status tracking
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE displays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view displays for their church"
  ON displays FOR SELECT
  USING (church_id IN (SELECT church_id FROM user_churches WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert displays for their church"
  ON displays FOR INSERT
  WITH CHECK (church_id IN (SELECT church_id FROM user_churches WHERE user_id = auth.uid()));

CREATE POLICY "Users can update displays for their church"
  ON displays FOR UPDATE
  USING (church_id IN (SELECT church_id FROM user_churches WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete displays for their church"
  ON displays FOR DELETE
  USING (church_id IN (SELECT church_id FROM user_churches WHERE user_id = auth.uid()));

-- Indexes
CREATE INDEX idx_displays_pairing_code ON displays(pairing_code);
CREATE INDEX idx_displays_church_id ON displays(church_id);
CREATE INDEX idx_displays_last_seen ON displays(last_seen_at);
```

**Step 2: Push migration to database**

Run: `supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/20251229_create_displays_table.sql
git commit -m "feat: add displays table with RLS policies"
```

### Task 1.2: Create Display types

**Files:**
- Create: `src/types/display.ts`

**Step 1: Write display types**

```typescript
export type DisplayClass = 'audience' | 'stage' | 'lobby';

export interface Display {
  id: string;
  church_id: string;
  pairing_code: string;
  name: string;
  location: string | null;
  display_class: DisplayClass;
  device_id: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisplayCreateInput {
  pairing_code: string;
  name: string;
  location?: string;
  display_class: DisplayClass;
  device_id?: string;
}

export interface DisplayUpdateInput {
  name?: string;
  location?: string;
  display_class?: DisplayClass;
}

export interface DisplayHeartbeatInput {
  pairing_code: string;
  device_id?: string;
}
```

**Step 2: Commit**

```bash
git add src/types/display.ts
git commit -m "feat: add display TypeScript types"
```

### Task 1.3: Create DisplayService

**Files:**
- Create: `src/services/displays.ts`

**Step 1: Write DisplayService**

```typescript
import { supabase } from '@/lib/supabase';
import type { Display, DisplayCreateInput, DisplayUpdateInput, DisplayHeartbeatInput } from '@/types/display';

export class DisplayService {
  /**
   * Get all displays for the current church
   */
  static async getForCurrentChurch(churchId: string): Promise<Display[]> {
    const { data, error } = await supabase
      .from('displays')
      .select('*')
      .eq('church_id', churchId)
      .order('name');

    if (error) throw error;
    return data;
  }

  /**
   * Get a display by pairing code
   */
  static async getByPairingCode(pairingCode: string): Promise<Display | null> {
    const { data, error } = await supabase
      .from('displays')
      .select('*')
      .eq('pairing_code', pairingCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data;
  }

  /**
   * Get a display by ID
   */
  static async getById(id: string): Promise<Display | null> {
    const { data, error } = await supabase
      .from('displays')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * Create a new display
   */
  static async create(churchId: string, input: DisplayCreateInput): Promise<Display> {
    const { data, error } = await supabase
      .from('displays')
      .insert({
        church_id: churchId,
        pairing_code: input.pairing_code,
        name: input.name,
        location: input.location || null,
        display_class: input.display_class,
        device_id: input.device_id || null,
        is_online: true,
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a display
   */
  static async update(id: string, input: DisplayUpdateInput): Promise<Display> {
    const { data, error } = await supabase
      .from('displays')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a display
   */
  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('displays')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Update heartbeat (marks display as online)
   */
  static async updateHeartbeat(input: DisplayHeartbeatInput): Promise<void> {
    const { error } = await supabase
      .from('displays')
      .update({
        is_online: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq('pairing_code', input.pairing_code);

    if (error) throw error;
  }

  /**
   * Mark stale displays as offline (call every 30 seconds)
   */
  static async markStaleDisplaysOffline(churchId: string): Promise<void> {
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();

    const { error } = await supabase
      .from('displays')
      .update({
        is_online: false,
      })
      .eq('church_id', churchId)
      .lt('last_seen_at', thirtySecondsAgo);

    if (error) throw error;
  }

  /**
   * Generate a random 6-character pairing code
   */
  static generatePairingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
```

**Step 2: Commit**

```bash
git add src/services/displays.ts
git commit -m "feat: add DisplayService for CRUD operations"
```

### Task 1.4: Extend signaling messages for pairing

**Files:**
- Modify: `src-tauri/src/webrtc/signaling.rs`
- Modify: `src-tauri/src/commands.rs` (if needed for Tauri commands)

**Step 1: Read existing signaling message types**

First, read the current signaling message enum to understand the structure.

Run: `cat src-tauri/src/webrtc/signaling.rs | grep -A 50 "pub enum SignalingMessage"`

**Step 2: Add pairing message variants**

Add to the `SignalingMessage` enum in `src-tauri/src/webrtc/signaling.rs`:

```rust
// Add to SignalingMessage enum
PairingAdvertisement {
    pairing_code: String,
    device_id: String,
},
PairingPing {
    pairing_code: String,
    controller_id: String,
},
PairingPong {
    pairing_code: String,
    device_name: Option<String>,
},
PairingConfirm {
    pairing_code: String,
    display_name: String,
    location: Option<String>,
    display_class: String,
},
DisplayHeartbeat {
    pairing_code: String,
},
```

**Step 3: Update message serialization**

Ensure the new variants are included in the serde serialization.

**Step 4: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 5: Commit**

```bash
git add src-tauri/src/webrtc/signaling.rs
git commit -m "feat: add pairing message types to signaling"
```

### Task 1.5: Add Tauri commands for pairing

**Files:**
- Modify: `src-tauri/src/commands.rs`

**Step 1: Add pairing commands**

Add these Tauri commands to handle pairing from the frontend:

```rust
#[tauri::command]
pub async fn generate_pairing_code() -> Result<String, String> {
    use crate::services::display::DisplayService;
    DisplayService::generate_pairing_code()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_pairing_advertisement(pairing_code: String, device_id: String) -> Result<(), String> {
    // Send through signaling server to all connected controllers
    // Implementation depends on your signaling server structure
    Ok(())
}

#[tauri::command]
pub async fn send_pairing_ping(pairing_code: String, controller_id: String) -> Result<bool, String> {
    // Send ping and wait for pong response
    // Returns true if display is reachable
    Ok(true)
}

#[tauri::command]
pub async fn send_display_heartbeat(pairing_code: String) -> Result<(), String> {
    // Send heartbeat through signaling server
    Ok(())
}
```

**Step 2: Register commands in main.rs**

Make sure the new commands are registered in `src-tauri/src/main.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    generate_pairing_code,
    send_pairing_advertisement,
    send_pairing_ping,
    send_display_heartbeat,
])
```

**Step 3: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: No errors

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add Tauri commands for pairing"
```

---

## Phase 2: Controller UI

### Task 2.1: Create PairingModal component

**Files:**
- Create: `src/components/displays/PairingModal.tsx`

**Step 1: Create the pairing modal**

```typescript
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { DisplayClass } from '@/types/display';

interface PairingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPair: (code: string, name: string, location: string, displayClass: DisplayClass) => Promise<void>;
}

export function PairingModal({ open, onOpenChange, onPair }: PairingModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<'enter-code' | 'register'>('enter-code');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [displayClass, setDisplayClass] = useState<DisplayClass>('audience');
  const [error, setError] = useState<string | null>(null);

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError(t('displays.pairing.invalidCode'));
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const reachable = await invoke<boolean>('send_pairing_ping', {
        pairingCode: code.toUpperCase(),
        controllerId: 'controller', // TODO: get actual controller ID
      });

      if (reachable) {
        setStep('register');
      } else {
        setError(t('displays.pairing.unreachable'));
      }
    } catch (err) {
      setError(t('displays.pairing.error'));
    } finally {
      setVerifying(false);
    }
  };

  const handlePair = async () => {
    if (!name.trim()) {
      setError(t('displays.pairing.nameRequired'));
      return;
    }

    try {
      await onPair(code.toUpperCase(), name, location, displayClass);
      // Reset form
      setCode('');
      setName('');
      setLocation('');
      setDisplayClass('audience');
      setStep('enter-code');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.pairing.error'));
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset when closing
      setCode('');
      setName('');
      setLocation('');
      setDisplayClass('audience');
      setStep('enter-code');
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'enter-code'
              ? t('displays.pairing.enterCodeTitle')
              : t('displays.pairing.registerTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'enter-code'
              ? t('displays.pairing.enterCodeDescription')
              : t('displays.pairing.registerDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 'enter-code' ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pairing-code">{t('displays.pairing.codeLabel')}</Label>
              <Input
                id="pairing-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="text-center text-2 tracking-widest"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">{t('displays.pairing.nameLabel')}</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('displays.pairing.namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{t('displays.pairing.locationLabel')}</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('displays.pairing.locationPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">{t('displays.pairing.classLabel')}</Label>
              <Select value={displayClass} onValueChange={(v: DisplayClass) => setDisplayClass(v)}>
                <SelectTrigger id="class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">{t('displays.class.audience')}</SelectItem>
                  <SelectItem value="stage">{t('displays.class.stage')}</SelectItem>
                  <SelectItem value="lobby">{t('displays.class.lobby')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === 'enter-code' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleVerifyCode} disabled={verifying || code.length !== 6}>
                {verifying ? t('displays.pairing.verifying') : t('displays.pairing.verify')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('enter-code')}>
                {t('common.back')}
              </Button>
              <Button onClick={handlePair}>
                {t('displays.pairing.pair')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/PairingModal.tsx
git commit -m "feat: add PairingModal component"
```

### Task 2.2: Create DisplayEditModal component

**Files:**
- Create: `src/components/displays/DisplayEditModal.tsx`

**Step 1: Create the edit modal**

```typescript
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import type { Display, DisplayClass } from '@/types/display';

interface DisplayEditModalProps {
  display: Display | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, name: string, location: string, displayClass: DisplayClass) => Promise<void>;
  onUnregister: (id: string) => Promise<void>;
}

export function DisplayEditModal({ display, open, onOpenChange, onUpdate, onUnregister }: DisplayEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(display?.name || '');
  const [location, setLocation] = useState(display?.location || '');
  const [displayClass, setDisplayClass] = useState<DisplayClass>(display?.display_class || 'audience');
  const [saving, setSaving] = useState(false);
  const [unregistering, setUnregistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnregisterConfirm, setShowUnregisterConfirm] = useState(false);

  // Update form when display changes
  if (display && name !== display.name) {
    setName(display.name);
    setLocation(display.location || '');
    setDisplayClass(display.display_class);
  }

  const handleUpdate = async () => {
    if (!display || !name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await onUpdate(display.id, name, location, displayClass);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.edit.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUnregister = async () => {
    if (!display) return;

    setUnregistering(true);
    setError(null);

    try {
      await onUnregister(display.id);
      setShowUnregisterConfirm(false);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('displays.edit.unregisterError'));
    } finally {
      setUnregistering(false);
    }
  };

  if (!display) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('displays.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('displays.edit.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('displays.pairing.nameLabel')}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('displays.pairing.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-location">{t('displays.pairing.locationLabel')}</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('displays.pairing.locationPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-class">{t('displays.pairing.classLabel')}</Label>
            <Select value={displayClass} onValueChange={(v: DisplayClass) => setDisplayClass(v)}>
              <SelectTrigger id="edit-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="audience">{t('displays.class.audience')}</SelectItem>
                <SelectItem value="stage">{t('displays.class.stage')}</SelectItem>
                <SelectItem value="lobby">{t('displays.class.lobby')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t">
            <div className={`w-2 h-2 rounded-full ${display.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {display.is_online ? t('displays.status.online') : t('displays.status.offline')}
            </span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={() => setShowUnregisterConfirm(true)}
            disabled={unregistering}
            className="mr-auto"
          >
            {unregistering ? t('displays.edit.unregistering') : t('displays.edit.unregister')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleUpdate} disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>

        {showUnregisterConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-4">
            <div className="max-w-sm space-y-4">
              <p className="text-center">{t('displays.edit.unregisterConfirm')}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setShowUnregisterConfirm(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="destructive" onClick={handleUnregister} disabled={unregistering}>
                  {unregistering ? t('displays.edit.unregistering') : t('displays.edit.confirmUnregister')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/DisplayEditModal.tsx
git commit -m "feat: add DisplayEditModal component"
```

### Task 2.3: Create DisplaysAccordion component

**Files:**
- Create: `src/components/displays/DisplaysAccordion.tsx`

**Step 1: Create the accordion component**

```typescript
import { useEffect, useState } from 'react';
import { useChurch } from '@/contexts/ChurchContext';
import { DisplayService } from '@/services/displays';
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
    DisplayService.getForCurrentChurch(currentChurch.id)
      .then(setDisplays)
      .finally(() => setLoading(false));

    // Set up polling for offline detection
    const interval = setInterval(async () => {
      await DisplayService.markStaleDisplaysOffline(currentChurch.id);
      const updated = await DisplayService.getForCurrentChurch(currentChurch.id);
      setDisplays(updated);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [currentChurch]);

  const handlePair = async (code: string, name: string, location: string, displayClass: DisplayClass) => {
    if (!currentChurch) throw new Error('No church selected');
    return DisplayService.create(currentChurch.id, {
      pairing_code: code,
      name,
      location,
      display_class: displayClass,
    });
  };

  const handleUpdate = async (id: string, name: string, location: string, displayClass: DisplayClass) => {
    const updated = await DisplayService.update(id, { name, location, display_class: displayClass });
    setDisplays(prev => prev.map(d => d.id === id ? updated : d));
  };

  const handleUnregister = async (id: string) => {
    await DisplayService.delete(id);
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
                        <div className={`w-2 h-2 rounded-full ${display.is_online ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {t(`displays.class.${display.display_class}`)}
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
```

**Step 2: Commit**

```bash
git add src/components/displays/DisplaysAccordion.tsx
git commit -m "feat: add DisplaysAccordion component"
```

### Task 2.4: Integrate DisplaysAccordion into AppSidebar

**Files:**
- Modify: `src/components/AppSidebar.tsx`

**Step 1: Read current sidebar structure**

Run: `cat src/components/AppSidebar.tsx`

**Step 2: Add DisplaysAccordion to the sidebar**

Add the import and component to the sidebar navigation:

```typescript
import { DisplaysAccordion } from '@/components/displays/DisplaysAccordion';
```

Add it in the navigation section where you want it (likely near the top):

```tsx
<DisplaysAccordion />
```

**Step 3: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: add Displays accordion to sidebar"
```

### Task 2.5: Remove Live Control section from Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx` (or wherever the dashboard live control section is)

**Step 1: Find and remove Live Control section**

Run: `grep -rn "Live Control" src/pages/`

**Step 2: Remove the Live Control section**

Delete the section that shows controller/display launch options.

**Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "refactor: remove Live Control section from dashboard"
```

### Task 2.6: Add Start button to Events page

**Files:**
- Modify: `src/pages/events.tsx` (or the events page component)

**Step 1: Add Start button to event cards**

For each event card, add a "Start" button that navigates to `/live/controller/:eventId`.

**Step 2: Commit**

```bash
git add src/pages/events.tsx
git commit -m "feat: add Start button to events page"
```

### Task 2.7: Add translations

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add to `en.json`:

```json
{
  "displays": {
    "title": "Displays",
    "empty": "No displays registered. Click + to add one.",
    "class": {
      "audience": "Audience",
      "stage": "Stage",
      "lobby": "Lobby"
    },
    "status": {
      "online": "Online",
      "offline": "Offline"
    },
    "pairing": {
      "enterCodeTitle": "Pair a Display",
      "enterCodeDescription": "Enter the 6-digit code shown on the display.",
      "registerTitle": "Register Display",
      "registerDescription": "Enter a name and location for this display.",
      "codeLabel": "Pairing Code",
      "nameLabel": "Display Name",
      "namePlaceholder": "Main Sanctuary Screen",
      "locationLabel": "Location",
      "locationPlaceholder": "Front of sanctuary",
      "classLabel": "Class",
      "verify": "Verify",
      "verifying": "Verifying...",
      "pair": "Pair Display",
      "invalidCode": "Please enter a valid 6-digit code.",
      "unreachable": "Unable to reach the display. Make sure it's on the same network.",
      "error": "An error occurred. Please try again.",
      "nameRequired": "Display name is required."
    },
    "edit": {
      "title": "Edit Display",
      "description": "Update the display details or unregister it from your church.",
      "save": "Save",
      "unregister": "Unregister",
      "unregistering": "Unregistering...",
      "unregisterConfirm": "Are you sure you want to unregister this display? It will need to be paired again.",
      "confirmUnregister": "Confirm",
      "error": "Failed to update display.",
      "unregisterError": "Failed to unregister display."
    }
  }
}
```

**Step 2: Add Spanish translations**

Add to `es.json`:

```json
{
  "displays": {
    "title": "Pantallas",
    "empty": "No hay pantallas registradas. Haz clic en + para agregar una.",
    "class": {
      "audience": "Audiencia",
      "stage": "Escenario",
      "lobby": "Lobby"
    },
    "status": {
      "online": "En línea",
      "offline": "Fuera de línea"
    },
    "pairing": {
      "enterCodeTitle": "Emparejar Pantalla",
      "enterCodeDescription": "Ingresa el código de 6 dígitos que se muestra en la pantalla.",
      "registerTitle": "Registrar Pantalla",
      "registerDescription": "Ingresa un nombre y ubicación para esta pantalla.",
      "codeLabel": "Código de Emparejamiento",
      "nameLabel": "Nombre de la Pantalla",
      "namePlaceholder": "Pantalla Principal del Santuario",
      "locationLabel": "Ubicación",
      "locationPlaceholder": "Frente del santuario",
      "classLabel": "Clase",
      "verify": "Verificar",
      "verifying": "Verificando...",
      "pair": "Emparejar",
      "invalidCode": "Por favor ingresa un código válido de 6 dígitos.",
      "unreachable": "No se puede alcanzar la pantalla. Asegúrate de que esté en la misma red.",
      "error": "Ocurrió un error. Por favor intenta de nuevo.",
      "nameRequired": "El nombre de la pantalla es requerido."
    },
    "edit": {
      "title": "Editar Pantalla",
      "description": "Actualiza los detalles de la pantalla o desregístrala de tu iglesia.",
      "save": "Guardar",
      "unregister": "Desregistrar",
      "unregistering": "Desregistrando...",
      "unregisterConfirm": "¿Estás seguro de que quieres desregistrar esta pantalla? Necesitará ser emparejada de nuevo.",
      "confirmUnregister": "Confirmar",
      "error": "Falló al actualizar la pantalla.",
      "unregisterError": "Falló al desregistrar la pantalla."
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "feat: add display system translations"
```

---

## Phase 3: Display Modes

### Task 3.1: Create TV pairing screen component

**Files:**
- Create: `src/components/displays/TVPairingScreen.tsx`

**Step 1: Create TV pairing screen**

```typescript
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DisplayService } from '@/services/displays';
import { useChurch } from '@/contexts/ChurchContext';

export function TVPairingScreen() {
  const [pairingCode, setPairingCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    // Generate pairing code
    const code = DisplayService.generatePairingCode();
    setPairingCode(code);

    // Generate QR code URL (using a public QR code API)
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${code}`);

    // Announce to signaling server
    invoke('send_pairing_advertisement', {
      pairingCode: code,
      deviceId: 'tv-device', // TODO: get actual device ID
    });

    // Send heartbeat every 5 seconds
    const heartbeat = setInterval(() => {
      invoke('send_display_heartbeat', { pairingCode: code });
    }, 5000);

    return () => clearInterval(heartbeat);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
      <h1 className="text-4xl font-bold mb-8">Pair This Display</h1>

      <div className="bg-card rounded-lg p-8 shadow-lg mb-8">
        <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg">Enter this code on your controller</p>
        <p className="text-5xl font-mono tracking-widest">{pairingCode}</p>
        <p className="text-muted-foreground">to pair this display</p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/TVPairingScreen.tsx
git commit -m "feat: add TV pairing screen component"
```

### Task 3.2: Create TV waiting screen component

**Files:**
- Create: `src/components/displays/TVWaitingScreen.tsx`

**Step 1: Create TV waiting screen**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/components/displays/TVWaitingScreen.tsx
git commit -m "feat: add TV waiting screen component"
```

### Task 3.3: Create TV simple menu component

**Files:**
- Create: `src/components/displays/TVMenu.tsx`

**Step 1: Create TV menu**

```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type TVMenuOption = 'resume' | 'pair' | 'unpair' | 'about' | 'exit';

interface TVMenuProps {
  isPaired: boolean;
  onSelect: (option: TVMenuOption) => void;
}

export function TVMenu({ isPaired, onSelect }: TVMenuProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { key: TVMenuOption; label: string }[] = [
    { key: isPaired ? 'resume' : 'pair', label: isPaired ? t('tv.menu.resume') : t('tv.menu.pair') },
    ...(isPaired ? [{ key: 'unpair' as TVMenuOption, label: t('tv.menu.unpair') }] : []),
    { key: 'about', label: t('tv.menu.about') },
    { key: 'exit', label: t('tv.menu.exit') },
  ];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      setSelectedIndex(i => (i - 1 + options.length) % options.length);
    } else if (e.key === 'ArrowDown') {
      setSelectedIndex(i => (i + 1) % options.length);
    } else if (e.key === 'Enter') {
      onSelect(options[selectedIndex].key);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/95 flex items-center justify-center"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="bg-card rounded-lg p-8 shadow-lg min-w-80">
        {options.map((option, index) => (
          <button
            key={option.key}
            onClick={() => onSelect(option.key)}
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
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/TVMenu.tsx
git commit -m "feat: add TV menu component"
```

### Task 3.4: Create DisplayModeSidebar component

**Files:**
- Create: `src/components/displays/DisplayModeSidebar.tsx`

**Step 1: Create display mode sidebar section**

```typescript
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DisplayService } from '@/services/displays';
import { useChurch } from '@/contexts/ChurchContext';
import type { DisplayClass } from '@/types/display';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Monitor, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConnectedDisplay {
  id: string;
  name: string;
  isMain: boolean;
  isRegistered: boolean;
  registeredDisplay?: Display;
}

export function DisplayModeSidebar() {
  const { t } = useTranslation();
  const { currentChurch } = useChurch();
  const [displays, setDisplays] = useState<ConnectedDisplay[]>([
    { id: 'main', name: 'Main Display', isMain: true, isRegistered: false },
  ]);

  const handlePair = async (displayId: string) => {
    // TODO: Implement pairing for local displays
    const code = await invoke<string>('generate_pairing_code');
    // Show pairing modal with this code
  };

  const handleUnpair = async (displayId: string) => {
    // TODO: Implement unpairing
  };

  return (
    <Accordion type="single" className="w-full">
      <AccordionItem value="display-mode" className="border-none">
        <AccordionTrigger className="py-2 hover:no-underline">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t('displayMode.title')}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          <div className="space-y-1">
            {displays.map(display => (
              <div
                key={display.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Monitor className="h-4 w-4 shrink-0" />
                  <span className="text-sm truncate">{display.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {display.isRegistered ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleUnpair(display.id)}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => handlePair(display.id)}
                    >
                      {t('displayMode.pair')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/DisplayModeSidebar.tsx
git commit -m "feat: add DisplayMode sidebar component"
```

### Task 3.5: Add display mode translations

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add translations to en.json**

```json
{
  "tv": {
    "menu": {
      "resume": "Resume",
      "pair": "Pair",
      "unpair": "Unpair",
      "about": "About",
      "exit": "Exit"
    }
  },
  "displayMode": {
    "title": "Display Mode",
    "pair": "Pair",
    "unpair": "Unpair"
  }
}
```

**Step 2: Add translations to es.json**

```json
{
  "tv": {
    "menu": {
      "resume": "Continuar",
      "pair": "Emparejar",
      "unpair": "Desemparejar",
      "about": "Acerca de",
      "exit": "Salir"
    }
  },
  "displayMode": {
    "title": "Modo Pantalla",
    "pair": "Emparejar",
    "unpair": "Desemparejar"
  }
}
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "feat: add TV and display mode translations"
```

---

## Phase 4: Events Integration

### Task 4.1: Create EventDisplaysAccordion component

**Files:**
- Create: `src/components/displays/EventDisplaysAccordion.tsx`

**Step 1: Create event displays accordion**

```typescript
import { useState } from 'react';
import { useChurch } from '@/contexts/ChurchContext';
import { DisplayService } from '@/services/displays';
import type { Display, DisplayClass } from '@/types/display';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';

interface EventDisplaysAccordionProps {
  eventId: string;
  selectedDisplays: Set<string>;
  onDisplayToggle: (displayId: string) => void;
  onDisplayClassChange: (displayId: string, displayClass: DisplayClass) => void;
}

export function EventDisplaysAccordion({
  eventId,
  selectedDisplays,
  onDisplayToggle,
  onDisplayClassChange,
}: EventDisplaysAccordionProps) {
  const { t } = useTranslation();
  const { currentChurch } = useChurch();
  const [displays, setDisplays] = useState<Display[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch displays
  useState(() => {
    if (!currentChurch) {
      setDisplays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    DisplayService.getForCurrentChurch(currentChurch.id)
      .then(setDisplays)
      .finally(() => setLoading(false));
  });

  return (
    <Accordion type="single" value="displays" className="w-full">
      <AccordionItem value="displays" className="border-none">
        <AccordionTrigger className="py-2 hover:no-underline">
          {t('displays.forEvent')}
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : displays.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('displays.empty')}</p>
          ) : (
            <div className="space-y-1">
              {displays.map(display => (
                <div
                  key={display.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-accent group"
                >
                  <Checkbox
                    id={`display-${display.id}`}
                    checked={selectedDisplays.has(display.id)}
                    onCheckedChange={() => onDisplayToggle(display.id)}
                  />
                  <label
                    htmlFor={`display-${display.id}`}
                    className="flex-1 text-sm cursor-pointer"
                  >
                    <p className="font-medium truncate">{display.name}</p>
                    {display.location && (
                      <p className="text-xs text-muted-foreground truncate">{display.location}</p>
                    )}
                  </label>
                  <Select
                    value={display.display_class}
                    onValueChange={(v: DisplayClass) => onDisplayClassChange(display.id, v)}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audience">{t('displays.class.audience')}</SelectItem>
                      <SelectItem value="stage">{t('displays.class.stage')}</SelectItem>
                      <SelectItem value="lobby">{t('displays.class.lobby')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${display.is_online ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                </div>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/displays/EventDisplaysAccordion.tsx
git commit -m "feat: add EventDisplaysAccordion component"
```

---

## Phase 5: Status Tracking

### Task 5.1: Implement heartbeat hook

**Files:**
- Create: `src/hooks/useDisplayHeartbeat.ts`

**Step 1: Create heartbeat hook**

```typescript
import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useDisplayHeartbeat(pairingCode: string, enabled: boolean = true) {
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (!enabled || !pairingCode) return;

    // Send heartbeat every 5 seconds
    intervalRef.current = window.setInterval(async () => {
      try {
        await invoke('send_display_heartbeat', { pairingCode });
      } catch (err) {
        console.error('Failed to send heartbeat:', err);
      }
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pairingCode, enabled]);
}
```

**Step 2: Commit**

```bash
git add src/hooks/useDisplayHeartbeat.ts
git commit -m "feat: add useDisplayHeartbeat hook"
```

### Task 5.2: Implement offline polling hook

**Files:**
- Create: `src/hooks/useDisplayOfflinePolling.ts`

**Step 1: Create offline polling hook**

```typescript
import { useEffect } from 'react';
import { useChurch } from '@/contexts/ChurchContext';
import { DisplayService } from '@/services/displays';

export function useDisplayOfflinePolling(enabled: boolean = true) {
  const { currentChurch } = useChurch();

  useEffect(() => {
    if (!enabled || !currentChurch) return;

    // Check for stale displays every 30 seconds
    const interval = setInterval(async () => {
      try {
        await DisplayService.markStaleDisplaysOffline(currentChurch.id);
      } catch (err) {
        console.error('Failed to mark stale displays offline:', err);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [currentChurch, enabled]);
}
```

**Step 2: Commit**

```bash
git add src/hooks/useDisplayOfflinePolling.ts
git commit -m "feat: add useDisplayOfflinePolling hook"
```

---

## Phase 6: Polish

### Task 6.1: Add QR code library

**Files:**
- Modify: `package.json`

**Step 1: Add QR code generation library**

Run: `pnpm add qrcode.react @types/qrcode.react`

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add qrcode.react library"
```

### Task 6.2: Update TVPairingScreen to use QR code library

**Files:**
- Modify: `src/components/displays/TVPairingScreen.tsx`

**Step 1: Replace API-based QR code with library**

```typescript
import QRCode from 'qrcode.react';
// ... remove the qrCodeUrl state and use the component instead:

<div className="bg-card rounded-lg p-8 shadow-lg mb-8">
  <QRCode value={pairingCode} size={256} />
</div>
```

**Step 2: Commit**

```bash
git add src/components/displays/TVPairingScreen.tsx
git commit -m "refactor: use qrcode.react library for QR codes"
```

### Task 6.3: Add error boundaries

**Files:**
- Create: `src/components/ErrorBoundary.tsx`

**Step 1: Create error boundary**

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Step 2: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat: add ErrorBoundary component"
```

### Task 6.4: Final integration testing

**Step 1: Test the full flow**

Run: `pnpm tauri:dev`

Verify:
1. Controller sidebar shows Displays accordion
2. Can click + to open pairing modal
3. TV shows pairing screen with QR code
4. Can enter code and pair display
5. Display appears in sidebar with online status
6. Can edit display details
7. Can unregister display

**Step 2: Final commit**

```bash
git add .
git commit -m "chore: final integration polish for display system"
```

---

## Summary

This implementation plan covers:

1. **Database layer** - displays table with RLS
2. **Service layer** - DisplayService for CRUD operations
3. **Signaling layer** - Extended WebRTC messages for pairing
4. **UI layer** - Controller components (accordion, modals)
5. **Display modes** - TV screens, mobile/desktop sidebar
6. **Status tracking** - Heartbeats and offline polling
7. **Polish** - QR codes, error boundaries, translations

**Total estimated tasks:** 30+
**Recommended commit frequency:** Every task
**Testing approach:** Manual integration testing in dev mode
