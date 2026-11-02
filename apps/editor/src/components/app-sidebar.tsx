import { Link, useRouterState } from '@tanstack/react-router'
import {
  Bot,
  Box,
  Clapperboard,
  Gauge,
  LayoutDashboard,
  LogOut,
  Mountain,
  ScrollText,
  Server,
  Users,
} from 'lucide-react'
import { PERSONAS, usePersonaLogin } from '@/components/login-screen'
import { ParkStatus } from '@/components/park-status'
import { ProjectSwitcher } from '@/components/project-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
} from '@/components/ui/sidebar'
import { signOut, useUser } from '@/lib/session'

const studio = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/characters', label: 'Characters', icon: Bot },
  { to: '/environments', label: 'Environments', icon: Mountain },
  { to: '/shows', label: 'Shows', icon: Clapperboard },
  { to: '/assets', label: 'Assets', icon: Box },
  { to: '/projects', label: 'Members & access', icon: Users },
] as const

const park = [
  { to: '/fleet', label: 'Fleet & deploy', icon: Server },
  { to: '/operator', label: 'Operator console', icon: Gauge },
  { to: '/audit', label: 'Audit log', icon: ScrollText },
] as const

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const user = useUser()
  const login = usePersonaLogin()
  const isActive = (to: string, exact = false) => (exact ? path === to : path === to || path.startsWith(`${to}/`))

  const nav = (items: readonly { to: string; label: string; icon: typeof Bot; exact?: boolean }[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={isActive(item.to, item.exact)} tooltip={item.label}>
            <Link to={item.to}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 px-3 pt-4 pb-2">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg shadow-[0_0_24px_-4px_oklch(0.8_0.155_72/45%)]" />
          <span className="leading-tight group-data-[collapsible=icon]:hidden">
            <span className="block text-sm font-semibold tracking-tight">Show Studio</span>
            <span className="block text-[11px] text-muted-foreground">Mechatronic shows</span>
          </span>
        </Link>
        <ProjectSwitcher />
      </SidebarHeader>
      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-eyebrow">Create</SidebarGroupLabel>
          <SidebarGroupContent>{nav(studio)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-eyebrow">Operate</SidebarGroupLabel>
          <SidebarGroupContent>{nav(park)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-3">
        <ParkStatus />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton data-testid="user-menu" size="lg">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary uppercase">
                    {user?.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium capitalize">{user?.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{user?.roles.join(', ')}</span>
                  </span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-64">
                <DropdownMenuLabel>Switch persona (dev)</DropdownMenuLabel>
                {PERSONAS.map((p) => (
                  <DropdownMenuItem key={p.name} onSelect={() => login.mutate(p)} data-testid={`switch-${p.name}`}>
                    <p.icon /> {p.title}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
