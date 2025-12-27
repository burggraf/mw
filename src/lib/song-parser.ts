export interface SongSection {
  id: string        // e.g., "verse-1", "chorus", "bridge"
  type: string      // e.g., "verse", "chorus", "bridge"
  label: string     // e.g., "Verse 1", "Chorus", "Bridge"
  content: string   // The actual lyrics
}

export interface SongMetadata {
  title: string
  author?: string
  copyright?: string
  ccliNumber?: string
}

export interface ParsedSong {
  metadata: SongMetadata
  sections: SongSection[]
  raw: string  // Original markdown content
}

/**
 * Simple YAML frontmatter parser (browser-compatible)
 * Accepts 3 or more dashes as delimiter (---, ----, ----------, etc.)
 */
function parseFrontmatter(markdown: string): { data: Record<string, string>; content: string } {
  // Normalize line endings first
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Match 3+ dashes as frontmatter delimiters
  const frontmatterRegex = /^-{3,}\s*\n([\s\S]*?)\n-{3,}\s*\n?([\s\S]*)$/
  const match = normalized.match(frontmatterRegex)

  if (!match) {
    return { data: {}, content: markdown }
  }

  const yamlContent = match[1]
  const content = match[2]

  const data: Record<string, string> = {}
  const lines = yamlContent.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      let value = line.slice(colonIndex + 1).trim()
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      data[key] = value
    }
  }

  return { data, content }
}

/**
 * Parse a song from markdown format with YAML frontmatter
 */
export function parseSong(markdown: string): ParsedSong {
  const { data, content } = parseFrontmatter(markdown)

  const metadata: SongMetadata = {
    title: data.title || 'Untitled',
    author: data.author,
    copyright: data.copyright,
    ccliNumber: data.ccli_number,
  }

  const sections = parseSections(content)

  return {
    metadata,
    sections,
    raw: markdown,
  }
}

/**
 * Parse markdown content into sections based on # headers
 */
function parseSections(content: string): SongSection[] {
  const sections: SongSection[] = []
  // Normalize line endings (handle Windows \r\n)
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalizedContent.split('\n')

  let currentSection: SongSection | null = null
  let contentLines: string[] = []
  let preHeaderLines: string[] = []  // Lines before any header

  for (const line of lines) {
    // Match # followed by optional space and section name
    const headerMatch = line.match(/^#\s*(.+)$/)

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim()
        sections.push(currentSection)
      }

      // Start new section
      const label = headerMatch[1].trim()
      const { type, id } = parseSectionHeader(label, sections)

      currentSection = {
        id,
        type,
        label,
        content: '',
      }
      contentLines = []
    } else if (currentSection) {
      contentLines.push(line)
    } else {
      // Collect lines before any header
      preHeaderLines.push(line)
    }
  }

  // Don't forget the last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim()
    sections.push(currentSection)
  }

  // If no sections found but we have content, create a default "Lyrics" section
  if (sections.length === 0) {
    const allContent = preHeaderLines.join('\n').trim()
    if (allContent) {
      sections.push({
        id: 'lyrics',
        type: 'lyrics',
        label: 'Lyrics',
        content: allContent,
      })
    }
  }

  return sections
}

/**
 * Parse a section header like "Verse 1" into type and id
 */
function parseSectionHeader(label: string, existingSections: SongSection[]): { type: string; id: string } {
  const lowerLabel = label.toLowerCase()

  // Common section types
  const typePatterns: { pattern: RegExp; type: string }[] = [
    { pattern: /^verse\s*(\d*)$/i, type: 'verse' },
    { pattern: /^chorus\s*(\d*)$/i, type: 'chorus' },
    { pattern: /^bridge\s*(\d*)$/i, type: 'bridge' },
    { pattern: /^pre-?chorus\s*(\d*)$/i, type: 'prechorus' },
    { pattern: /^intro\s*(\d*)$/i, type: 'intro' },
    { pattern: /^outro\s*(\d*)$/i, type: 'outro' },
    { pattern: /^tag\s*(\d*)$/i, type: 'tag' },
    { pattern: /^vamp\s*(\d*)$/i, type: 'vamp' },
    { pattern: /^interlude\s*(\d*)$/i, type: 'interlude' },
    { pattern: /^ending\s*(\d*)$/i, type: 'ending' },
  ]

  for (const { pattern, type } of typePatterns) {
    const match = lowerLabel.match(pattern)
    if (match) {
      const number = match[1] || ''
      const id = number ? `${type}-${number}` : generateUniqueId(type, existingSections)
      return { type, id }
    }
  }

  // Unknown type - use label as type
  const type = lowerLabel.replace(/\s+/g, '-')
  return { type, id: generateUniqueId(type, existingSections) }
}

/**
 * Generate a unique ID for a section type
 */
function generateUniqueId(type: string, existingSections: SongSection[]): string {
  const existingOfType = existingSections.filter(s => s.type === type)
  if (existingOfType.length === 0) {
    return type
  }
  return `${type}-${existingOfType.length + 1}`
}

/**
 * Convert a ParsedSong back to markdown format
 */
export function songToMarkdown(song: {
  metadata: SongMetadata
  sections: SongSection[]
}): string {
  const frontmatterLines: string[] = []

  frontmatterLines.push(`title: ${song.metadata.title}`)
  if (song.metadata.author) frontmatterLines.push(`author: ${song.metadata.author}`)
  if (song.metadata.copyright) frontmatterLines.push(`copyright: ${song.metadata.copyright}`)
  if (song.metadata.ccliNumber) frontmatterLines.push(`ccli_number: ${song.metadata.ccliNumber}`)

  const sectionsMarkdown = song.sections
    .map(section => `# ${section.label}\n${section.content}`)
    .join('\n\n')

  return `---\n${frontmatterLines.join('\n')}\n---\n\n${sectionsMarkdown}\n`
}

/**
 * Generate a default arrangement from sections (all sections in order)
 */
export function generateDefaultArrangement(sections: SongSection[]): string[] {
  return sections.map(s => s.id)
}

/**
 * Extract just the lyrics content (without frontmatter) for editing
 */
export function extractLyricsContent(markdown: string): string {
  const { content } = parseFrontmatter(markdown)
  return content.trim()
}

/**
 * Build full markdown from metadata and lyrics content
 */
export function buildMarkdownFromParts(metadata: SongMetadata, lyricsContent: string): string {
  const frontmatterLines: string[] = []

  frontmatterLines.push(`title: ${metadata.title}`)
  if (metadata.author) frontmatterLines.push(`author: ${metadata.author}`)
  if (metadata.copyright) frontmatterLines.push(`copyright: ${metadata.copyright}`)
  if (metadata.ccliNumber) frontmatterLines.push(`ccli_number: ${metadata.ccliNumber}`)

  return `---\n${frontmatterLines.join('\n')}\n---\n\n${lyricsContent}\n`
}
