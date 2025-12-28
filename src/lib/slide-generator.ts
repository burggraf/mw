import type { Song } from '@/types/song'
import type { EventItemWithData } from '@/types/event'
import type { Slide } from '@/types/live'
import { parseSongContent } from './song-parser'

/**
 * Generate slides from a song with event-specific customizations
 */
export function generateSlides(
  song: Song,
  customizations?: { arrangement?: string[] }
): Slide[] {
  const parsed = parseSongContent(song.content)

  // Determine which sections to include and in what order
  const arrangement = customizations?.arrangement || song.arrangements?.default || parsed.sections.map(s => s.id)

  const slides: Slide[] = []

  for (const sectionId of arrangement) {
    const section = parsed.sections.find(s => s.id === sectionId)
    if (!section) continue

    // Each line in the section becomes a slide
    for (const line of section.lines) {
      slides.push({
        text: line,
        sectionLabel: section.label,
        backgroundId: song.audienceBackgroundId || undefined,
      })
    }
  }

  return slides
}

/**
 * Generate slides from an event item (song or media)
 */
export function generateSlidesFromItem(item: EventItemWithData): Slide[] {
  if (item.itemType === 'song' && item.song) {
    return generateSlides(item.song, item.customizations)
  }

  if (item.itemType === 'media' && item.media) {
    return [{
      text: '',
      backgroundId: item.media.id,
    }]
  }

  return []
}

/**
 * Get all slides for an event's items
 */
export function generateEventSlides(items: EventItemWithData[]): Map<string, Slide[]> {
  const slidesMap = new Map<string, Slide[]>()

  for (const item of items) {
    slidesMap.set(item.id, generateSlidesFromItem(item))
  }

  return slidesMap
}

/**
 * Find the slide index for a given section in a song
 */
export function findSlideIndex(
  song: Song,
  sectionId: string,
  customizations?: { arrangement?: string[] }
): number {
  const slides = generateSlides(song, customizations)
  return slides.findIndex(s => s.sectionLabel === sectionId)
}
