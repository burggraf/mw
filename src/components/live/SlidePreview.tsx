import { useTranslation } from 'react-i18next'
import type { Slide } from '@/types/live'

interface SlidePreviewProps {
  slide: Slide | null
  backgroundUrl?: string | null
}

export function SlidePreview({ slide, backgroundUrl }: SlidePreviewProps) {
  const { t } = useTranslation()
  return (
    <div className="aspect-video w-full rounded-lg overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 relative">
      {/* Background image with gradient fallback */}
      {backgroundUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        >
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900" />
      )}

      {/* Slide content */}
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <div className="text-center max-w-4xl">
          {slide?.sectionLabel && (
            <div className="text-sm uppercase tracking-wider text-white/70 mb-4 font-medium">
              {slide.sectionLabel}
            </div>
          )}
          {slide?.text ? (
            <div className="text-white text-2xl md:text-3xl font-semibold leading-relaxed whitespace-pre-wrap drop-shadow-lg">
              {slide.text}
            </div>
          ) : (
            <div className="text-white/50 text-xl">{t('live.noSlideSelected')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
