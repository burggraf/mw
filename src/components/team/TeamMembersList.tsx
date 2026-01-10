import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useChurch } from '@/contexts/ChurchContext'
import { changeRole, removeMember, leaveChurch, getAdminCount } from '@/services/memberships'
import type { Membership, UserRole } from '@/types/team'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { MoreHorizontal, Trash2, Shield, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'

interface TeamMembersListProps {
  members: Membership[]
  onMemberUpdated: () => void
  loading: boolean
}

export function TeamMembersList({
  members,
  onMemberUpdated,
  loading,
}: TeamMembersListProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isAdmin, currentChurch, setCurrentChurch, userChurches } = useChurch()

  const [memberToRemove, setMemberToRemove] = useState<Membership | null>(null)
  const [showLeaveChurchDialog, setShowLeaveChurchDialog] = useState(false)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [canLeaveChurch, setCanLeaveChurch] = useState(true)

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Check if current user is the last admin (cannot leave)
  useEffect(() => {
    const checkCanLeave = async () => {
      if (!currentChurch || !user) {
        setCanLeaveChurch(true)
        return
      }

      const currentUserMembership = members.find(m => m.userId === user.id)
      if (!currentUserMembership) {
        setCanLeaveChurch(true)
        return
      }

      // Only check for admins
      if (currentUserMembership.role !== 'admin') {
        setCanLeaveChurch(true)
        return
      }

      // Check admin count
      try {
        const adminCount = await getAdminCount(currentChurch.id)
        setCanLeaveChurch(adminCount > 1)
      } catch (error) {
        console.error('Failed to check admin count:', error)
        setCanLeaveChurch(true) // Default to allowing leave on error
      }
    }

    checkCanLeave()
  }, [currentChurch, user, members])

  const handleRoleChange = async (membership: Membership, newRole: UserRole) => {
    if (!currentChurch) return

    setChangingRole(membership.id)
    try {
      // Check if demoting from admin and they're the last one
      if (membership.role === 'admin' && newRole !== 'admin') {
        const adminCount = await getAdminCount(currentChurch.id)
        if (adminCount <= 1) {
          toast.error(t('team.lastAdminError'))
          return
        }
      }

      await changeRole(membership.id, newRole)
      toast.success(t('team.roleUpdated'))
      onMemberUpdated()
    } catch (error: any) {
      console.error('Failed to change role:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setChangingRole(null)
    }
  }

  const handleRemove = async () => {
    if (!memberToRemove) return

    setRemoving(true)
    try {
      await removeMember(memberToRemove.id)
      toast.success(t('team.memberRemoved'))
      setMemberToRemove(null)
      onMemberUpdated()
    } catch (error: any) {
      console.error('Failed to remove member:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setRemoving(false)
    }
  }

  const handleLeaveChurch = async () => {
    if (!currentChurch) return

    console.log('[TeamMembersList] Attempting to leave church:', currentChurch.id)
    setLeaving(true)
    try {
      // Find the current user's membership
      const currentUserMembership = members.find(m => m.userId === user?.id)
      if (!currentUserMembership) {
        console.error('[TeamMembersList] Current user membership not found')
        throw new Error('Membership not found')
      }

      console.log('[TeamMembersList] Found membership:', currentUserMembership.id)
      await leaveChurch(currentUserMembership.id)
      console.log('[TeamMembersList] Successfully left church')
      toast.success(t('team.leaveChurchSuccess'))

      // Switch to another church or go to setup-church
      const otherChurches = userChurches.filter(c => c.id !== currentChurch.id)
      console.log('[TeamMembersList] Other churches available:', otherChurches.length)
      if (otherChurches.length > 0) {
        setCurrentChurch(otherChurches[0])
        navigate('/dashboard')
      } else {
        // No more churches, go to setup
        console.log('[TeamMembersList] No more churches, navigating to setup-church')
        navigate('/setup-church')
      }
    } catch (error: any) {
      console.error('[TeamMembersList] Failed to leave church:', error)
      toast.error(error.message || t('common.error'))
    } finally {
      setLeaving(false)
      setShowLeaveChurchDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('team.noMembers')}
      </div>
    )
  }

  return (
    <>
      <Table data-testid="members-list">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">{t('team.member')}</TableHead>
            <TableHead>{t('team.role')}</TableHead>
            <TableHead className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isCurrentUser = member.userId === user?.id
            const canEdit = isAdmin && !isCurrentUser

            return (
              <TableRow key={member.id} data-testid="member-row">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.user?.avatarUrl || undefined} />
                      <AvatarFallback>
                        {getInitials(member.user?.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {member.user?.displayName || t('team.unknownUser')}
                        {isCurrentUser && (
                          <Badge variant="secondary" className="ml-2">
                            {t('team.you')}
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground" data-testid="member-email">
                        {member.user?.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        handleRoleChange(member, value as UserRole)
                      }
                      disabled={changingRole === member.id}
                    >
                      <SelectTrigger className="w-[140px]" data-testid="role-select">
                        {changingRole === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" data-testid="role-option-admin">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            {t('team.roles.admin')}
                          </div>
                        </SelectItem>
                        <SelectItem value="editor" data-testid="role-option-editor">
                          {t('team.roles.editor')}
                        </SelectItem>
                        <SelectItem value="operator" data-testid="role-option-operator">
                          {t('team.roles.operator')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={member.role === 'admin' ? 'default' : 'secondary'} data-testid="member-role">
                      {member.role === 'admin' && (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      {t(`team.roles.${member.role}`)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setMemberToRemove(member)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('team.removeMember')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : isCurrentUser ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!canLeaveChurch) {
                          toast.error(t('team.leaveLastAdminError'))
                          return
                        }
                        setShowLeaveChurchDialog(true)
                      }}
                      data-testid="leave-church-button"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      {t('team.leaveChurch')}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.removeMemberTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.removeMemberDescription', {
                name: memberToRemove?.user?.displayName || t('team.thisMember'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showLeaveChurchDialog}
        onOpenChange={setShowLeaveChurchDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.leaveChurchTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.leaveChurchDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveChurch}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.leaveChurch')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
