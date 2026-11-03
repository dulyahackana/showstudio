import type { Project } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Bot,
  Box,
  Building2,
  Clapperboard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Mountain,
  ScrollText,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { StatusDot } from '@/components/kind'
import { PERSONAS, usePersonaLogin } from '@/components/login-screen'
import { ParkStatus } from '@/components/park-status'
import { NewProjectDialog, StepDots } from '@/components/project-ui'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { activeRun } from '@/features/fleet/live-frame'
import { locationsQuery, useProjectStage, useProjects, workspaceQuery } from '@/lib/project'
import { docsQuery, envStatusQuery } from '@/lib/queries'
import { signOut, useUser } from '@/lib/session'

/**
 * The workspace as a tree: projects (one show each), locations with their environments,
 * the shared library, and administration.
 */
export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const user = useUser()
  const login = usePersonaLogin()
  const { data: workspace } = useQuery(workspaceQuery)
  const { data: projects = [] } = useProjects()
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const isActive = (to: string, exact = false) => (exact ? path === to : path === to || path.startsWith(`${to}/`))

  const item = (to: string, label: string, Icon: typeof Bot, exact = false) => (
    <SidebarMenuItem key={to}>
      <SidebarMenuButton asChild isActive={isActive(to, exact)} tooltip={label}>
        <Link to={to}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2 px-3 pt-4 pb-1">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/favicon.svg"
            alt=""
            className="size-8 rounded-lg shadow-[0_0_24px_-4px_oklch(0.79_0.17_155/45%)]"
          />
          <span className="leading-tight group-data-[collapsible=icon]:hidden">
            <span className="block text-sm font-semibold tracking-tight">Show Studio</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 className="size-3" /> {workspace?.name ?? 'Workspace'}
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-1">
        <SidebarGroup className="pb-0">
          <SidebarMenu>{item('/', 'Overview', LayoutDashboard, true)}</SidebarMenu>
        </SidebarGroup>

        <Group label="Projects" to="/projects" hint="One show each" action={<NewProjectDialog trigger="icon" />}>
          <SidebarMenu>
            {projects.map((p) => (
              <ProjectItem key={p.id} project={p} active={isActive(`/projects/${p.id}`)} />
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                You are not on any project yet.
              </p>
            )}
          </SidebarMenu>
        </Group>

        <Group label="Locations" to="/locations" hint="Where the hardware is">
          <SidebarMenu>
            {locations.map((loc) => (
              <SidebarMenuItem key={loc.id}>
                <SidebarMenuButton asChild isActive={path === `/locations/${loc.id}`} tooltip={loc.name}>
                  <Link to="/locations/$locationId" params={{ locationId: loc.id }}>
                    <MapPin />
                    <span>{loc.name}</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {envs
                    .filter((e) => e.locationId === loc.id)
                    .map((e) => (
                      <SidebarMenuSubItem key={e.id}>
                        <SidebarMenuSubButton asChild isActive={isActive(`/environments/${e.id}`)}>
                          <Link to="/environments/$id" params={{ id: e.id }}>
                            <Mountain />
                            <span className="flex-1 truncate">{e.name}</span>
                            {e.latestRevision ? <LiveDot envId={e.id} /> : null}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </Group>

        <Group label="Library" hint="Shared by every environment">
          <SidebarMenu>
            {item('/characters', 'Characters', Bot)}
            {item('/assets', 'Assets', Box)}
          </SidebarMenu>
        </Group>

        <Group label="Admin">
          <SidebarMenu>
            {item('/people', 'People & access', Users)}
            {item('/audit', 'Audit log', ScrollText)}
          </SidebarMenu>
        </Group>
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

function Group({
  label,
  to,
  hint,
  action,
  children,
}: {
  label: string
  to?: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-eyebrow flex items-center justify-between pr-1" title={hint}>
        {to ? (
          <Link to={to} className="hover:text-foreground">
            {label}
          </Link>
        ) : (
          label
        )}
        {action}
      </SidebarGroupLabel>
      <SidebarGroupContent>{children}</SidebarGroupContent>
    </SidebarGroup>
  )
}

function ProjectItem({ project, active }: { project: Project; active: boolean }) {
  const stage = useProjectStage(project)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={project.name} className="h-auto py-1.5">
        <Link to="/projects/$projectId" params={{ projectId: project.id }} data-testid={`nav-project-${project.id}`}>
          <Clapperboard />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{project.name}</span>
            <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <StepDots stage={stage} />
              <span className="truncate">{stage.label}</span>
            </span>
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function LiveDot({ envId }: { envId: string }) {
  const { data: status } = useQuery(envStatusQuery(envId))
  if (!status) return null
  const online = status.devices.filter((d) => d.online).length
  const state = status.estop.active ? 'estopped' : activeRun(status) ? 'running' : online ? 'ready' : 'offline'
  return <StatusDot state={state} />
}
