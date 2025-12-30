import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketConnections } from '@/contexts/WebSocketContext';
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

export function DisplaysAccordion() {
  const { t } = useTranslation();
  const { discovered, connected, isDiscovering, discover, connect, disconnect } = useWebSocketConnections();

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8080');

  // Combine discovered and connected displays
  const allDisplays: Array<{ key: string; name: string; isConnected: boolean; host: string; port: number }> = [];

  connected.forEach((disp) => {
    allDisplays.push({ key: disp.key, name: disp.name, isConnected: true, host: disp.host, port: disp.port });
  });

  discovered.forEach((disp) => {
    const key = `${disp.host}:${disp.port}`;
    if (!connected.has(key)) {
      allDisplays.push({ key, name: disp.name, isConnected: false, host: disp.host, port: disp.port });
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
      service_type: 'manual',
    });
    setManualDialogOpen(false);
    setManualIp('');
    setManualPort('8080');
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
                  <button
                    onClick={() => display.isConnected
                      ? disconnect(display.key)
                      : connect({ host: display.host, port: display.port, name: display.name, service_type: '' })
                    }
                    className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {display.isConnected ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <span className="text-xs">Connect</span>
                    )}
                  </button>
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
    </>
  );
}
