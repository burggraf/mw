import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useChurch } from '@/contexts/ChurchContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SetupChurchPage() {
  const { t } = useTranslation()
  const { user, createChurch, signOut } = useAuth()
  const { refreshChurches } = useChurch()
  const navigate = useNavigate()

  const [churchName, setChurchName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [debugError, setDebugError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[SetupChurch] Form submitted, churchName:', churchName)
    setError(null)

    if (!churchName.trim()) {
      console.error('[SetupChurch] Church name is empty')
      setError('Please enter a church name')
      return
    }

    setIsLoading(true)
    console.log('[SetupChurch] Creating church:', churchName)

    try {
      await createChurch(churchName)
      console.log('[SetupChurch] Church created successfully')
      // Refresh ChurchContext to load the newly created church
      await refreshChurches()
      console.log('[SetupChurch] Churches refreshed, navigating to dashboard')
      navigate('/dashboard')
    } catch (err: any) {
      console.error('[SetupChurch] Failed to create church:', err)
      const errorMsg = err?.message || 'Failed to create church'
      const errorCode = err?.code || 'UNKNOWN'
      const errorDetails = err?.details || err?.hint || ''
      console.error('[SetupChurch] Error:', { message: errorMsg, code: errorCode, details: errorDetails })

      setError(errorMsg)
      setDebugError(`${errorCode}: ${errorMsg}\n${errorDetails}`)
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
            {debugError && (
              <div className="bg-gray-100 text-gray-800 text-xs p-3 rounded-md font-mono whitespace-pre-wrap" data-testid="debug-error">
                {debugError}
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
