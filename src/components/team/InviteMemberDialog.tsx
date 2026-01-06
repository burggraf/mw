import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { createAndSendInvitation } from '@/services/invitations'
import type { UserRole, CreateInvitationInput } from '@/types/team'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteSent: () => void
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onInviteSent,
}: InviteMemberDialogProps) {
  const { t, i18n } = useTranslation()
  const { currentChurch } = useChurch()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('operator')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentChurch || !email.trim()) return

    setIsSubmitting(true)
    try {
      const input: CreateInvitationInput = {
        email: email.trim().toLowerCase(),
        role,
      }
      const language = i18n.language === 'es' ? 'es' : 'en'
      await createAndSendInvitation(currentChurch.id, input, language)
      toast.success(t('team.invitationSent'))
      setEmail('')
      setRole('operator')
      onOpenChange(false)
      onInviteSent()
    } catch (error: any) {
      console.error('Failed to send invitation:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('team.inviteMember')}</DialogTitle>
            <DialogDescription>
              {t('team.inviteDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">{t('team.role')}</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as UserRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger data-testid="role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" data-testid="role-option-admin">
                    <div className="flex flex-col">
                      <span>{t('team.roles.admin')}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('team.roleDescriptions.admin')}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="editor" data-testid="role-option-editor">
                    <div className="flex flex-col">
                      <span>{t('team.roles.editor')}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('team.roleDescriptions.editor')}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="operator" data-testid="role-option-operator">
                    <div className="flex flex-col">
                      <span>{t('team.roles.operator')}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('team.roleDescriptions.operator')}
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !email.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.sendInvitation')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
