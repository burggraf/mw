import { useState } from 'react';
import { useWebSocketConnections } from '@/contexts/WebSocketContext';
import { useChurch } from '@/contexts/ChurchContext';
import { addDiscoveredDisplay } from '@/services/displays';
import { Button } from '@/components/ui/button';
import { Plus, Wifi, WifiOff, RefreshCw, X } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DisplayClass, DiscoveredDisplay } from '@/types/display';
import { useToast } from '@/hooks/use-toast';

export function DisplaysAccordion() {
  const { discovered, connected, isDiscovering, discover, connect, disconnect } = useWebSocketConnections();
  const { currentChurch } = useChurch();
  const { toast } = useToast();

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8080');

  // Add discovered display dialog state
  const [addDisplayDialogOpen, setAddDisplayDialogOpen] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<DiscoveredDisplay | null>(null);
  const [displayDisplayName, setDisplayDisplayName] = useState('');
  const [displayLocation, setDisplayLocation] = useState('');
  const [displayClass, setDisplayClass] = useState<DisplayClass>('audience');
  const [isAdding, setIsAdding] = useState(false);

  // Combine discovered and connected displays
  const allDisplays: Array<{ key: string; name: string; isConnected: boolean; host: string; port: number; deviceId?: string }> = [];

  connected.forEach((disp) => {
    allDisplays.push({ key: disp.key, name: disp.name, isConnected: true, host: disp.host, port: disp.port });
  });

  discovered.forEach((disp) => {
    const key = `${disp.host}:${disp.port}`;
    if (!connected.has(key)) {
      allDisplays.push({
        key,
        name: disp.name,
        isConnected: false,
        host: disp.host,
        port: disp.port,
        deviceId: disp.deviceId,
      });
    }
  });

  // Add display manually by IP
  const handleManualAdd = () => {
    if (!manualIp) return;
    const port = parseInt(manualPort) || 8080;
    connect({
      host: manualIp,
      port,
      name: manualIp,
      serviceType: 'manual',
    });
    setManualDialogOpen(false);
    setManualIp('');
    setManualPort('8080');
  };

  // Open add display dialog for discovered display
  const openAddDisplayDialog = (display: typeof allDisplays[number]) => {
    if (!display.deviceId) {
      toast({
        title: 'Cannot Add Display',
        description: 'This display does not have a device ID. Please connect to it directly.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedDisplay({
      host: display.host,
      port: display.port,
      name: display.name,
      serviceType: 'mdns',
      deviceId: display.deviceId,
    });
    setDisplayDisplayName(display.name.replace('._mw-display._tcp.local.', ''));
    setDisplayLocation('');
    setDisplayClass('audience');
    setAddDisplayDialogOpen(true);
  };

  // Add discovered display to database
  const handleAddDisplay = async () => {
    if (!currentChurch || !selectedDisplay || !selectedDisplay.deviceId) {
      toast({
        title: 'Error',
        description: 'Missing required information',
        variant: 'destructive',
      });
      return;
    }

    setIsAdding(true);
    try {
      await addDiscoveredDisplay(currentChurch.id, selectedDisplay, {
        name: displayDisplayName,
        location: displayLocation || null,
        displayClass,
      });

      toast({
        title: 'Display Added',
        description: `"${displayDisplayName}" has been added to your displays.`,
      });

      setAddDisplayDialogOpen(false);
      setSelectedDisplay(null);
      setDisplayDisplayName('');
      setDisplayLocation('');
      setDisplayClass('audience');
    } catch (error) {
      console.error('Failed to add display:', error);
      toast({
        title: 'Failed to Add Display',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <SidebarGroup>
        <div className="flex items-center justify-between pr-2">
          <SidebarGroupLabel>Displays</SidebarGroupLabel>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={discover}
              disabled={isDiscovering}
            >
              <RefreshCw className={`h-4 w-4 ${isDiscovering ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setManualDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <SidebarGroupContent>
          <SidebarMenu>
            {allDisplays.length === 0 ? (
              <SidebarMenuItem>
                <p className="text-sm text-muted-foreground px-2">
                  {isDiscovering ? 'Scanning...' : 'No displays found'}
                </p>
              </SidebarMenuItem>
            ) : (
              allDisplays.map((display) => (
                <SidebarMenuItem key={display.key}>
                  <SidebarMenuButton>
                    <div className="flex-1 text-left truncate">
                      {display.name}
                    </div>
                    {display.isConnected ? (
                      <Wifi className="h-4 w-4 text-green-500" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </SidebarMenuButton>
                  {!display.isConnected && (
                    <>
                      {/* Show Add button for discovered displays with deviceId */}
                      {display.deviceId ? (
                        <button
                          onClick={() => openAddDisplayDialog(display)}
                          className="px-2 py-1 text-xs text-blue-500 hover:text-blue-600"
                          title="Add to database"
                        >
                          Add
                        </button>
                      ) : (
                        <button
                          onClick={() => connect({ host: display.host, port: display.port, name: display.name, serviceType: '' })}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Connect
                        </button>
                      )}
                    </>
                  )}
                  {display.isConnected && (
                    <button
                      onClick={() => disconnect(display.key)}
                      className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Manual Add Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Display by IP</DialogTitle>
            <DialogDescription>
              Enter the IP address and port of a display on your network
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                placeholder="192.168.1.100"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                placeholder="8080"
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleManualAdd} disabled={!manualIp}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Discovered Display Dialog */}
      <Dialog open={addDisplayDialogOpen} onOpenChange={setAddDisplayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Display</DialogTitle>
            <DialogDescription>
              Configure this display and add it to your church
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Main Stage Display"
                value={displayDisplayName}
                onChange={(e) => setDisplayDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Input
                id="location"
                placeholder="Sanctuary"
                value={displayLocation}
                onChange={(e) => setDisplayLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayClass">Display Type</Label>
              <Select value={displayClass} onValueChange={(v) => setDisplayClass(v as DisplayClass)}>
                <SelectTrigger id="displayClass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">Audience</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                  <SelectItem value="lobby">Lobby</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedDisplay && (
              <div className="text-sm text-muted-foreground">
                Device ID: {selectedDisplay.deviceId}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDisplayDialogOpen(false)} disabled={isAdding}>
              Cancel
            </Button>
            <Button onClick={handleAddDisplay} disabled={!displayDisplayName || isAdding}>
              {isAdding ? 'Adding...' : 'Add Display'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
