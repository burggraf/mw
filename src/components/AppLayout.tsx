import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Separator } from '@/components/ui/separator'

interface AppLayoutProps {
  children?: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-[100dvh] overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background pt-[env(safe-area-inset-top)]">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto">
          {children || <Outlet />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
