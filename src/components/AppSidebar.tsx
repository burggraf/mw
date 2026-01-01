import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useChurch } from '@/contexts/ChurchContext'
import { useTheme } from '@/contexts/ThemeContext'
import { isTauri } from '@/lib/tauri'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  LayoutDashboard,
  Music,
  ImageIcon,
  Calendar,
  Users,
  Settings,
  ChevronUp,
  LogOut,
  Sun,
  Moon,
  Languages,
  Church as ChurchIcon,
  Monitor,
  Presentation,
} from 'lucide-react'

const navItems = [
  { key: 'dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { key: 'songs', icon: Music, href: '/songs' },
  { key: 'backgrounds', icon: ImageIcon, href: '/backgrounds' },
  { key: 'slides', icon: Presentation, href: '/slides' },
  { key: 'events', icon: Calendar, href: '/events' },
  { key: 'displays', icon: Monitor, href: '/displays' },
  { key: 'team', icon: Users, href: '/team', disabled: true },
  { key: 'settings', icon: Settings, href: '/settings', disabled: true },
]

const liveItems = [
  { key: 'displayMode', icon: Monitor, href: '/live/display' },
]

export function AppSidebar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { churches, currentChurch, setCurrentChurch } = useChurch()
  const { resolvedTheme, setTheme } = useTheme()
  const { setOpenMobile } = useSidebar()

  const handleNavigation = (href: string) => {
    navigate(href)
    setOpenMobile(false) // Close sidebar on mobile after navigation
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const handleChurchChange = (churchId: string) => {
    const church = churches.find(c => c.id === churchId)
    if (church) {
      setCurrentChurch(church)
    }
  }

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(newLang)
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '??'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="safe-top">
        {/* Church Selector */}
        <SidebarMenu>
          <SidebarMenuItem>
            {churches.length > 1 ? (
              <Select
                value={currentChurch?.id}
                onValueChange={handleChurchChange}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2 truncate">
                    <ChurchIcon className="h-4 w-4 shrink-0" />
                    <SelectValue placeholder="Select church" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {churches.map((church) => (
                    <SelectItem key={church.id} value={church.id}>
                      <div className="flex items-center gap-2">
                        <span>{church.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({church.role})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : currentChurch ? (
              <SidebarMenuButton size="lg" className="cursor-default">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ChurchIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold truncate">{currentChurch.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {currentChurch.role}
                  </span>
                </div>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton size="lg" onClick={() => navigate('/create-church')}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg border-2 border-dashed">
                  <ChurchIcon className="size-4" />
                </div>
                <span className="font-semibold">{t('church.create')}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
                    disabled={item.disabled}
                    tooltip={t(`nav.${item.key}`, item.key.charAt(0).toUpperCase() + item.key.slice(1))}
                    onClick={item.disabled ? undefined : () => handleNavigation(item.href)}
                    className={item.disabled ? 'opacity-50' : ''}
                  >
                    <item.icon className="size-4" />
                    <span>{t(`nav.${item.key}`, item.key.charAt(0).toUpperCase() + item.key.slice(1))}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Live Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Live</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {liveItems.map((item) => {
                const isDisabled = !isTauri()
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.href || location.pathname.startsWith(item.href + '/')}
                      disabled={isDisabled}
                      tooltip={t(`${item.key}.title`)}
                      onClick={isDisabled ? undefined : () => handleNavigation(item.href)}
                      className={isDisabled ? 'opacity-50' : ''}
                    >
                      <item.icon className="size-4" />
                      <span>{t(`${item.key}.title`)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* Theme & Language */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="flex flex-col gap-3 px-2 py-2">
              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                  {resolvedTheme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                  <Label htmlFor="dark-mode" className="text-sm cursor-pointer">
                    {t('settings.darkMode', 'Dark Mode')}
                  </Label>
                </div>
                <Switch
                  id="dark-mode"
                  checked={resolvedTheme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>

              {/* Language Toggle */}
              <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                  <Languages className="h-4 w-4" />
                  <Label htmlFor="language" className="text-sm cursor-pointer">
                    {t('settings.language', 'Language')}
                  </Label>
                </div>
                <button
                  onClick={toggleLanguage}
                  className="text-sm font-medium px-2 py-1 rounded hover:bg-sidebar-accent"
                >
                  {i18n.language.startsWith('es') ? 'ES' : 'EN'}
                </button>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* User Profile */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none text-left">
                    <span className="truncate text-sm">{user?.email}</span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem disabled>
                  <span className="truncate">{user?.email}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('auth.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
