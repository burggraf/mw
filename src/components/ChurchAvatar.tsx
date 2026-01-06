import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface ChurchAvatarProps {
  name: string
  avatarUrl?: string | null
  className?: string
  fallbackClassName?: string
}

function getChurchInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function ChurchAvatar({ name, avatarUrl, className, fallbackClassName }: ChurchAvatarProps) {
  return (
    <Avatar className={cn('h-8 w-8', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className={cn('bg-sidebar-primary text-sidebar-primary-foreground text-xs', fallbackClassName)}>
        {getChurchInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
