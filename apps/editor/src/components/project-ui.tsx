import type { Project, ProjectRole } from '@studio/schema'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { NumberInput } from '@/components/fields'
import { PersonAvatar } from '@/components/person'
import { ToneBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api, problemMessage } from '@/lib/api'
import { slugify } from '@/lib/format'
import {
  locationsQuery,
  type ProjectStage,
  STEPS,
  type StepKey,
  stepIndex,
  useProjectStage,
  workspaceQuery,
} from '@/lib/project'
import { docsQuery } from '@/lib/queries'
import { useCan } from '@/lib/session'
import { cn } from '@/lib/utils'

export const ROLE_TONE: Record<ProjectRole, string> = {
  owner: 'text-primary border-primary/30 bg-primary/10',
  editor: 'text-motion border-motion/30 bg-motion/10',
  reviewer: 'text-audio border-audio/30 bg-audio/10',
  operator: 'text-sky-300 border-sky-300/30 bg-sky-300/10',
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

/** Overlapping initials of a project's team. */
export function TeamAvatars({ project, max = 5 }: { project: Project; max?: number }) {
  const { data: workspace } = useQuery(workspaceQuery)
  const shown = project.members.slice(0, max)
  return (
    <span className="flex -space-x-1">
      {shown.map((m) => (
        <PersonAvatar
          key={m.user}
          name={m.user}
          title={`${workspace?.directory.find((p) => p.name === m.user)?.displayName ?? m.user} · ${m.role}`}
        />
      ))}
      {project.members.length > max && (
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background">
          +{project.members.length - max}
        </span>
      )}
    </span>
  )
}

const STAGE_TONE: Record<StepKey, 'muted' | 'review' | 'info' | 'ok'> = {
  animate: 'muted',
  review: 'review',
  deploy: 'info',
  launch: 'ok',
}

export function StageBadge({ stage }: { stage: ProjectStage }) {
  if (stage.rejected) return <ToneBadge t="bad">{stage.label}</ToneBadge>
  return <ToneBadge t={STAGE_TONE[stage.stage]}>{stage.label}</ToneBadge>
}

/** Four dots, one per step: done, current, upcoming. */
export function StepDots({ stage, small }: { stage: ProjectStage; small?: boolean }) {
  const current = stepIndex(stage.stage)
  return (
    <span
      className={cn('flex shrink-0 items-center', small ? 'gap-0.5' : 'gap-1')}
      title={`Step ${current + 1} of 4: ${STEPS[current]?.label} · ${stage.label}`}
    >
      {STEPS.map((s, i) => (
        <span
          key={s.key}
          className={cn(
            'rounded-full',
            small ? 'h-1 w-2.5' : 'h-1.5 w-4',
            i < current ? 'bg-primary/70' : i === current ? (stage.live ? 'bg-motion' : 'bg-primary') : 'bg-muted',
            i === current && 'shadow-[0_0_8px_var(--primary)]',
          )}
        />
      ))}
    </span>
  )
}

/**
 * The project's pipeline as navigation: Animate → Review → Deploy → Launch. Two
 * separate signals: the highlighted pill is the page you are on; the circles are the
 * project's progress (check = done, green ring = waiting for someone, grey = later).
 */
export function ProjectStepper({ project }: { project: Project }) {
  const stage = useProjectStage(project)
  const current = stepIndex(stage.stage)
  return (
    <nav className="flex items-center gap-1" aria-label="Project steps">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          {i > 0 && <span className={cn('h-px w-4', i <= current ? 'bg-primary/50' : 'bg-border')} />}
          <Link
            to={s.to}
            params={{ projectId: project.id }}
            className="group flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            activeProps={{ className: 'bg-primary/10 text-foreground ring-1 ring-primary/40' }}
            title={i === current ? `${s.label}: this is where the project is now` : s.blurb}
            data-testid={`step-${s.key}`}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                i < current && 'border-primary/40 bg-primary/15 text-primary',
                i === current && 'border-primary text-primary ring-2 ring-primary/20',
                i > current && 'border-border',
              )}
            >
              {i < current ? <Check className="size-3" /> : s.n}
            </span>
            <span className="font-medium">{s.label}</span>
            {i === current && stage.live && <span className="size-1.5 animate-pulse rounded-full bg-motion" />}
          </Link>
        </div>
      ))}
    </nav>
  )
}

/** Name, id, target environment (grouped by location) and length; creates the project and its show. */
export function NewProjectDialog({ trigger }: { trigger?: 'button' | 'icon' }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const canCreate = useCan('createProject')
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const published = envs.filter((e) => e.latestRevision)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [envId, setEnvId] = useState('')
  const [seconds, setSeconds] = useState(30)
  const [busy, setBusy] = useState(false)
  const id = slugify(name)
  const env = published.find((e) => e.id === envId)

  const submit = async () => {
    if (!env?.latestRevision) return
    setBusy(true)
    try {
      const p = await api('createProject', {
        body: {
          id,
          draft: {
            schemaVersion: 1,
            name,
            description,
            environment: { id: env.id, revision: env.latestRevision },
            durationMs: Math.round(seconds * 1000),
            tracks: { motion: {}, lights: {}, audio: {} },
            behaviors: [],
          },
        },
      })
      await qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`Created ${p.name}`, { description: 'You own it. Add your team from the Team tab.' })
      setOpen(false)
      setName('')
      setDescription('')
      await navigate({ to: '/projects/$projectId/show', params: { projectId: p.id } })
    } catch (err) {
      toast.error(problemMessage(err).title, { description: problemMessage(err).detail })
    } finally {
      setBusy(false)
    }
  }

  if (!canCreate) return null
  return (
    <>
      {trigger === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="New project"
          className="flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)} data-testid="new-project">
          <Plus /> New project
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project is one show for one environment. You own it and choose who may animate, review and run it.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="project-name">Show name</FieldLabel>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Dragon's Lullaby"
              autoFocus
            />
            <FieldDescription className="font-mono">{id || 'project-id'}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <Select value={envId} onValueChange={setEnvId}>
              <SelectTrigger className="w-full" data-testid="project-environment">
                <SelectValue placeholder="Where will it run?" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => {
                  const here = published.filter((e) => e.locationId === loc.id)
                  if (!here.length) return null
                  return (
                    <SelectGroup key={loc.id}>
                      <SelectLabel>{loc.name}</SelectLabel>
                      {here.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} · r{e.latestRevision}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            <FieldDescription>The show is pinned to this environment revision.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Length (seconds)</FieldLabel>
            <NumberInput value={seconds} min={1} max={3600} step={1} onChange={setSeconds} />
          </Field>
          <Field>
            <FieldLabel htmlFor="project-description">Description</FieldLabel>
            <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button onClick={submit} disabled={!id || !env || busy} data-testid="create-project">
              {busy ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
