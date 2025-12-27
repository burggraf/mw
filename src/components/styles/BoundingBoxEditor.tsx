import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface BoundingBox {
  left: number   // percentage 0-100
  top: number
  width: number
  height: number
}

interface BoundingBoxEditorProps {
  value: BoundingBox
  onChange: (box: BoundingBox) => void
  backgroundUrl?: string
  backgroundColor?: string
  className?: string
}

export function BoundingBoxEditor({
  value,
  onChange,
  backgroundUrl,
  backgroundColor,
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

  return (
    <div
      ref={containerRef}
      className={cn('relative aspect-video rounded-lg overflow-hidden', className)}
      style={bgStyle}
    >
      {/* Bounding box */}
      <div
        className={cn(
          'absolute border-2 border-dashed border-blue-400 bg-blue-400/10',
          dragging && 'border-blue-500 bg-blue-500/20'
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
        {/* Resize handle */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize"
          onMouseDown={(e) => handleMouseDown(e, 'resize')}
        />

        {/* Sample text preview */}
        <div className="absolute inset-2 flex items-center justify-center text-white/50 text-sm pointer-events-none">
          Lyrics appear here
        </div>
      </div>
    </div>
  )
}
