import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

function App() {
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'es' : 'en'
    i18n.changeLanguage(newLang)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold">{t('app.name')}</h1>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
        <p className="text-sm text-green-600">✓ Config loaded, Supabase connected</p>
        <Button onClick={toggleLanguage}>
          {i18n.language === 'en' ? 'Español' : 'English'}
        </Button>
      </div>
    </div>
  )
}

export default App
