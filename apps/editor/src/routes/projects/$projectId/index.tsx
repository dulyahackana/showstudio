import type { Project, RevisionSummary, ShowDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, MapPin, Mountain } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageBody, Panel } from '@/components/page'
import { RoleBadge, StageBadge } from '@/components/project-ui'
import { ShowStrip } from '@/components/show-strip'
import { Button } from '@/components/ui/button'
import { activeRun } from '@/features/fleet/live-frame'
import { api } from '@/lib/api'
import { formatMs, timeAgo } from '@/lib/format'
import {
  locationsQuery,
  type ProjectStage,
  projectQuery,
  STEPS,
  type StepKey,
  stepIndex,
  useProjectCan,
  useProjectStage,
  workspaceQuery,
} from '@/lib/project'
import { docQuery, docsQuery, envStatusQuery, qk, revisionsQuery } from '@/lib/queries'
import { canCall, useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/projects/$projectId/')({ component: ProjectHome })

/** Where the project stands: one card per step, the current one says what happens next. */
function ProjectHome() {
  const { projectId } = Route.useParams()
  const { data: project } = useQuery(projectQuery(projectId))
  const stage = useProjectStage(project)
  if (!project) return null
  return (
    <PageBody>
      <Hero project={project} stage={stage} />
      <Steps project={project} stage={stage} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Activity projectId={projectId} />
        <TeamCard project={project} />
      </div>
    </PageBody>
  )
}

function Hero({ project, stage }: { project: Project; stage: ProjectStage }) {
  const { data: doc } = useQuery(docQuery(project.id))
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const { data: locations = [] } = useQuery(locationsQuery)
  const draft = doc?.draft as ShowDefinition | undefined
  const env = envs.find((e) => e.id === project.environmentId)
  const location = locations.find((l) => l.id === env?.locationId)
  return (
    <Panel className="grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow">Project · one show</span>
          <StageBadge stage={stage} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground">{project.description || 'No description yet.'}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Runs in</span>
          {location && (
            <Link
              to="/locations/$locationId"
              params={{ locationId: location.id }}
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              <MapPin className="size-3.5 text-muted-foreground" /> {location.name}
            </Link>
          )}
          <span className="text-muted-foreground/50">›</span>
          <Link
            to="/environments/$id"
            params={{ id: project.environmentId }}
            className="inline-flex items-center gap-1 font-medium hover:text-primary"
          >
            <Mountain className="size-3.5 text-muted-foreground" /> {env?.name ?? project.environmentId}
          </Link>
          {draft && (
            <span
              className="rounded border px-1.5 py-px font-mono text-[11px] text-muted-foreground"
              title={`The show is pinned to revision ${draft.environment.revision} of this environment's layout. Later layout changes don't affect it until someone re-pins it.`}
            >
              layout r{draft.environment.revision}
            </span>
          )}
        </div>
      </div>
      <div className="bg-blueprint flex flex-col justify-center gap-2 border-l bg-sidebar/60 px-6 py-5">
        {draft && (
          <>
            <ShowStrip show={draft} className="h-24" />
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>0:00</span>
              <span>
                {formatMs(draft.durationMs, false)} · {draft.behaviors.length} sensor responses
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function Steps({ project, stage }: { project: Project; stage: ProjectStage }) {
  const user = useUser()
  const editRole = useProjectCan('edit', project)
  const reviewRole = useProjectCan('review', project)
  const operateRole = useProjectCan('operate', project)
  const can = {
    edit: editRole && canCall(user, 'saveDraft'),
    review: reviewRole && canCall(user, 'approveRevision'),
    deploy: operateRole && canCall(user, 'createDeployment'),
    launch: operateRole && canCall(user, 'launch'),
  }
  const { data: revisions = [] } = useQuery(revisionsQuery(project.id))
  const { data: status, dataUpdatedAt } = useQuery(envStatusQuery(project.environmentId))
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const envName = envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId
  const show = project.show
  const latest: RevisionSummary | undefined = revisions[0]
  const approved = revisions.find((r) => r.status === 'approved')
  const prepared = status?.prepared.find((p) => p.showId === project.id && p.revision === approved?.revision)
  const run = activeRun(status)
  const live = run?.showId === project.id
  const elapsed = live && status ? Math.max(0, Date.now() + (status.serverTime - dataUpdatedAt) - run.startAt) : 0

  const text: Record<StepKey, ReactNode> = {
    animate: (
      <>
        Draft saved {timeAgo(show.updatedAt)} by <span className="capitalize">{show.updatedBy}</span>.{' '}
        {stage.rejected ? `r${latest?.revision} came back: ${latest?.reviewNote || 'see the review'}.` : ''}
        {!show.latestRevision && 'Publish a revision when it is ready for review.'}
      </>
    ),
    review: latest
      ? latest.status === 'published'
        ? `r${latest.revision} is waiting for a safety reviewer. Authors cannot approve their own work.`
        : approved
          ? `r${approved.revision} approved and signed by ${approved.reviewedBy}.`
          : `r${latest.revision} rejected by ${latest.reviewedBy}.`
      : 'Nothing published yet.',
    deploy: !approved
      ? 'Needs an approved revision.'
      : prepared?.goodToGo
        ? `r${approved.revision} is good to go on all ${prepared.targets} controllers of ${envName}.`
        : prepared
          ? `Staging r${approved.revision}: ${prepared.stagedOn}/${prepared.targets} controllers verified.`
          : `r${approved.revision} is not on ${envName} yet.`,
    launch: live
      ? `Live now · ${formatMs(Math.min(elapsed, run.durationMs), false)} / ${formatMs(run.durationMs, false)}`
      : prepared?.goodToGo
        ? `Ready. Launch it from the control room of ${envName}.`
        : 'Deploy it first.',
  }
  // Each step's button says what you can do there: act if your roles allow it, otherwise look.
  const action: Record<StepKey, string> = {
    animate: can.edit ? 'Open timeline' : 'View timeline',
    review: can.review ? 'Review revisions' : 'View revisions',
    deploy: can.deploy ? 'Deploy' : 'View devices',
    launch: can.launch ? 'Open control room' : 'View control room',
  }
  const current = stepIndex(stage.stage)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STEPS.map((s, i) => (
        <Panel
          key={s.key}
          className={cn(
            'relative flex flex-col gap-3 p-5',
            i === current && 'border-primary/50 shadow-[0_0_0_1px_oklch(0.79_0.17_155/25%)]',
          )}
          data-testid={`home-step-${s.key}`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
                i < current && 'border-primary/40 bg-primary/15 text-primary',
                i === current && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {s.n}
            </span>
            <div>
              <div className="font-semibold">{s.label}</div>
              <div className="text-[11px] text-muted-foreground">{s.blurb}</div>
            </div>
            {i === current && <span className="text-eyebrow ml-auto text-primary">Next</span>}
            {i < current && <span className="text-eyebrow ml-auto">Done</span>}
          </div>
          <p className="flex-1 text-sm text-muted-foreground">{text[s.key]}</p>
          <Button
            size="sm"
            variant={i === current && can[s.key === 'animate' ? 'edit' : s.key] ? 'default' : 'outline'}
            className="self-start"
            asChild
          >
            <Link to={s.to} params={{ projectId: project.id }}>
              {action[s.key]} <ArrowRight />
            </Link>
          </Button>
        </Panel>
      ))}
    </div>
  )
}

function Activity({ projectId }: { projectId: string }) {
  const { data = [] } = useQuery({
    queryKey: [...qk.audit, 'project', projectId],
    queryFn: () => api('listAudit', { query: { limit: 300 } }),
    refetchInterval: 5000,
    // Revisions, deployments and launches are logged as "<show>@<revision>".
    select: (entries) => entries.filter((e) => e.entityId === projectId || e.entityId.startsWith(`${projectId}@`)),
  })
  return (
    <Panel>
      <div className="border-b px-5 py-3 font-semibold">Activity</div>
      <ol className="divide-y">
        {data.slice(0, 10).map((e) => (
          <li key={e.seq} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className="font-medium capitalize">{e.actor}</span>
            <span className="text-muted-foreground">{e.action.replace(/[._]/g, ' ')}</span>
            {e.entityId.includes('@') && (
              <span className="font-mono text-xs text-muted-foreground">r{e.entityId.split('@')[1]}</span>
            )}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{timeAgo(e.at)}</span>
          </li>
        ))}
        {data.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">Nothing yet.</li>}
      </ol>
    </Panel>
  )
}

function TeamCard({ project }: { project: Project }) {
  const { data: workspace } = useQuery(workspaceQuery)
  const canManage = useProjectCan('manage', project)
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <span className="font-semibold">Team</span>
        <Link
          to="/projects/$projectId/team"
          params={{ projectId: project.id }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {canManage ? 'Manage →' : 'Roles →'}
        </Link>
      </div>
      <div className="divide-y">
        {project.members.map((m) => {
          const person = workspace?.directory.find((p) => p.name === m.user)
          return (
            <div key={m.user} className="flex items-center gap-3 px-5 py-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold uppercase">
                {m.user.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{person?.displayName ?? m.user}</div>
                <div className="truncate text-[11px] text-muted-foreground">{person?.title}</div>
              </div>
              <RoleBadge role={m.role} />
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
