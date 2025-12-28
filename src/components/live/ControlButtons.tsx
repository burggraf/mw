import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ControlButtonsProps {
  currentIndex: number
  totalSlides: number
  onPrevious: () => void
  onNext: () => void
}

export function ControlButtons({
  currentIndex,
  totalSlides,
  onPrevious,
  onNext
}: ControlButtonsProps) {
  const canGoPrevious = currentIndex > 0
  const canGoNext = currentIndex < totalSlides - 1

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Previous button */}
      <Button
        variant="outline"
        size="lg"
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className="flex-1"
      >
        <ChevronLeft className="w-5 h-5 mr-2" />
        Previous
        <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
          ←
        </span>
      </Button>

      {/* Slide counter */}
      <div className="flex-shrink-0 text-center min-w-[100px]">
        <div className="text-sm font-medium">
          {totalSlides > 0 ? currentIndex + 1 : 0} / {totalSlides}
        </div>
        {totalSlides === 0 && (
          <div className="text-xs text-muted-foreground">No slides</div>
        )}
      </div>

      {/* Next button */}
      <Button
        variant="outline"
        size="lg"
        onClick={onNext}
        disabled={!canGoNext}
        className="flex-1"
      >
        <span className="mr-auto text-xs text-muted-foreground hidden sm:inline">
          →
        </span>
        Next
        <ChevronRight className="w-5 h-5 ml-2" />
      </Button>
    </div>
  )
}
