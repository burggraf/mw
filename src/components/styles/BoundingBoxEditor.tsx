import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface BoundingBox {
  left: number   // percentage 0-100
  top: number
  width: number
  height: number
}

interface TextStyle {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  textColor?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  lineHeight?: string
  textShadow?: string
  maxLines?: number
}

interface BoundingBoxEditorProps {
  value: BoundingBox
  onChange: (box: BoundingBox) => void
  backgroundUrl?: string
  backgroundColor?: string
  backgroundOverlay?: number
  textStyle?: TextStyle
  className?: string
}

const SAMPLE_LYRICS = [
  'Amazing grace, how sweet the sound',
  'That saved a wretch like me',
  'I once was lost, but now I am found',
  'Was blind, but now I see',
]

export function BoundingBoxEditor({
  value,
  onChange,
  backgroundUrl,
  backgroundColor,
  backgroundOverlay = 0,
  textStyle,
  className,
}: BoundingBoxEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [boxStart, setBoxStart] = useState(value)

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(mode)
    setDragStart({ x: e.clientX, y: e.clientY })
    setBoxStart(value)
  }, [value])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100

    if (dragging === 'move') {
      onChange({
        ...boxStart,
        left: Math.max(0, Math.min(100 - boxStart.width, boxStart.left + deltaX)),
        top: Math.max(0, Math.min(100 - boxStart.height, boxStart.top + deltaY)),
      })
    } else if (dragging === 'resize') {
      onChange({
        ...boxStart,
        width: Math.max(10, Math.min(100 - boxStart.left, boxStart.width + deltaX)),
        height: Math.max(10, Math.min(100 - boxStart.top, boxStart.height + deltaY)),
      })
    }
  }, [dragging, dragStart, boxStart, onChange])

  const handleMouseUp = useCallback(() => {
    setDragging(null)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const bgStyle = backgroundColor
    ? { backgroundColor }
    : backgroundUrl
    ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: '#1a1a1a' }

  // Determine how many lines to show based on maxLines
  const linesToShow = textStyle?.maxLines
    ? SAMPLE_LYRICS.slice(0, textStyle.maxLines)
    : SAMPLE_LYRICS

  // Calculate vertical alignment
  const verticalAlignClass = {
    top: 'justify-start',
    center: 'justify-center',
    bottom: 'justify-end',
  }[textStyle?.verticalAlign || 'center']

  return (
    <div
      ref={containerRef}
      className={cn('relative aspect-video rounded-lg overflow-hidden', className)}
      style={bgStyle}
    >
      {/* Background overlay */}
      {backgroundOverlay > 0 && (
        <div
          className="absolute inset-0 bg-black pointer-events-none"
          style={{ opacity: backgroundOverlay }}
        />
      )}

      {/* Bounding box */}
      <div
        className={cn(
          'absolute border-2 border-dashed border-blue-400',
          dragging && 'border-blue-500'
        )}
        style={{
          left: `${value.left}%`,
          top: `${value.top}%`,
          width: `${value.width}%`,
          height: `${value.height}%`,
          cursor: 'move',
        }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        {/* Styled lyrics preview */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col pointer-events-none overflow-hidden p-2',
            verticalAlignClass
          )}
          style={{
            fontFamily: textStyle?.fontFamily || 'Inter',
            fontSize: textStyle?.fontSize || '1rem',
            fontWeight: textStyle?.fontWeight || '600',
            color: textStyle?.textColor || '#ffffff',
            textAlign: textStyle?.textAlign || 'center',
            lineHeight: textStyle?.lineHeight || '1.4',
            textShadow: textStyle?.textShadow || 'none',
          }}
        >
          {linesToShow.map((line, i) => (
            <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis">
              {line}
            </div>
          ))}
        </div>

        {/* Resize handle */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize"
          onMouseDown={(e) => handleMouseDown(e, 'resize')}
        />
      </div>
    </div>
  )
}
