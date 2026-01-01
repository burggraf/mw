import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isTauri, safeInvoke } from '@/lib/tauri'
import { useChurch } from '@/contexts/ChurchContext'
import {
  getDisplaysForChurch,
  addDiscoveredDisplay,
  updateDisplay,
  deleteDisplay,
  markStaleDisplaysOffline,
} from '@/services/displays'
import type { Display, DisplayClass, DiscoveredDisplay } from '@/types/display'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Monitor,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Check if Tauri APIs are available (use centralized helper)
const hasTauri = isTauri()

export function DisplaysPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [displays, setDisplays] = useState<Display[]>([])
  const [loading, setLoading] = useState(true)
  const [discoveredDisplays, setDiscoveredDisplays] = useState<DiscoveredDisplay[]>([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [displayToDelete, setDisplayToDelete] = useState<Display | null>(null)
  const [displayToEdit, setDisplayToEdit] = useState<Display | null>(null)
  const [discoveredToAdd, setDiscoveredToAdd] = useState<DiscoveredDisplay | null>(null)

  // Form state for add/edit dialogs
  const [formName, setFormName] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formDisplayClass, setFormDisplayClass] = useState<DisplayClass>('audience')

  // Ref to track polling interval
  const pollingIntervalRef = useRef<number | null>(null)

  // Load displays from database
  useEffect(() => {
    if (currentChurch) {
      loadDisplays()
    }
  }, [currentChurch])

  // Poll for offline status and refresh displays list periodically
  useEffect(() => {
    if (!currentChurch) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      return
    }

    const pollStatus = async () => {
      try {
        // Mark stale displays as offline (haven't been seen in 30 seconds)
        await markStaleDisplaysOffline(currentChurch.id)
        // Refresh the displays list to show updated status
        const data = await getDisplaysForChurch(currentChurch.id)
        setDisplays(data)
      } catch (error) {
        console.error('Failed to poll display status:', error)
      }
    }

    // Poll every 10 seconds
    pollingIntervalRef.current = window.setInterval(pollStatus, 10000)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [currentChurch])

  async function loadDisplays() {
    if (!currentChurch) return

    try {
      setLoading(true)
      const data = await getDisplaysForChurch(currentChurch.id)
      setDisplays(data)
    } catch (error) {
      console.error('Failed to load displays:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  // Discover displays via mDNS
  const handleDiscover = useCallback(async () => {
    if (!hasTauri) {
      toast.error(t('displays.discoveryNotAvailable', 'Discovery requires the desktop app'))
      return
    }

    setIsDiscovering(true)
    setDiscoveredDisplays([])

    try {
      const discovered = await safeInvoke<DiscoveredDisplay[]>('discover_display_devices', { timeoutSecs: 5 })
      if (!discovered) {
        setIsDiscovering(false)
        return
      }

      // Refresh the displays list from the database to ensure we have current data
      // This prevents duplicates if the user discovered and added quickly
      let currentDisplays = displays
      if (currentChurch) {
        try {
          currentDisplays = await getDisplaysForChurch(currentChurch.id)
          setDisplays(currentDisplays)
        } catch (e) {
          console.error('Failed to refresh displays list:', e)
        }
      }

      // Filter out displays that are already registered (using fresh data)
      const registeredDisplayIds = new Set(currentDisplays.map(d => d.displayId))
      const newDisplays = discovered.filter(d => !registeredDisplayIds.has(d.displayId))

      setDiscoveredDisplays(newDisplays)

      if (newDisplays.length === 0 && discovered.length > 0) {
        toast.info(t('displays.allDisplaysRegistered', 'All discovered displays are already registered'))
      } else if (newDisplays.length === 0) {
        toast.info(t('displays.noDisplaysFound', 'No displays found on the network'))
      } else {
        toast.success(t('displays.displaysFound', { count: newDisplays.length }))
      }
    } catch (error) {
      console.error('Discovery failed:', error)
      toast.error(t('displays.discoveryFailed', 'Failed to discover displays'))
    } finally {
      setIsDiscovering(false)
    }
  }, [displays, currentChurch, t])

  // Add a discovered display
  async function handleAddDiscovered() {
    if (!currentChurch || !discoveredToAdd) return

    try {
      const newDisplay = await addDiscoveredDisplay(currentChurch.id, discoveredToAdd, {
        name: formName || discoveredToAdd.displayName || discoveredToAdd.name.replace('._mw-display._tcp.local.', ''),
        location: formLocation || null,
        displayClass: formDisplayClass,
      })

      // Check if this display was already in the list (upsert updated existing)
      const existingIndex = displays.findIndex(d => d.displayId === newDisplay.displayId)
      if (existingIndex >= 0) {
        // Replace existing entry
        const updatedDisplays = [...displays]
        updatedDisplays[existingIndex] = newDisplay
        setDisplays(updatedDisplays.sort((a, b) => a.name.localeCompare(b.name)))
        toast.success(t('displays.displayUpdated', 'Display updated successfully'))
      } else {
        // Add new entry
        setDisplays([...displays, newDisplay].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success(t('displays.displayAdded', 'Display added successfully'))
      }
      setDiscoveredDisplays(discoveredDisplays.filter(d => d.displayId !== discoveredToAdd.displayId))
    } catch (error) {
      console.error('Failed to add display:', error)
      toast.error(t('common.error'))
    } finally {
      setDiscoveredToAdd(null)
      resetForm()
    }
  }

  // Edit a display
  async function handleEditDisplay() {
    if (!displayToEdit) return

    try {
      const updated = await updateDisplay(displayToEdit.id, {
        name: formName,
        location: formLocation || null,
        displayClass: formDisplayClass,
      })

      setDisplays(displays.map(d => d.id === updated.id ? updated : d))
      toast.success(t('displays.displayUpdated', 'Display updated successfully'))
    } catch (error) {
      console.error('Failed to update display:', error)
      toast.error(t('common.error'))
    } finally {
      setDisplayToEdit(null)
      resetForm()
    }
  }

  // Delete a display
  async function handleDeleteDisplay() {
    if (!displayToDelete) return

    try {
      await deleteDisplay(displayToDelete.id)
      setDisplays(displays.filter(d => d.id !== displayToDelete.id))
      toast.success(t('displays.displayDeleted', 'Display deleted successfully'))
    } catch (error) {
      console.error('Failed to delete display:', error)
      toast.error(t('common.error'))
    } finally {
      setDisplayToDelete(null)
    }
  }

  function resetForm() {
    setFormName('')
    setFormLocation('')
    setFormDisplayClass('audience')
  }

  function openAddDialog(discovered: DiscoveredDisplay) {
    setFormName(discovered.displayName || discovered.name.replace('._mw-display._tcp.local.', ''))
    setFormLocation('')
    setFormDisplayClass('audience')
    setDiscoveredToAdd(discovered)
  }

  function openEditDialog(display: Display) {
    setFormName(display.name)
    setFormLocation(display.location || '')
    setFormDisplayClass(display.displayClass)
    setDisplayToEdit(display)
  }

  function getDisplayClassBadgeColor(displayClass: DisplayClass) {
    switch (displayClass) {
      case 'audience':
        return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
      case 'stage':
        return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20'
      case 'lobby':
        return 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
      default:
        return ''
    }
  }

  if (!currentChurch) {
    return null
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('displays.title', 'Displays')}</h1>
        <Button
          onClick={handleDiscover}
          disabled={isDiscovering || !hasTauri}
          className="w-full sm:w-auto"
        >
          {isDiscovering ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('displays.discovering', 'Discovering...')}
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              {t('displays.discover', 'Discover Displays')}
            </>
          )}
        </Button>
      </div>

      {/* Discovered Displays Section */}
      {discoveredDisplays.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wifi className="h-5 w-5 text-green-500" />
              {t('displays.discoveredDisplays', 'Discovered Displays')}
            </CardTitle>
            <CardDescription>
              {t('displays.discoveredDescription', 'These displays were found on your network. Click Add to register them.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discoveredDisplays.map((discovered) => (
                <div
                  key={discovered.displayId}
                  className="flex flex-col p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Monitor className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {discovered.displayName || discovered.name.replace('._mw-display._tcp.local.', '')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {discovered.host}:{discovered.port}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => openAddDialog(discovered)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t('common.add', 'Add')}
                    </Button>
                  </div>
                  <div className="mt-3 pt-3 border-t flex flex-wrap gap-2 text-xs">
                    {discovered.platform && (
                      <Badge variant="default">
                        {discovered.platform}
                      </Badge>
                    )}
                    {discovered.width && discovered.height && (
                      <Badge variant="secondary">
                        {discovered.width}x{discovered.height}
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono">
                      ID: {discovered.displayId.substring(0, 8)}...
                    </Badge>
                    {discovered.deviceId && discovered.deviceId !== discovered.displayId && (
                      <Badge variant="outline" className="font-mono">
                        Device: {discovered.deviceId.substring(0, 8)}...
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Registered Displays Section */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        </Card>
      ) : displays.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('displays.noDisplays', 'No Displays')}</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-md">
              {t('displays.noDisplaysDescription', 'No displays registered for this church. Use the Discover button to find displays on your network.')}
            </p>
            <Button onClick={handleDiscover} disabled={isDiscovering || !hasTauri}>
              <Search className="h-4 w-4 mr-2" />
              {t('displays.discover', 'Discover Displays')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">{t('displays.name', 'Name')}</TableHead>
                <TableHead className="min-w-[100px] hidden sm:table-cell">{t('displays.location', 'Location')}</TableHead>
                <TableHead className="min-w-[120px] hidden md:table-cell">{t('displays.resolution', 'Resolution')}</TableHead>
                <TableHead className="min-w-[100px] hidden lg:table-cell text-center">{t('displays.classLabel', 'Class')}</TableHead>
                <TableHead className="min-w-[100px] hidden xl:table-cell">{t('displays.platform', 'Platform')}</TableHead>
                <TableHead className="min-w-[80px] text-center">{t('displays.statusLabel', 'Status')}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displays.map((display) => (
                <TableRow key={display.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div>{display.name}</div>
                        <div className="text-sm text-muted-foreground sm:hidden">
                          {display.location || '—'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {display.location || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {display.width && display.height ? `${display.width}x${display.height}` : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    <Badge variant="secondary" className={cn(getDisplayClassBadgeColor(display.displayClass))}>
                      {t(`displays.class.${display.displayClass}`, display.displayClass)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden xl:table-cell">
                    {display.platform || '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {display.isOnline ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-500 gap-1">
                        <Wifi className="h-3 w-3" />
                        {t('displays.online', 'Online')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1">
                        <WifiOff className="h-3 w-3" />
                        {t('displays.offline', 'Offline')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(display)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t('common.edit', 'Edit')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDisplayToDelete(display)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete', 'Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Display Dialog */}
      <Dialog open={!!discoveredToAdd} onOpenChange={() => setDiscoveredToAdd(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('displays.addDisplay', 'Add Display')}</DialogTitle>
            <DialogDescription>
              {t('displays.addDisplayDescription', 'Configure the display settings before adding it to your church.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('displays.name', 'Name')}</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('displays.namePlaceholder', 'e.g., Main Screen')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">{t('displays.location', 'Location')}</Label>
              <Input
                id="location"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder={t('displays.locationPlaceholder', 'e.g., Sanctuary')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="class">{t('displays.classLabel', 'Display Class')}</Label>
              <Select value={formDisplayClass} onValueChange={(v) => setFormDisplayClass(v as DisplayClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">{t('displays.class.audience', 'Audience')}</SelectItem>
                  <SelectItem value="stage">{t('displays.class.stage', 'Stage')}</SelectItem>
                  <SelectItem value="lobby">{t('displays.class.lobby', 'Lobby')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discoveredToAdd && (
              <div className="text-sm text-muted-foreground">
                <div>{t('displays.connectionInfo', 'Connection')}: {discoveredToAdd.host}:{discoveredToAdd.port}</div>
                {discoveredToAdd.width && discoveredToAdd.height && (
                  <div>{t('displays.resolution', 'Resolution')}: {discoveredToAdd.width}x{discoveredToAdd.height}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscoveredToAdd(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleAddDiscovered}>
              {t('common.add', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Display Dialog */}
      <Dialog open={!!displayToEdit} onOpenChange={() => setDisplayToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('displays.editDisplay', 'Edit Display')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">{t('displays.name', 'Name')}</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-location">{t('displays.location', 'Location')}</Label>
              <Input
                id="edit-location"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-class">{t('displays.classLabel', 'Display Class')}</Label>
              <Select value={formDisplayClass} onValueChange={(v) => setFormDisplayClass(v as DisplayClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">{t('displays.class.audience', 'Audience')}</SelectItem>
                  <SelectItem value="stage">{t('displays.class.stage', 'Stage')}</SelectItem>
                  <SelectItem value="lobby">{t('displays.class.lobby', 'Lobby')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisplayToEdit(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleEditDisplay}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!displayToDelete} onOpenChange={() => setDisplayToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('displays.deleteDisplay', 'Delete Display')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('displays.confirmDelete', 'Are you sure you want to delete this display?')}
              <br />
              <span className="font-medium">{displayToDelete?.name}</span>
              <br />
              <br />
              {t('displays.deleteWarning', 'This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDisplay}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
