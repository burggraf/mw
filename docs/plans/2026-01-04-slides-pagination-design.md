# Slides Pagination Design

**Date:** 2026-01-04
**Status:** Approved
**Type:** Feature Enhancement

## Overview

Implement server-side pagination for the `/slides` screen to handle large slide collections efficiently. This includes traditional numbered page controls, user-configurable page sizes, and server-side sorting.

## Problem Statement

Currently, the `/slides` screen loads all slides at once via a single database query. This approach:
- Slows down initial page load for users with hundreds or thousands of slides
- Performs client-side filtering and sorting on the entire dataset
- Doesn't scale well as slide collections grow

## Solution Architecture

### Server-Side Pagination
- Fetch only the current page of slides from the database
- Use PostgreSQL LIMIT/OFFSET via Supabase `.range()`
- Support configurable page sizes: 20, 50, 100 slides per page
- Reset to page 1 when filters, search, or sorting changes

### Server-Side Sorting
- Move sorting logic from client to database queries
- Support sorting by: name, created_at, file_size, folder_id
- Maintain current behavior: newest first by default, oldest first when viewing folders

### Traditional Pagination UI
- Numbered page controls (First, Prev, 1, 2, 3..., Next, Last)
- Page size selector dropdown
- "Showing X-Y of Z slides" counter
- Responsive: full controls on desktop, simplified Prev/Next on mobile

## Implementation Plan

### 1. Backend Changes (services/media.ts)

#### Update `getMedia()` function signature:
```typescript
export async function getMedia(
  churchId: string,
  filters?: MediaFilters,
  pagination?: {
    page: number
    perPage: number
    sortBy?: 'name' | 'created_at' | 'file_size' | 'folder_id'
    sortOrder?: 'asc' | 'desc'
  }
): Promise<Media[]>
```

#### Add new `getMediaCount()` function:
```typescript
export async function getMediaCount(
  churchId: string,
  filters?: MediaFilters
): Promise<number>
```

#### Implementation details:
- Apply identical filters to both `getMedia()` and `getMediaCount()`
- For `getMedia()`: build query → apply filters → add sorting → add range
- For `getMediaCount()`: build query → apply filters → get count only
- Range calculation: `from = (page - 1) * perPage`, `to = from + perPage - 1`
- Default behavior: if no pagination params, return all results (backward compatibility)
- Default sort: `created_at desc` (newest first), unless viewing specific folder (then `asc`)

### 2. Frontend Changes (pages/Slides.tsx)

#### Add state management:
```typescript
const [currentPage, setCurrentPage] = useState(1)
const [pageSize, setPageSize] = useState<number>(() => {
  return parseInt(localStorage.getItem('slides-page-size') || '20')
})
const [totalCount, setTotalCount] = useState(0)
const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'file_size' | 'folder_id'>('created_at')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
```

#### Update `loadMedia()` function:
- Fetch data and count in parallel using `Promise.all()`
- Pass pagination params to `getMedia()`: page, perPage, sortBy, sortOrder
- Update state with both results
- Remove client-side search filtering (move to server if needed, or keep for now)

#### Add reset logic:
```typescript
useEffect(() => {
  setCurrentPage(1)
}, [activeCollection, selectedTags, searchQuery, selectedFolderId, sortBy, sortOrder])
```

#### Persist page size:
```typescript
useEffect(() => {
  localStorage.setItem('slides-page-size', pageSize.toString())
}, [pageSize])
```

#### Add sort handler:
```typescript
function handleSort(field: 'name' | 'created_at' | 'file_size' | 'folder_id') {
  if (sortBy === field) {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  } else {
    setSortBy(field)
    setSortOrder('asc')
  }
}
```

#### Add Pagination component in JSX:
- Place after MediaGrid/MediaListView
- Pass: currentPage, totalCount, pageSize, onPageChange, onPageSizeChange

### 3. Component Changes (MediaListView.tsx)

#### Remove client-side sorting:
- Delete `sortField` and `sortDirection` state (lines 256-257)
- Delete `handleSort` function (lines 261-268)
- Delete `sortedMedia` useMemo (lines 270-296)
- Use `media` prop directly instead of `sortedMedia`

