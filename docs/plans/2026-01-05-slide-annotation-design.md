# Slide Annotation Feature - Design Document

**Date:** 2026-01-05
**Status:** Approved for Implementation

## Overview

Add image annotation capability to the Slides screen, allowing users to draw, add text, shapes, and highlights directly on slide images. Users can save annotations as a new slide or replace the original.

## User Requirements

- Annotate image slides with drawing tools
- Full-screen editing experience
- Rich annotation palette: pen, text, shapes, highlighter
- Undo/redo support
- Choice to save over original or create new slide

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Media types | Images only | Simplest use case, covers 90% of needs |
| Library | Fabric.js | Battle-tested, built-in history, rich features |
| Tools | Pen, Text, Shapes, Highlighter | Covers all common annotation needs |
| Save behavior | Always ask user | Safest - prevents accidental overwrites |
| Toolbar position | Top bar | Common pattern, doesn't obscure image |
| Color picker | Preset + custom | Fast common colors, flexibility for advanced |
| Undo/Redo | Yes, included | Users expect it, Fabric.js makes it easy |
| Text formatting | Advanced | Full control: font, size, bold, italic, underline, alignment, background |

## Architecture

### Component Structure

```
src/components/slides/
├── SlideAnnotationEditor.tsx      # Main fullscreen annotation editor
├── AnnotationToolbar.tsx          # Top toolbar with tools and actions
├── AnnotationColorPicker.tsx      # Color selection (preset + custom)
├── AnnotationTextPanel.tsx        # Text formatting controls
└── SaveAnnotationDialog.tsx       # Save over/save as new prompt
```

### Integration

- Add "Annotate" button to `MediaDetailDialog` (line ~340, next to "Show Text" button)
- Button only visible for `media.type === 'image'` and `media.category === 'slide'`
- Clicking opens `SlideAnnotationEditor` in fullscreen portal
- Editor manages state independently, returns results to parent

### Tech Stack

- **Canvas:** Fabric.js (lazy loaded for code splitting)
- **UI Components:** Shadcn UI (existing buttons, dropdowns, dialogs)
- **State:** React useState/useRef
- **Storage:** Supabase Storage (existing media service)

## UI Layout & User Flow

### Fullscreen Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Exit] | [Pen] [Text] [Shapes] [Highlighter] | [Color] [Size] | [Undo] [Redo] | [Cancel] [Save] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     ┌─────────────────┐                     │
│                     │                 │                     │
│                     │  Image Canvas   │                     │
│                     │  with Fabric.js │                     │
│                     │                 │                     │
│                     └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Toolbar Sections:**
- **Left:** Exit button (return to MediaDetailDialog)
- **Center:** Tool icons (active tool highlighted)
- **Right of tools:** Contextual controls (color, size)
- **Far right:** Undo/Redo, Cancel, Save

**Contextual Panels:**
When text tool is active, formatting panel appears below toolbar:
- Font family | Size | Bold | Italic | Underline | Align | Text color | BG color

### User Flow

1. User opens image slide in `MediaDetailDialog`
2. Clicks "Annotate" button
3. Dialog closes → `SlideAnnotationEditor` opens fullscreen
4. User selects tool from toolbar
5. User creates annotations on canvas
6. User can undo/redo, select/move/resize objects
7. User clicks "Save"
8. `SaveAnnotationDialog` appears with two options:
   - **Replace original slide** (with warning)
   - **Save as new slide** (default selected)
9. Image exported and uploaded to Supabase
10. Editor closes, returns to Slides page
11. Success toast shown, new slide highlighted if created

### Mobile Adaptations

- **Toolbar:** Icons may wrap or use hamburger menu
- **Color picker:** Opens as bottom sheet
- **Text formatting:** Slides in from bottom
- **Touch targets:** Minimum 44px for all interactive elements
- **Gestures:** Two-finger pan/zoom on canvas (optional)

## Annotation Tools

### 1. Freehand Pen Tool

**Behavior:**
- Click/tap and drag to draw
- Smooth, anti-aliased lines

**Options:**
- Width: 1-20px (slider)
- Color: From color picker

