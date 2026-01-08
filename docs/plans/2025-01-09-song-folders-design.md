# Song Folders Feature Design

**Date:** 2025-01-09
**Status:** Approved

## Overview

Add folder organization for songs, matching the functionality that exists for slides. Songs can be organized into folders with full CRUD operations, bulk selection, and bulk actions.

## Database Schema

### New Table: `song_folders`

```sql
CREATE TABLE song_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE songs ADD COLUMN folder_id UUID REFERENCES song_folders(id) ON DELETE CASCADE;

CREATE INDEX idx_song_folders_church ON song_folders(church_id);
CREATE INDEX idx_songs_folder ON songs(folder_id);

ALTER TABLE song_folders ENABLE ROW LEVEL SECURITY;
```

**Key decisions:**
- Separate table from `slide_folders` for clean separation
- No `default_loop_time` (not relevant for songs)
- `folder_id` on songs with CASCADE delete (deleting folder deletes all songs inside)
- One song = one folder (or null = "All Songs")
- Church-scoped with RLS

## Service Layer

**File: `src/services/songs.ts`**

```typescript
// Folder CRUD
getSongFolders(churchId: string): Promise<SongFolder[]>
createSongFolder(churchId: string, name: string, description?: string): Promise<SongFolder>
updateSongFolder(folderId: string, name: string, description?: string): Promise<SongFolder>
deleteSongFolder(folderId: string): Promise<void>

// Folder contents
getSongsInFolder(folderId: string): Promise<Song[]>

// Moving songs
moveSongToFolder(songId: string, folderId: string | null): Promise<Song>
bulkMoveToFolder(songIds: string[], folderId: string | null): Promise<void>

// Bulk operations
bulkDeleteSongs(songIds: string[]): Promise<void>
```

## UI Components

### New Components

1. **`SongFolderDialog.tsx`**
   - Modal for creating/editing song folders
   - Fields: name (required), description (optional)

2. **`SongsSidebar.tsx`** (or similar)
   - "All Songs" button at top
   - Folder list with edit/delete dropdown
   - Only shows when `folders` prop is provided

3. **`SongBulkActionBar.tsx`**
   - Floating bulk action bar
   - Actions: Move to folder, Remove from folder, Delete
   - Shows selected count

### Existing Components to Update

- Songs table/list: Add checkbox column
- Consider adding grid view toggle (currently table-only)

## Songs Page Changes

**File: `src/pages/Songs.tsx`**

### State to Add
- `selectedFolderId` - current folder filter
- `folders` - array of song folders
- `selectedSongIds` - bulk selection state

### Features to Add
- Folder navigation (sidebar or integrated)
- Bulk selection with checkboxes
- Bulk operations via floating action bar
- Folder header when viewing specific folder
- "View All Songs" button
- Pagination that respects folder filtering

## Implementation Steps

1. **Database migration**
   - Create `song_folders` table
   - Add `folder_id` column to `songs` table
   - Add indexes and RLS policies

2. **TypeScript types**
   - Add `SongFolder` interface to `src/types/`
   - Update `Song` type to include optional `folder_id`

3. **Service layer**
   - Create/expand `src/services/songs.ts`
   - Implement all folder and bulk operations

4. **Components**
   - Create `SongFolderDialog.tsx`
   - Create sidebar component
   - Create `SongBulkActionBar.tsx`

5. **Songs page integration**
   - Add folder state management
   - Add checkboxes and bulk selection
   - Integrate sidebar and bulk actions
   - Test all CRUD operations

## Testing

- Folder creation/editing/deletion
- Moving songs between folders
- Bulk operations (move, remove, delete)
- "All Songs" vs folder view switching
- RLS policies (church isolation)
- Cascade delete behavior
