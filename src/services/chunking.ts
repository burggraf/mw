import type { SongSection } from '@/lib/song-parser'
import type { Slide, Style } from '@/types/style'
import type { Media } from '@/types/media'

// Calculate the minimum maxLines across all backgrounds
export function getMinMaxLines(backgrounds: (Media & { style?: Style | null })[]): number {
  const maxLinesValues = backgrounds
    .map(bg => bg.style?.maxLines)
    .filter((ml): ml is number => ml !== undefined && ml !== null)

  if (maxLinesValues.length === 0) return 4 // default

  return Math.min(...maxLinesValues)
}

// Split a section's content into chunks based on maxLines
export function chunkSection(
  section: SongSection,
  maxLines: number
): Slide[] {
  const lines = section.content.split('\n').filter(line => line.trim() !== '')

  if (lines.length <= maxLines) {
    // No chunking needed
    return [{
      sectionId: section.id,
      sectionLabel: section.label,
      subIndex: 0,
      totalSubSlides: 1,
      lines,
      displayLabel: section.label,
    }]
  }

  // Chunk into groups of maxLines
  const slides: Slide[] = []
  const totalChunks = Math.ceil(lines.length / maxLines)

  for (let i = 0; i < totalChunks; i++) {
    const startIdx = i * maxLines
    const chunkLines = lines.slice(startIdx, startIdx + maxLines)

    slides.push({
      sectionId: section.id,
      sectionLabel: section.label,
      subIndex: i,
      totalSubSlides: totalChunks,
      lines: chunkLines,
      displayLabel: `${section.label} (${i + 1}/${totalChunks})`,
    })
  }

  return slides
}

// Chunk all sections based on backgrounds
export function chunkSections(
  sections: SongSection[],
  backgrounds: (Media & { style?: Style | null })[]
): Slide[] {
  const maxLines = getMinMaxLines(backgrounds)

  return sections.flatMap(section => chunkSection(section, maxLines))
}

// Get short label for navigation (V1a, C1b, etc.)
export function getShortLabel(slide: Slide): string {
  if (slide.totalSubSlides === 1) {
    return getAbbreviation(slide.sectionLabel)
  }

  const subLetter = String.fromCharCode(97 + slide.subIndex)
  return `${getAbbreviation(slide.sectionLabel)}${subLetter}`
}

// Abbreviate section labels
function getAbbreviation(label: string): string {
  const lower = label.toLowerCase()

  if (lower.startsWith('verse')) return label.replace(/verse\s*/i, 'V')
  if (lower.startsWith('chorus')) return label.replace(/chorus\s*/i, 'C')
  if (lower.startsWith('bridge')) return label.replace(/bridge\s*/i, 'B')
  if (lower.startsWith('pre-chorus') || lower.startsWith('prechorus')) return label.replace(/pre-?chorus\s*/i, 'PC')
  if (lower.startsWith('intro')) return 'I'
  if (lower.startsWith('outro')) return 'O'
  if (lower.startsWith('tag')) return label.replace(/tag\s*/i, 'T')

  // Default: first letter + any number
  const match = label.match(/^(\w)\w*\s*(\d*)/)
  return match ? `${match[1].toUpperCase()}${match[2]}` : label.substring(0, 3)
}