**Implementation:**
```typescript
const brush = new fabric.PencilBrush(canvas)
brush.width = strokeWidth
brush.color = currentColor
canvas.freeDrawingBrush = brush
canvas.isDrawingMode = true
```

### 2. Text Tool

**Behavior:**
- Click on canvas to place text box
- Immediately enters edit mode
- Double-click existing text to re-edit

**Formatting Options:**
- **Font family:** Arial, Times New Roman, Georgia, Courier, Verdana
- **Size:** 12-96px (slider with numeric input)
- **Style:** Bold, Italic, Underline (toggles)
- **Alignment:** Left, Center, Right
- **Colors:** Text color, Background color (optional)
- **Background:** Toggleable with opacity control

**Implementation:**
```typescript
const text = new fabric.IText('Click to edit', {
  left: x,
  top: y,
  fontFamily: currentFont,
  fontSize: currentSize,
  fill: textColor,
  backgroundColor: bgColor || 'transparent',
  fontWeight: isBold ? 'bold' : 'normal',
  fontStyle: isItalic ? 'italic' : 'normal',
  underline: isUnderline,
  textAlign: alignment,
})
canvas.add(text)
text.enterEditing()
```

### 3. Shapes Tool

**Shape Types:**
- Rectangle
- Circle/Ellipse
- Line
- Arrow (line with custom arrowhead)

**Options:**
- Stroke color
- Fill color (with opacity slider)
- Stroke width: 1-10px

**Behavior:**
- Select shape from dropdown
- Click and drag to draw
- Shift key maintains aspect ratio (circle, square)

**Implementation:**
```typescript
// Rectangle
const rect = new fabric.Rect({
  left: x, top: y,
  width: w, height: h,
  fill: fillColor,
  stroke: strokeColor,
  strokeWidth: strokeWidth,
})

// Circle
const circle = new fabric.Circle({
  radius: r,
  fill: fillColor,
  stroke: strokeColor,
})

// Arrow (custom)
const arrow = new fabric.Path('M 0 0 L 100 0', {
  stroke: strokeColor,
  strokeWidth: strokeWidth,
})
// Add arrowhead triangle at end
```

### 4. Highlighter Tool

**Behavior:**
- Similar to pen but optimized for highlighting
- Forced transparency (30% opacity)
- Thicker default width

