import { getSupabase } from '@/lib/supabase'
import type { Style, StyleInput } from '@/types/style'
import type { CSSProperties } from 'react'

// Convert database row to Style type
export function rowToStyle(row: any): Style {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    description: row.description,
    isBuiltin: row.is_builtin,
    fontFamily: row.font_family,
    fontSize: row.font_size,
    fontWeight: row.font_weight,
    textColor: row.text_color,
    textBoxLeft: Number(row.text_box_left),
    textBoxTop: Number(row.text_box_top),
    textBoxWidth: Number(row.text_box_width),
    textBoxHeight: Number(row.text_box_height),
    textAlign: row.text_align,
    verticalAlign: row.vertical_align,
    maxLines: row.max_lines,
    lineHeight: row.line_height,
    textShadow: row.text_shadow,
    backgroundOverlay: Number(row.background_overlay),
    showSectionLabel: row.show_section_label,
    showCopyright: row.show_copyright,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Get all styles available to a church
export async function getStyles(churchId?: string): Promise<Style[]> {
  const supabase = getSupabase()

  let query = supabase.from('styles').select('*')

  if (churchId) {
    query = query.or(`is_builtin.eq.true,church_id.eq.${churchId}`)
  } else {
    query = query.eq('is_builtin', true)
  }

  const { data, error } = await query.order('is_builtin', { ascending: false }).order('name')

  if (error) throw error
  return (data || []).map(rowToStyle)
}

// Get a single style by ID
export async function getStyleById(id: string): Promise<Style | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('styles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return rowToStyle(data)
}

// Create a new style
export async function createStyle(churchId: string, input: StyleInput): Promise<Style> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('styles')
    .insert({
      church_id: churchId,
      name: input.name,
      description: input.description || null,
      is_builtin: false,
      font_family: input.fontFamily || 'Inter',
      font_size: input.fontSize || '3rem',
      font_weight: input.fontWeight || '500',
      text_color: input.textColor || '#ffffff',
      text_box_left: input.textBoxLeft ?? 10,
      text_box_top: input.textBoxTop ?? 10,
      text_box_width: input.textBoxWidth ?? 80,
      text_box_height: input.textBoxHeight ?? 80,
      text_align: input.textAlign || 'center',
      vertical_align: input.verticalAlign || 'center',
      max_lines: input.maxLines ?? 4,
      line_height: input.lineHeight || '1.4',
      text_shadow: input.textShadow ?? '0 2px 4px rgba(0,0,0,0.5)',
      background_overlay: input.backgroundOverlay ?? 0.3,
      show_section_label: input.showSectionLabel ?? true,
      show_copyright: input.showCopyright ?? true,
    })
    .select()
    .single()

  if (error) throw error
  return rowToStyle(data)
}

// Update a style
export async function updateStyle(id: string, input: Partial<StyleInput>): Promise<Style> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.fontFamily !== undefined) updateData.font_family = input.fontFamily
  if (input.fontSize !== undefined) updateData.font_size = input.fontSize
  if (input.fontWeight !== undefined) updateData.font_weight = input.fontWeight
  if (input.textColor !== undefined) updateData.text_color = input.textColor
  if (input.textBoxLeft !== undefined) updateData.text_box_left = input.textBoxLeft
  if (input.textBoxTop !== undefined) updateData.text_box_top = input.textBoxTop
  if (input.textBoxWidth !== undefined) updateData.text_box_width = input.textBoxWidth
  if (input.textBoxHeight !== undefined) updateData.text_box_height = input.textBoxHeight
  if (input.textAlign !== undefined) updateData.text_align = input.textAlign
  if (input.verticalAlign !== undefined) updateData.vertical_align = input.verticalAlign
  if (input.maxLines !== undefined) updateData.max_lines = input.maxLines
  if (input.lineHeight !== undefined) updateData.line_height = input.lineHeight
  if (input.textShadow !== undefined) updateData.text_shadow = input.textShadow
  if (input.backgroundOverlay !== undefined) updateData.background_overlay = input.backgroundOverlay
  if (input.showSectionLabel !== undefined) updateData.show_section_label = input.showSectionLabel
  if (input.showCopyright !== undefined) updateData.show_copyright = input.showCopyright

  const { data, error } = await supabase
    .from('styles')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToStyle(data)
}

// Delete a style
export async function deleteStyle(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('styles')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Convert style to CSS for the bounding box container
export function styleToBoundingBoxCSS(style: Style): CSSProperties {
  return {
    position: 'absolute',
    left: `${style.textBoxLeft}%`,
    top: `${style.textBoxTop}%`,
    width: `${style.textBoxWidth}%`,
    height: `${style.textBoxHeight}%`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      style.verticalAlign === 'top' ? 'flex-start' :
      style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    alignItems:
      style.textAlign === 'left' ? 'flex-start' :
      style.textAlign === 'right' ? 'flex-end' : 'center',
    textAlign: style.textAlign,
  }
}

// Convert style to CSS for the text itself
export function styleToTextCSS(style: Style): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    color: style.textColor,
    lineHeight: style.lineHeight,
    textShadow: style.textShadow || undefined,
  }
}

// Get overlay CSS
export function styleToOverlayCSS(style: Style): CSSProperties {
  if (style.backgroundOverlay <= 0) return {}
  return {
    backgroundColor: `rgba(0, 0, 0, ${style.backgroundOverlay})`,
  }
}
