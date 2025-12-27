// Display context for different presentation scenarios
export type DisplayClass = 'audience' | 'stage' | 'lobby'

// Text alignment options
export type TextAlign = 'left' | 'center' | 'right'
export type VerticalAlign = 'top' | 'center' | 'bottom'

// Style defines how lyrics appear on a background
export interface Style {
  id: string
  churchId: string | null
  name: string
  description: string | null
  isBuiltin: boolean

  // Font settings
  fontFamily: string
  fontSize: string
  fontWeight: string
  textColor: string

  // Bounding box (percentages 0-100)
  textBoxLeft: number
  textBoxTop: number
  textBoxWidth: number
  textBoxHeight: number
  textAlign: TextAlign
  verticalAlign: VerticalAlign

  // Chunking
  maxLines: number

  // Effects
  lineHeight: string
  textShadow: string | null
  backgroundOverlay: number

  // Display options
  showSectionLabel: boolean
  showCopyright: boolean

  createdAt: string
  updatedAt: string
}

// For creating/updating styles
export interface StyleInput {
  name: string
  description?: string
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  textColor?: string
  textBoxLeft?: number
  textBoxTop?: number
  textBoxWidth?: number
  textBoxHeight?: number
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  maxLines?: number
  lineHeight?: string
  textShadow?: string | null
  backgroundOverlay?: number
  showSectionLabel?: boolean
  showCopyright?: boolean
}

// Computed slide after chunking
export interface Slide {
  sectionId: string
  sectionLabel: string
  subIndex: number        // 0, 1, 2 for a, b, c
  totalSubSlides: number
  lines: string[]
  displayLabel: string    // "Verse 1 (1/3)" or "V1a"
}

// Built-in style IDs
export const BUILTIN_STYLE_IDS = {
  centeredWhite: 'b0000000-0000-0000-0000-000000000001',
  centeredBlack: 'b0000000-0000-0000-0000-000000000002',
  lowerThird: 'b0000000-0000-0000-0000-000000000003',
  largeStage: 'b0000000-0000-0000-0000-000000000004',
} as const

// Built-in background IDs
export const BUILTIN_BACKGROUND_IDS = {
  black: 'c0000000-0000-0000-0000-000000000001',
  white: 'c0000000-0000-0000-0000-000000000002',
} as const
