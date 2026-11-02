import type { ProjectRole } from '@studio/schema'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Building2, Check, ChevronsUpDown, FolderKanban, Lock, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, problemMessage } from '@/lib/api'
import { formatCount } from '@/lib/format'
import { selectProject, useCurrentProject, useProjects, workspaceQuery } from '@/lib/project'
import { useCan } from '@/lib/session'
import { cn } from '@/lib/utils'

export const ROLE_TONE: Record<ProjectRole, string> = {
  owner: 'text-primary border-primary/30 bg-primary/10',
  editor: 'text-motion border-motion/30 bg-motion/10',
  reviewer: 'text-sensor border-sensor/30 bg-sensor/10',
  operator: 'text-light border-light/30 bg-light/10',
  viewer: 'text-muted-foreground border-border bg-muted/50',
}

export function RoleBadge({ role, className }: { role: ProjectRole | null | undefined; className?: string }) {
  if (!role) return <span className={cn('text-[10px] text-muted-foreground', className)}>admin</span>
  return (
    <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', ROLE_TONE[role], className)}>
      {role}
    </span>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase()

/** Tenant + project context at the top of the sidebar. */
export function ProjectSwitcher() {
  const { data: workspace } = useQuery(workspaceQuery)
  const { data: projects = [] } = useProjects()
  const project = useCurrentProject()
  const canCreate = useCan('createProject')
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-1.5 group-data-[collapsible=icon]:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-sidebar-accent"
            data-testid="workspace-switcher"
          >
            <Building2 className="size-3.5" />
            <span className="truncate">{workspace?.name ?? 'Workspace'}</span>
            <ChevronsUpDown className="ml-auto size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="font-semibold">{workspace?.name}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {workspace?.plan} · {workspace?.region} · {workspace?.directory.length} people
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspace?.sites.map((s) => (
            <DropdownMenuItem key={s} disabled>
              <Building2 /> {s}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Lock /> Lumen Parks · Tokyo <span className="ml-auto text-[10px]">no access</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border bg-sidebar-accent/60 px-2.5 py-2 text-left transition hover:border-primary/40"
            data-testid="project-switcher"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/80 to-primary/30 text-[11px] font-bold text-primary-foreground">
              {project ? initials(project.name) : '—'}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{project?.name ?? 'No project'}</span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <RoleBadge role={project?.myRole} />
                <span className="truncate text-[10px] text-muted-foreground">
                  {project ? `${project.members.length} members` : ''}
                </span>
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Your projects</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => selectProject(p.id)} data-testid={`project-${p.id}`}>
              <FolderKanban />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {formatCount(p.counts.character + p.counts.environment + p.counts.show, 'document')}
                </span>
              </span>
              <RoleBadge role={p.myRole} />
              {p.id === project?.id && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
          {projects.length === 0 && <DropdownMenuItem disabled>You are not on any project yet</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {project && (
            <DropdownMenuItem asChild>
              <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                <Settings2 /> Members & access
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!canCreate} onSelect={() => setCreating(true)}>
            <Plus /> New project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  const submit = async () => {
    setBusy(true)
    try {
      const p = await api('createProject', { body: { id, name, description } })
      await qc.invalidateQueries({ queryKey: ['projects'] })
      selectProject(p.id)
      toast.success(`Created ${p.name}`, { description: 'You are its owner. Invite people from Members & access.' })
      onOpenChange(false)
      setName('')
      setDescription('')
      await navigate({ to: '/projects/$projectId', params: { projectId: p.id } })
    } catch (err) {
      toast.error(problemMessage(err).title, { description: problemMessage(err).detail })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project holds the figures, attractions and shows of one programme, and its own access list.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="project-name">Name</FieldLabel>
          <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverboat Expedition" />
          <FieldDescription className="font-mono">{id || 'project-id'}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="project-description">Description</FieldLabel>
          <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={submit} disabled={!id || busy}>
            {busy ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