**Preset Colors:**
- Yellow (#EAB308, 30% opacity)
- Green (#22C55E, 30% opacity)
- Pink (#EC4899, 30% opacity)
- Blue (#3B82F6, 30% opacity)

**Options:**
- Width: 15-30px
- Color from preset highlighter palette

**Implementation:**
```typescript
const brush = new fabric.PencilBrush(canvas)
brush.width = 20
brush.color = 'rgba(234, 179, 8, 0.3)' // Yellow with 30% opacity
```

### Common Object Features

All objects support (via Fabric.js built-in):
- **Selection:** Click to select, shows bounding box with handles
- **Move:** Drag to reposition
- **Resize:** Drag corner handles
- **Rotate:** Drag rotation handle
- **Delete:** Delete key or trash button

## Color Picker

### Preset Palette (12 colors)

```
Black    White    Red       Orange   Yellow   Green
#000000  #FFFFFF  #EF4444   #F97316  #EAB308  #22C55E

Blue     Purple   Pink      Cyan     Gray     Brown
#3B82F6  #A855F7  #EC4899   #06B6D4  #6B7280  #92400E
```

**UI:**
- Grid of 12 color swatches (24px squares)
- Currently selected has border or checkmark
- Click to select instantly

### Custom Color Picker

**UI:**
- "+ Custom" button opens popover/bottom sheet
- Native `<input type="color">` or compatible component
- "Recent colors" row (last 5 custom colors used)
- Color value display (hex)

**Behavior:**
- Selected custom color becomes active
- Automatically added to "Recent colors"
- Recent colors persist in session (localStorage)

## Undo/Redo

### History Management

**Approach:**
- Capture canvas state as JSON after each completed action
- Maintain history stack (max 50 entries to prevent memory issues)
- Pointer tracks current position in history

**State Capture:**
```typescript
const saveState = () => {
  const json = canvas.toJSON()
  history.splice(historyPointer + 1) // Remove future states
  history.push(json)
  if (history.length > 50) history.shift() // Limit to 50
  historyPointer = history.length - 1
}
```

**Undo:**
```typescript
const undo = () => {
  if (historyPointer > 0) {
    historyPointer--
    canvas.loadFromJSON(history[historyPointer])
    canvas.renderAll()
  }
}
```

**Redo:**
```typescript
const redo = () => {
  if (historyPointer < history.length - 1) {
    historyPointer++
    canvas.loadFromJSON(history[historyPointer])
    canvas.renderAll()
  }
}
```

### Actions that Create History

- Object added (pen stroke complete, text created, shape drawn)
- Object modified (moved, resized, rotated, text edited)
- Object deleted
- NOT tracked: Tool selection, color changes (only when applied)

### UI

**Buttons:**
- Disabled state when at history boundaries
- Keyboard shortcuts:
  - Undo: Cmd/Ctrl+Z
  - Redo: Cmd/Ctrl+Shift+Z
- Visual feedback on press (button highlight)

## Save Functionality

### SaveAnnotationDialog

**Layout:**
```
┌──────────────────────────────────────┐
│  Save Annotated Slide                │
├──────────────────────────────────────┤
│  Choose how to save your changes     │
│                                      │
│  ○ Replace original slide            │
│    This will permanently overwrite   │
│    the original image.               │
│                                      │
│  ● Save as new slide (default)       │
│    Creates a new slide and keeps     │
│    the original.                     │
│                                      │
│              [Cancel]  [Save]        │
└──────────────────────────────────────┘
```

**Validation:**
- Check if canvas has changes (compare to initial state)
- If no changes: Toast "No changes to save", close editor
- If has changes: Show dialog

### Image Export Process

**High Quality Export:**
```typescript
// Export at original resolution
const dataUrl = canvas.toDataURL({
  format: 'png',
  quality: 1.0,
  multiplier: originalWidth / canvas.width, // Scale to original size
})

// Convert to Blob for upload
const blob = await fetch(dataUrl).then(r => r.blob())
```

**Fabric.js automatically scales annotations to match export resolution**

### Save to Supabase

#### Option 1: Replace Original

1. Upload new image to **same storage path** (overwrites)
2. Update `media` table row:
   - Keep same `id`
   - Update `file_size` to new size
   - Update `updated_at` timestamp
3. Invalidate browser cache for old URL
4. Toast: "Slide updated successfully"

```typescript
// Upload
await supabase.storage
  .from('media')
  .upload(media.storagePath, blob, { upsert: true })

// Update metadata
await supabase
  .from('media')
  .update({ file_size: blob.size, updated_at: new Date() })
  .eq('id', media.id)
```

#### Option 2: Save as New

1. Generate new filename: `{original-name}-annotated-{timestamp}.png`
2. Upload to storage with new path
3. Insert new row in `media` table:
   - Copy metadata from original (name, tags, folder_id, church_id, category)
   - Append " (annotated)" to name
   - New `id`, `storage_path`, `file_size`
   - Set `created_at` to now
4. Toast: "New slide created"
5. Highlight new slide in grid

```typescript
const newFileName = `${originalName}-annotated-${Date.now()}.png`
const newPath = `${churchId}/slides/${newFileName}`

// Upload
const { data: uploadData } = await supabase.storage
  .from('media')
  .upload(newPath, blob)

// Insert new media row
const { data: newMedia } = await supabase
  .from('media')
  .insert({
    church_id: media.church_id,
    name: `${media.name} (annotated)`,
    storage_path: newPath,
    type: 'image',
    category: 'slide',
    file_size: blob.size,
    tags: media.tags,
    folder_id: media.folder_id,
    // width, height will be auto-populated by upload trigger
  })
  .select()
  .single()
```

### Post-Save Actions

1. Show success toast
2. Close annotation editor
3. Refresh media list in `SlidesPage` (call `loadMedia()`)
4. If saved as new:
   - Scroll to new slide
   - Highlight/flash new slide briefly
5. Return to normal view

### Error Handling

| Error | Handling |
|-------|----------|
| Upload failure | Show error toast, keep editor open, allow retry |
| Network timeout | "Saving..." state with timeout warning after 30s |
| Storage quota exceeded | Clear message: "Storage full. Please contact admin." |
| Image too large | Warn before upload if > 10MB |
| Session expired | Redirect to login, show "Session expired" message |

## Technical Considerations

### Performance

**Lazy Loading:**
```typescript
// Code-split Fabric.js
const { fabric } = await import('fabric')
```

**Large Images:**
- If original > 4000px wide: Scale down for editing (e.g., 2000px max)
- Export at full resolution using `multiplier` option
- Show loading spinner while loading large images

**History Optimization:**
- Debounce state capture during continuous drawing
- Save state on `path:created` event (stroke complete), not `mouse:move`
- Limit history to 50 entries

### Responsive Design

**Breakpoints:**
- Desktop (≥ 1024px): Full toolbar, side-by-side controls
- Tablet (768-1023px): Toolbar may wrap, dropdowns for tools
- Mobile (< 768px): Compact icons, bottom sheets for panels

**Mobile Specific:**
- Touch-friendly 44px minimum targets
- Bottom sheet for color picker
- Bottom sheet for text formatting
- Prevent page zoom on double-tap

### Edge Cases

1. **Very large images (> 10MB):**
   - Show warning: "Large image, may take time to load"
   - Loading spinner with progress if possible

2. **User navigates away:**
   - `beforeunload` event: "You have unsaved changes. Leave anyway?"
   - Only if annotations exist

3. **Session timeout during editing:**
   - Detect auth state change
   - Show warning, save work to localStorage as backup

4. **Image already deleted:**
   - Check media exists before opening editor
   - Handle 404 gracefully: "Image not found"

5. **Concurrent edits (future):**
   - Not applicable in v1 (single-user)
   - Could add optimistic locking later

6. **Browser compatibility:**
   - Fabric.js + Canvas API work in all modern browsers
   - Test on: Chrome, Firefox, Safari, Edge
   - Minimum: Safari 14+, Chrome 90+, Firefox 88+

### Accessibility

**Keyboard Navigation:**
- Tab through toolbar buttons
- Shortcuts for tools:
  - `P` - Pen
  - `T` - Text
  - `S` - Shapes
  - `H` - Highlighter
  - `Esc` - Cancel/Deselect
  - `Delete` - Delete selected object
  - `Cmd/Ctrl+Z` - Undo
  - `Cmd/Ctrl+Shift+Z` - Redo

**ARIA Labels:**
- All toolbar buttons: `aria-label="Pen tool"`
- Tool state: `aria-pressed="true"` for active tool
- Disabled buttons: `aria-disabled="true"`

**Screen Readers:**
- Announce tool changes: "Pen tool activated"
- Announce undo/redo: "Undone. 3 steps remaining."
- Form labels for all inputs

**Focus Management:**
- Focus returns to toolbar after closing panels
- Focus trap within editor (can't tab to underlying page)

### Internationalization

**Translation Keys (add to en.json & es.json):**

```json
{
  "slides": {
    "annotate": "Annotate",
    "annotation": {
      "title": "Annotate Slide",
      "tools": {
        "pen": "Pen",
        "text": "Text",
        "shapes": "Shapes",
        "highlighter": "Highlighter"
      },
      "shapeTypes": {
        "rectangle": "Rectangle",
        "circle": "Circle",
        "line": "Line",
        "arrow": "Arrow"
      },
      "undo": "Undo",
      "redo": "Redo",
      "cancel": "Cancel",
      "save": "Save",
      "exit": "Exit",
      "color": "Color",
      "customColor": "Custom Color",
      "recentColors": "Recent Colors",
      "width": "Width",
      "size": "Size",
      "textFormatting": "Text Formatting",
      "fontFamily": "Font",
      "fontSize": "Size",
      "bold": "Bold",
      "italic": "Italic",
      "underline": "Underline",
      "alignLeft": "Align Left",
      "alignCenter": "Align Center",
      "alignRight": "Align Right",
      "textColor": "Text Color",
      "backgroundColor": "Background Color",
      "noChanges": "No changes to save",
      "unsavedChanges": "You have unsaved changes. Leave anyway?",
      "saveDialog": {
        "title": "Save Annotated Slide",
        "description": "Choose how to save your changes",
        "replaceOriginal": "Replace original slide",
        "replaceWarning": "This will permanently overwrite the original image.",
        "saveAsNew": "Save as new slide",
        "saveAsNewDescription": "Creates a new slide and keeps the original."
      },
      "success": {
        "updated": "Slide updated successfully",
        "created": "New annotated slide created"
      },
      "errors": {
        "loadFailed": "Failed to load image",
        "saveFailed": "Failed to save annotated slide",
        "uploadFailed": "Upload failed. Please try again.",
        "imageNotFound": "Image not found",
        "storageFull": "Storage full. Please contact your administrator."
      }
    }
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Add Fabric.js dependency: `pnpm add fabric`
2. Add TypeScript types: `pnpm add -D @types/fabric`
3. Create base `SlideAnnotationEditor` component
4. Set up fullscreen portal/modal
5. Load image onto Fabric.js canvas
6. Implement exit/cancel functionality

### Phase 2: Basic Drawing Tools
1. Create `AnnotationToolbar` component
2. Implement tool selection state
3. Add Pen tool with width/color controls
4. Add basic Shapes (rectangle, circle)
5. Test object selection, move, resize, delete

### Phase 3: Advanced Tools
1. Implement Text tool with IText
2. Create `AnnotationTextPanel` for formatting
3. Add Arrow and Line shapes
4. Implement Highlighter tool
5. Test all tools on various images

### Phase 4: Color System
1. Create `AnnotationColorPicker` component
2. Implement preset color palette
3. Add custom color picker
4. Implement recent colors storage
5. Test color application to all object types

### Phase 5: Undo/Redo
1. Set up history state management
2. Implement state capture on actions
3. Add Undo/Redo functions
4. Add keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
5. Test history with all tool types

### Phase 6: Save Functionality
1. Create `SaveAnnotationDialog` component
2. Implement canvas export to PNG
3. Add "Replace original" save path
4. Add "Save as new" save path
5. Integrate with Supabase storage service
6. Add error handling and loading states

### Phase 7: Integration & Polish
1. Add "Annotate" button to `MediaDetailDialog`
2. Wire up open/close flow
3. Add loading states and spinners
4. Implement mobile responsive design
5. Add keyboard shortcuts
6. Add accessibility features

### Phase 8: i18n & Testing
1. Add all translation strings to en.json
2. Add Spanish translations to es.json
3. Manual testing on desktop/tablet/mobile
4. Cross-browser testing (Chrome, Safari, Firefox, Edge)
5. Accessibility audit
6. Performance testing with large images

## Future Enhancements (Out of Scope for v1)

- **Layers panel:** Reorder objects, show/hide layers
- **Copy/paste:** Duplicate annotations
- **Templates:** Save annotation sets as reusable templates
- **Collaboration:** Real-time multi-user annotation
- **Animation:** Animate text/shapes appearing on slide
- **Advanced shapes:** Stars, polygons, callout boxes
- **Image filters:** Blur, brightness, contrast adjustments
- **Stickers/Icons:** Pre-made graphics library
- **Auto-save:** Periodic save to localStorage
- **Annotation history:** View previous versions, restore

## Success Metrics

- Users can successfully annotate images without confusion
- Save process is clear and prevents accidental overwrites
- Performance is smooth even with 10+ annotations
- Mobile experience is usable on tablets/phones
- No data loss during annotation sessions
- Positive user feedback on feature usefulness

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Fabric.js bundle size too large | Lazy load, code split, tree-shake |
| Performance issues with large images | Scale down for editing, export at full res |
| Complex UI overwhelming users | Progressive disclosure, tooltips, good defaults |
| Accidental overwrites | Default to "Save as new", clear warnings |
| Mobile UX poor | Bottom sheets, touch targets, responsive testing |
| Browser compatibility issues | Feature detection, polyfills, testing matrix |

---

**Document End**