#### Update props interface:
```typescript
interface MediaListViewProps {
  // ... existing props
  sortBy?: 'name' | 'created_at' | 'file_size' | 'folder_id'
  sortOrder?: 'asc' | 'desc'
  onSort?: (field: 'name' | 'created_at' | 'file_size' | 'folder_id') => void
}
```

#### Update SortableHeader usage:
- Change `currentField={sortField}` to `currentField={sortBy}`
- Change `direction={sortDirection}` to `direction={sortOrder}`
- Change `onSort={handleSort}` to `onSort={onSort}`

### 4. New Pagination Component

Create `src/components/ui/MediaPagination.tsx`:

```typescript
interface MediaPaginationProps {
  currentPage: number
  totalCount: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}
```

**Features:**
- Calculate total pages: `Math.ceil(totalCount / pageSize)`
- Display "Showing X-Y of Z slides"
- Page size selector: dropdown with [20, 50, 100]
- Use shadcn Pagination components for numbered controls
- Desktop: First, Prev, numbered pages (with ellipsis), Next, Last
- Mobile: "Page X of Y" with Prev/Next only
- Disable controls when loading or on invalid pages

## UI/UX Details

### Pagination Controls Layout

```
[Grid/List of slides above]

┌─────────────────────────────────────────────────────────────┐
│  Showing 21-40 of 247 slides        [20 ▼] per page         │
│                                                               │
│  [First] [Prev] [1] ... [3] [4] [5] ... [13] [Next] [Last] │
└─────────────────────────────────────────────────────────────┘
```

### Responsive Behavior
- **Desktop:** Full pagination with page numbers and page size selector
- **Tablet:** Condensed page numbers (fewer shown before ellipsis)
- **Mobile:** Simplified - "Page 3 of 13" with Prev/Next buttons only

### Loading States
- Show skeleton during page navigation
- Disable pagination controls while loading
- Scroll to top of results when changing pages

### Empty States
- If filtered results are empty: "No slides found" with "Reset filters" button
- If paginated beyond available data: automatically jump to last valid page

### Interaction Behaviors
- **Page size change:** Reset to page 1, save to localStorage
- **Filter change:** Reset to page 1
- **Sort change:** Reset to page 1
- **Folder change:** Reset to page 1, reset sort to default
- **Selection:** Clear selected slides when changing pages

## Data Flow

1. User lands on `/slides` → loads page 1 with default settings
2. User changes page size → updates state, saves to localStorage, resets to page 1, refetches
3. User clicks sort header → updates sortBy/sortOrder, resets to page 1, refetches
4. User searches → updates searchQuery, resets to page 1, refetches
5. User selects folder → updates selectedFolderId, resets page & sort, refetches
6. User clicks page number → updates currentPage, refetches

## Edge Cases

1. **User on page 5, applies filter that returns only 2 pages:** Reset to page 1
2. **User deletes slides on current page, making it empty:** Reload same page (may auto-adjust)
3. **Total count changes while paginating:** Next fetch will show updated count
4. **Slow network:** Show loading state, disable controls
5. **Bulk selection across pages:** Clear selection when changing pages (don't maintain cross-page selection)

## Search Behavior

The current implementation does client-side search filtering. Options:
1. **Keep client-side search (simpler):** Search filters the current page results only
2. **Move to server-side search:** Add search to `MediaFilters`, counts and pagination respect search

**Recommendation:** Start with client-side search on current page, can enhance later if needed.

## Backward Compatibility

- `getMedia()` without pagination params returns all results (maintains existing behavior)
- Other pages using `getMedia()` (like stock media dialog) are unaffected
- Client-side search still works for filtering current page

## Testing Checklist

- [ ] Pagination controls navigate correctly
- [ ] Page size selector changes page size and resets to page 1
- [ ] Sorting changes sort order and resets to page 1
- [ ] Filter changes (tags, folders, collections) reset to page 1
- [ ] Search filters current page results
- [ ] Selection clears when changing pages
- [ ] Loading states show during navigation
- [ ] Empty states display correctly
- [ ] Mobile responsive layout works
- [ ] localStorage persists page size preference
- [ ] Bulk actions work within current page
- [ ] Total count updates after deletions/additions

## Future Enhancements

- Server-side search integration
- URL query params for page/filters (shareable links)
- "Jump to page" input field
- Infinite scroll as alternative view mode
- Virtual scrolling for very large pages
