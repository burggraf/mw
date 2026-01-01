import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showText?: boolean
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
}

export function Logo({ size = 'md', className, showText = false }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src="/icon.png"
        alt="Mobile Worship"
        className={cn(sizeClasses[size], 'rounded-lg')}
      />
      {showText && (
        <span className="font-semibold text-foreground">Mobile Worship</span>
      )}
    </div>
  )
}
