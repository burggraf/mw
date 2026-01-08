import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getChurchMembers } from '@/services/memberships'
import { getPendingInvitations } from '@/services/invitations'
import type { Membership, Invitation } from '@/types/team'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamMembersList } from '@/components/team/TeamMembersList'
import { InvitationsList } from '@/components/team/InvitationsList'
import { InviteMemberDialog } from '@/components/team/InviteMemberDialog'
import { UserPlus, Users, Mail } from 'lucide-react'
import { toast } from 'sonner'

export function TeamPage() {
  const { t } = useTranslation()
  const { currentChurch, isAdmin } = useChurch()

  const [members, setMembers] = useState<Membership[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [loadingInvitations, setLoadingInvitations] = useState(true)
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  const loadMembers = async () => {
    if (!currentChurch) {
      console.error('[Team] No current church, skipping member load')
      return
    }

    try {
      setLoadingMembers(true)
      console.log('[Team] Loading members for church:', currentChurch.id)
      const data = await getChurchMembers(currentChurch.id)
      console.log('[Team] Loaded members:', data.length)
      setMembers(data)
    } catch (error) {
      console.error('[Team] Failed to load members:', error)
      toast.error(t('common.error'))
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadInvitations = async () => {
    if (!currentChurch) {
      console.error('[Team] No current church, skipping invitations load')
      return
    }

    try {
      setLoadingInvitations(true)
      console.log('[Team] Loading invitations for church:', currentChurch.id)
      const data = await getPendingInvitations(currentChurch.id)
      console.log('[Team] Loaded invitations:', data.length)
      setInvitations(data)
    } catch (error) {
      console.error('[Team] Failed to load invitations:', error)
      toast.error(t('common.error'))
    } finally {
      setLoadingInvitations(false)
    }
  }

  useEffect(() => {
    if (currentChurch) {
      loadMembers()
      loadInvitations()
    }
  }, [currentChurch])

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('team.title')}</h1>
          <p className="text-muted-foreground">{t('team.subtitle')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t('team.inviteMember')}
          </Button>
        )}
      </div>

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            {t('team.members')}
            <span className="ml-1 text-muted-foreground">({members.length})</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="invitations" className="gap-2">
              <Mail className="h-4 w-4" />
              {t('team.invitations')}
              {invitations.length > 0 && (
                <span className="ml-1 text-muted-foreground">({invitations.length})</span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{t('team.members')}</CardTitle>
              <CardDescription>{t('team.membersDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <TeamMembersList
                members={members}
                onMemberUpdated={loadMembers}
                loading={loadingMembers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="invitations">
            <Card>
              <CardHeader>
                <CardTitle>{t('team.invitations')}</CardTitle>
                <CardDescription>{t('team.invitationsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <InvitationsList
                  invitations={invitations}
                  onInvitationUpdated={loadInvitations}
                  loading={loadingInvitations}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <InviteMemberDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onInviteSent={loadInvitations}
      />
    </div>
  )
}
