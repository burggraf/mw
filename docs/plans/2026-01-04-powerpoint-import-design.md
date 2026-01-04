# PowerPoint Import Design

## Overview

Add the ability to import PowerPoint (.pptx) presentations as slide images, similar to the existing Google Slides import feature.

## Status: Implemented

## User Flow

1. **File Selection** - User clicks Import → PowerPoint, dialog opens with file drop zone
2. **Preview** - Shows presentation title, slide count, folder name input
3. **Processing** - Renders and uploads each slide with progress bar
4. **Complete** - Success message with "View Folder" button

## Technical Architecture

### New Files

- `src/components/media/PowerPointImportDialog.tsx` - Dialog component
- `src/lib/powerpoint.ts` - PPTX parsing and rendering utilities

### Dependencies

- `pptx-preview` - Pure frontend PPTX preview library (renders to HTML)
- `html2canvas` - Captures HTML elements as PNG images

### Processing Flow

```
User drops .pptx file
       ↓
Parse PPTX metadata (title, slide count) using pptx-preview
       ↓
Show preview, user confirms
       ↓
For each slide:
  1. pptx-preview renders slide to hidden div
  2. html2canvas captures div as PNG blob
  3. Generate thumbnail
  4. Upload both to Supabase storage
  5. Create media record
       ↓
Complete - show folder
```

## Error Handling

| Error | User Message |
|-------|-------------|
| Invalid file type | "Please select a .pptx file" |
| Corrupted/unreadable PPTX | "Unable to read this file. It may be corrupted." |
| Slide render failure | Continue with other slides, log warning |
| Upload failure | Retry once, then show error for that slide |

## Limitations

- Only `.pptx` supported (not legacy `.ppt`)
- Complex animations/transitions not preserved (static images)
- Some fonts may render differently if not available in browser
- Embedded videos become static frames

## Translation Keys

```
slides.powerpoint.import
slides.powerpoint.importDescription
slides.powerpoint.selectFile
slides.powerpoint.dropzone
slides.powerpoint.processing
slides.powerpoint.errors.invalidFile
slides.powerpoint.errors.corrupted
slides.powerpoint.errors.renderFailed
```
