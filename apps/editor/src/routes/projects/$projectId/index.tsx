import type { Project, RevisionSummary, ShowDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Check, FileJson, MapPin, Mountain, Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageBody, Panel } from '@/components/page'
import { PersonAvatar } from '@/components/person'
import { RoleBadge, StageBadge } from '@/components/project-ui'
import { useDownloadRevision } from '@/components/revisions-panel'
import { ShowStrip } from '@/components/show-strip'
import { RevisionBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { activeRun } from '@/features/fleet/live-frame'
import { api } from '@/lib/api'
import { groupAudit } from '@/lib/audit-text'
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
        <div className="space-y-6">
          <RevisionsCard project={project} />
          <TeamCard project={project} />
        </div>
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
      <div className="space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <StageBadge stage={stage} />
        </div>
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
          {draft && (env?.latestRevision ?? 0) > draft.environment.revision && (
            <Link
              to="/projects/$projectId/show"
              params={{ projectId: project.id }}
              className="rounded border border-motion/40 bg-motion/10 px-1.5 py-px text-[11px] text-motion hover:bg-motion/20"
              title="The layout changed after this show was made. Open the timeline to re-pin it, then publish for review."
            >
              layout r{env?.latestRevision} published: update the show →
            </Link>
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
    review: can.review ? 'Open review' : 'View review',
    deploy: can.deploy ? 'Deploy' : 'View devices',
    launch: can.launch ? 'Open control room' : 'View control room',
  }
  const current = stepIndex(stage.stage)

  return (
    <Panel className="grid overflow-hidden md:grid-cols-2 xl:grid-cols-4">
      {STEPS.map((s, i) => {
        const mine = can[s.key === 'animate' ? 'edit' : s.key]
        return (
          <Link
            key={s.key}
            to={s.to}
            params={{ projectId: project.id }}
            className={cn(
              'group relative flex flex-col gap-2 border-b p-4 transition hover:bg-surface-2/60 md:odd:border-r xl:border-b-0 xl:not-last:border-r',
              i === current && 'bg-primary/[0.06] hover:bg-primary/[0.09]',
            )}
            data-testid={`home-step-${s.key}`}
          >
            {i === current && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                  i < current && 'border-primary/40 bg-primary/15 text-primary',
                  i === current && 'border-primary text-primary',
                )}
              >
                {i < current ? <Check className="size-3" /> : s.n}
              </span>
              <span className="text-sm font-semibold">{s.label}</span>
              {i === current && <span className="text-eyebrow ml-auto text-primary">Now</span>}
            </div>
            <p className="line-clamp-2 min-h-10 text-[13px] leading-5 text-muted-foreground">{text[s.key]}</p>
            <span
              className={cn(
                'mt-auto inline-flex items-center gap-1 text-xs font-medium',
                i === current && mine ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            >
              {action[s.key]} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        )
      })}
    </Panel>
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
  const groups = groupAudit(data).slice(0, 8)
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <span className="font-semibold">Activity</span>
        <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground">
          Audit log →
        </Link>
      </div>
      <ol className="divide-y">
        {groups.map((g) => {
          const e = g.entries[0]
          if (!e) return null
          return (
            <li
              key={e.seq}
              className="flex items-center gap-3 px-5 py-2.5 text-sm"
              title={g.entries.map((x) => `#${x.seq} ${x.action}`).join('\n')}
            >
              <PersonAvatar name={e.actor} className="ring-0" />
              <span className="min-w-0">
                <span className="font-medium capitalize">{e.actor}</span>{' '}
                <span className="text-muted-foreground">{g.sentence}</span>
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={new Date(e.at).toLocaleString()}>
                {timeAgo(e.at)}
              </span>
            </li>
          )
        })}
        {data.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">Nothing yet.</li>}
      </ol>
    </Panel>
  )
}

/** The latest revisions at a glance, with their downloads; the catalog has them all. */
function RevisionsCard({ project }: { project: Project }) {
  const user = useUser()
  const { data: revisions = [] } = useQuery(revisionsQuery(project.id))
  const operate = useProjectCan('operate', project)
  const canPackage = canCall(user, 'downloadPackage') && operate
  const download = useDownloadRevision(project.id)
  return (
    <Panel data-testid="home-revisions">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <span className="font-semibold">Revisions</span>
        <Link
          to="/projects/$projectId/revisions"
          params={{ projectId: project.id }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          All {revisions.length} →
        </Link>
      </div>
      <ol className="divide-y">
        {revisions.slice(0, 4).map((r) => (
          <li key={r.revision} className="flex items-center gap-2.5 px-5 py-2">
            <span className="font-mono text-sm">r{r.revision}</span>
            <RevisionBadge status={r.status} />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={r.note}>
              {r.note || `by ${r.publishedBy}`} · {timeAgo(r.publishedAt)}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Download the definition (.json)"
              onClick={() => download.mutate({ revision: r.revision, as: 'definition' })}
            >
              <FileJson />
            </Button>
            {r.status === 'approved' && r.signed && canPackage && (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Download the offline install package (.zip)"
                onClick={() => download.mutate({ revision: r.revision, as: 'package' })}
              >
                <Package />
              </Button>
            )}
          </li>
        ))}
        {revisions.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">Not published yet.</li>}
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
              <PersonAvatar name={m.user} className="size-7 ring-0" />
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
