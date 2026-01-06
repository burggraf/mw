import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useChurch } from '@/contexts/ChurchContext'
import { getInvitationByToken, acceptInvitation } from '@/services/invitations'
import type { Invitation } from '@/types/team'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, CheckCircle, XCircle, AlertTriangle, Users } from 'lucide-react'
import { toast } from 'sonner'

export function AcceptInvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const { user, isLoading: authLoading, setHasChurch } = useAuth()
  const { refreshChurches } = useChurch()

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError(t('invite.noToken'))
      setLoading(false)
      return
    }

    loadInvitation()
  }, [token])

  const loadInvitation = async () => {
    if (!token) return

    try {
      setLoading(true)
      setError(null)
      const data = await getInvitationByToken(token)

      if (!data) {
        setError(t('invite.notFound'))
        return
      }

      if (data.status === 'accepted') {
        setError(t('invite.alreadyAccepted'))
        return
      }

      if (data.status === 'expired') {
        setError(t('invite.expired'))
        return
      }

      setInvitation(data)
    } catch (err: any) {
      console.error('Failed to load invitation:', err)
      setError(err.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!token) return

    setAccepting(true)
    try {
      const result = await acceptInvitation(token)
      setSuccess(true)
      setHasChurch(true)
      toast.success(t('invite.success', { church: result.churchName }))

      // Refresh churches list and redirect
      await refreshChurches()
      setTimeout(() => {
        navigate('/dashboard')
      }, 2000)
    } catch (err: any) {
      console.error('Failed to accept invitation:', err)
      toast.error(err.message || t('common.error'))
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  // Show loading while auth is initializing
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>{t('invite.errorTitle')}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link to="/">{t('common.backToHome')}</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Show success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle>{t('invite.successTitle')}</CardTitle>
            <CardDescription>{t('invite.successDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{t('invite.redirecting')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Not logged in - prompt to login or signup
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>{t('invite.title')}</CardTitle>
            <CardDescription>
              {t('invite.churchInvitation', { church: (invitation as any)?.churchName })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">{t('invite.invitedAs')}</p>
              <Badge variant="secondary" className="text-base">
                {t(`team.roles.${invitation?.role}`)}
              </Badge>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('invite.loginRequired')}</AlertTitle>
              <AlertDescription>
                {t('invite.loginRequiredDescription', { email: invitation?.email })}
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button asChild className="w-full">
              <Link to={`/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}>
                {t('auth.signIn')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/signup?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}&email=${encodeURIComponent(invitation?.email || '')}`}>
                {t('auth.signUp')}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Logged in but wrong email
  if (user.email?.toLowerCase() !== invitation?.email.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            </div>
            <CardTitle>{t('invite.wrongEmailTitle')}</CardTitle>
            <CardDescription>
              {t('invite.wrongEmailDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                {t('invite.wrongEmailDetails', {
                  inviteEmail: invitation?.email,
                  currentEmail: user.email,
                })}
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link to="/dashboard">{t('common.backToDashboard')}</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Logged in with correct email - show accept button
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="invitation-details">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('invite.title')}</CardTitle>
          <CardDescription data-testid="church-name">
            {t('invite.churchInvitation', { church: (invitation as any)?.churchName })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">{t('invite.invitedAs')}</p>
            <Badge variant="secondary" className="text-base" data-testid="invitation-role">
              {t(`team.roles.${invitation?.role}`)}
            </Badge>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>{t('invite.asUser', { email: user.email })}</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full"
            data-testid="accept-button"
          >
            {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('invite.accept')}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/dashboard">{t('common.cancel')}</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
