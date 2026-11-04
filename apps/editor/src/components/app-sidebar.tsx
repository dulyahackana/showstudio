import type { Project } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Bot,
  Box,
  ChevronsUpDown,
  Clapperboard,
  FolderKanban,
  Home,
  LogOut,
  MapPin,
  ScrollText,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { PERSONAS, usePersonaLogin } from '@/components/login-screen'
import { AttractionItem, EstopRailButton } from '@/components/park-status'
import { PersonAvatar } from '@/components/person'
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
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { locationsQuery, useProjectStage, useProjects, workspaceQuery } from '@/lib/project'
import { docsQuery } from '@/lib/queries'
import { signOut, useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

/**
 * The workspace in one column: home, your projects, the attractions with their live
 * state and e-stops, the shared library, and administration. In the editors it folds to
 * an icon rail; the e-stops stay one click away there.
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
  const live = envs.filter((e) => e.latestRevision)

  const item = (to: string, label: string, Icon: typeof Bot, exact = false, className?: string) => (
    <SidebarMenuItem key={to} className={className}>
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
      <SidebarHeader className="h-12 flex-row items-center gap-2 border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5" title={workspace?.name}>
          <img
            src="/favicon.svg"
            alt=""
            className="size-7 rounded-md shadow-[0_0_20px_-4px_oklch(0.79_0.17_155/45%)]"
          />
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Show Studio
          </span>
        </Link>
        <SidebarTrigger
          className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
          title="Collapse the sidebar (⌘B)"
        />
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1 pt-1">
        <SidebarGroup className="hidden pb-0 group-data-[collapsible=icon]:block">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarTrigger className="size-8" title="Expand the sidebar (⌘B)" />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            {item('/', 'Home', Home, true)}
            {/* On the icon rail these stand in for the project and attraction lists. */}
            {item('/projects', 'Projects', FolderKanban, false, 'hidden group-data-[collapsible=icon]:block')}
            {item('/locations', 'Attractions', MapPin, false, 'hidden group-data-[collapsible=icon]:block')}
          </SidebarMenu>
        </SidebarGroup>

        <Group label="Projects" to="/projects" action={<NewProjectDialog trigger="icon" />} collapse>
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

        {locations.map((loc) => (
          <Group key={loc.id} label={loc.name} to={`/locations/${loc.id}`} icon={MapPin} collapse>
            <SidebarMenu data-testid="park-status">
              {live
                .filter((e) => e.locationId === loc.id)
                .map((e) => (
                  <AttractionItem key={e.id} env={e} active={isActive(`/environments/${e.id}`)} />
                ))}
            </SidebarMenu>
          </Group>
        ))}

        <Group label="Library">
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
      <SidebarFooter className="gap-1 border-t border-sidebar-border p-2">
        <SidebarMenu>
          <EstopRailButton />
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  data-testid="user-menu"
                  size="lg"
                  tooltip={`${user?.name} · switch persona`}
                  title="Signed in as this person. Click to switch persona or sign out."
                >
                  <PersonAvatar name={user?.name ?? ''} className="size-8 text-xs ring-0" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium capitalize">{user?.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground capitalize">
                      {user?.roles.join(', ')} · switch
                    </span>
                  </span>
                  <ChevronsUpDown className="size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-64">
                <DropdownMenuLabel>
                  Switch persona (dev)
                  <span className="block text-[11px] font-normal text-muted-foreground">{workspace?.name}</span>
                </DropdownMenuLabel>
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
      <SidebarRail />
    </Sidebar>
  )
}

function Group({
  label,
  to,
  icon: Icon,
  action,
  collapse,
  children,
}: {
  label: string
  to?: string
  icon?: typeof Bot
  action?: ReactNode
  /** Hidden on the icon rail, where a list of identical icons says nothing. */
  collapse?: boolean
  children: ReactNode
}) {
  return (
    <SidebarGroup className={cn('py-1.5', collapse && 'group-data-[collapsible=icon]:hidden')}>
      <SidebarGroupLabel className="text-eyebrow flex h-7 items-center justify-between pr-1">
        {to ? (
          <Link to={to} className="flex items-center gap-1 hover:text-foreground">
            {Icon && <Icon className="size-3" />}
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
      <SidebarMenuButton asChild isActive={active} tooltip={`${project.name} · ${stage.label}`}>
        <Link to="/projects/$projectId" params={{ projectId: project.id }} data-testid={`nav-project-${project.id}`}>
          <Clapperboard />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          <StepDots stage={stage} small />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
