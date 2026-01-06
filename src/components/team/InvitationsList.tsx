import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resendInvitation, cancelInvitation } from '@/services/invitations'
import type { Invitation } from '@/types/team'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MoreHorizontal,
  Send,
  Copy,
  Trash2,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface InvitationsListProps {
  invitations: Invitation[]
  onInvitationUpdated: () => void
  loading: boolean
}

export function InvitationsList({
  invitations,
  onInvitationUpdated,
  loading,
}: InvitationsListProps) {
  const { t, i18n } = useTranslation()

  const [inviteToCancel, setInviteToCancel] = useState<Invitation | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)

  const handleCopyLink = async (invitation: Invitation) => {
    const url = `${window.location.origin}/accept-invite?token=${invitation.token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('team.linkCopied'))
    } catch (error) {
      console.error('Failed to copy link:', error)
      toast.error(t('common.error'))
    }
  }

  const handleResend = async (invitation: Invitation) => {
    setResending(invitation.id)
    try {
      const language = i18n.language === 'es' ? 'es' : 'en'
      await resendInvitation(invitation.id, language)
      toast.success(t('team.invitationResent'))
      onInvitationUpdated()
    } catch (error: any) {
      console.error('Failed to resend invitation:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setResending(null)
    }
  }

  const handleCancel = async () => {
    if (!inviteToCancel) return

    setCanceling(true)
    try {
      await cancelInvitation(inviteToCancel.id)
      toast.success(t('team.invitationCanceled'))
      setInviteToCancel(null)
      onInvitationUpdated()
    } catch (error: any) {
      console.error('Failed to cancel invitation:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setCanceling(false)
    }
  }

  const getStatusBadge = (invitation: Invitation) => {
    switch (invitation.status) {
      case 'accepted':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('team.status.accepted')}
          </Badge>
        )
      case 'expired':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            {t('team.status.expired')}
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            {t('team.status.pending')}
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('team.noInvitations')}
      </div>
    )
  }

  return (
    <>
      <Table data-testid="invitations-list">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">{t('auth.email')}</TableHead>
            <TableHead>{t('team.role')}</TableHead>
            <TableHead>{t('team.status')}</TableHead>
            <TableHead>{t('team.expires')}</TableHead>
            <TableHead className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => {
            const isPending = invitation.status === 'pending'

            return (
              <TableRow key={invitation.id} data-testid="invitation-row">
                <TableCell className="font-medium" data-testid="invitation-email">{invitation.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t(`team.roles.${invitation.role}`)}
                  </Badge>
                </TableCell>
                <TableCell>{getStatusBadge(invitation)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(invitation.expiresAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {isPending && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleCopyLink(invitation)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t('team.copyLink')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleResend(invitation)}
                          disabled={resending === invitation.id}
                        >
                          {resending === invitation.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          {t('team.resendInvitation')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setInviteToCancel(invitation)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('team.cancelInvitation')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!inviteToCancel}
        onOpenChange={(open) => !open && setInviteToCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.cancelInvitationTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.cancelInvitationDescription', {
                email: inviteToCancel?.email,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={canceling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {canceling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.cancelInvitation')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
