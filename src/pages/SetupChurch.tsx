import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SetupChurchPage() {
  const { t } = useTranslation()
  const { user, createChurch, signOut } = useAuth()
  const navigate = useNavigate()

  const [churchName, setChurchName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!churchName.trim()) {
      setError('Please enter a church name')
      return
    }

    setIsLoading(true)

    try {
      await createChurch(churchName)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create church')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('church.create')}</CardTitle>
          <CardDescription>
            Welcome{user?.email ? `, ${user.email}` : ''}! Set up your church to get started.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="churchName">{t('church.name')}</Label>
              <Input
                id="churchName"
                type="text"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="e.g., First Baptist Church"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('common.loading') : t('church.create')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm"
              onClick={handleSignOut}
            >
              {t('auth.signOut')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
