# Slides List View & Bulk Actions Design

## Overview

Add a toggle between thumbnail/list view in the slides screen, with checkboxes in list view for bulk operations (move to folder, remove from folder, delete).

## View Toggle

**Location:** Right side of the search bar, using a `ToggleGroup` component with `Grid` and `List` icons.

**State:**
- `viewMode: 'grid' | 'list'` state in `SlidesPage`
- Persist preference in localStorage

## List View Component

**New Component:** `MediaListView`

**Row Layout:**
```
[Checkbox] [Thumbnail 64x36] [Name] [Date] [Size] [Folder] [Actions ⋮]
```

**Columns:**
- **Checkbox:** For selecting slides
- **Thumbnail:** 64×36px preview
- **Name:** Slide name, truncated with ellipsis
- **Date:** "Jan 4, 2026" format
- **Size:** Human-readable (e.g., "2.4 MB")
- **Folder:** Folder name or "—"
- **Actions:** Dropdown (Edit, Delete)

**Responsive:** Hide Date and Size on mobile.

## Selection State

- `selectedIds: Set<string>` for tracking checked slides
- Enter selection mode when checkbox clicked
- Exit when selection cleared or action completes

## Bulk Action Bar

**Appearance:** Fixed bar at bottom when slides are selected.

**Layout:**
```
[X selected] [Move to folder ▾] [Remove from folder] [Delete]
```

**Actions:**
1. **Move to folder:** Dropdown with existing folders + "New folder..."
2. **Remove from folder:** Moves slides to no folder (only enabled when viewing a folder)
3. **Delete:** Confirmation dialog with count

## Files to Modify

1. `src/pages/Slides.tsx` - View toggle, selection state, bulk action bar
2. `src/components/media/MediaGrid.tsx` - Add `viewMode` prop

## New Files

1. `src/components/media/MediaListView.tsx` - List view with checkboxes
2. `src/components/media/BulkActionBar.tsx` - Bottom action bar

## Service Additions

```typescript
// In src/services/media.ts
bulkMoveToFolder(ids: string[], folderId: string | null): Promise<void>
bulkDeleteMedia(ids: string[]): Promise<void>
```

## Translation Keys

```json
{
  "slides": {
    "selectedCount": "{{count}} selected",
    "moveToFolder": "Move to folder",
    "removeFromFolder": "Remove from folder",
    "bulkDeleteConfirm": "Delete {{count}} slides?",
    "bulkDeleteWarning": "This action cannot be undone.",
    "gridView": "Grid view",
    "listView": "List view"
  }
}
```
