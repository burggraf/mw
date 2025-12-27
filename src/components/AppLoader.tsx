import { useTranslation } from 'react-i18next'
import { useConfig } from '@/contexts/ConfigContext'

interface AppLoaderProps {
  children: React.ReactNode
}

export function AppLoader({ children }: AppLoaderProps) {
  const { t } = useTranslation()
  const { isLoading, error } = useConfig()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-destructive">{t('common.error')}</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
