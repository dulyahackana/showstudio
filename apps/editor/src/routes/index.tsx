import type { Project, ShowDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, MapPin } from 'lucide-react'
import { LiveAttraction } from '@/components/live-attraction'
import { PageBody, PageHeader, Panel, Section } from '@/components/page'
import { NewProjectDialog, StageBadge, TeamAvatars } from '@/components/project-ui'
import { ShowStrip } from '@/components/show-strip'
import { formatMs } from '@/lib/format'
import { locationsQuery, STEPS, type StepKey, useProjectCan, useProjectStage, useProjects } from '@/lib/project'
import { docQuery, docsQuery, revisionsQuery } from '@/lib/queries'
import { canCall, useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: Overview })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const COLUMN_HINT: Record<StepKey, string> = {
  animate: 'Being animated',
  review: 'Waiting for safety sign-off',
  deploy: 'Approved, going onto the devices',
  launch: 'Good to go, or live',
}

function Overview() {
  const user = useUser()
  const { data: projects = [] } = useProjects()
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: envs = [] } = useQuery(docsQuery('environment'))

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name ? user.name[0]?.toUpperCase() + user.name.slice(1) : 'there'}`}
        actions={<NewProjectDialog />}
      />
      <PageBody>
        <NextSteps projects={projects} />
        <Section
          title="Projects"
          actions={
            <Link to="/projects" className="text-xs text-muted-foreground hover:text-foreground">
              All projects →
            </Link>
          }
        >
          <Board projects={projects} />
        </Section>

        {locations.map((loc) => {
          const here = envs.filter((e) => e.locationId === loc.id && e.latestRevision)
          return (
            <Section
              key={loc.id}
              title={
                <Link
                  to="/locations/$locationId"
                  params={{ locationId: loc.id }}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <MapPin className="size-3.5 text-muted-foreground" /> {loc.name}
                </Link>
              }
              description={`${loc.region} · ${here.length} ${here.length === 1 ? 'attraction' : 'attractions'}`}
            >
              <div className="grid gap-6 xl:grid-cols-2">
                {here.map((e) => (
                  <LiveAttraction key={e.id} envId={e.id} />
                ))}
                {here.length === 0 && (
                  <Panel className="p-6 text-sm text-muted-foreground">No published environments here yet.</Panel>
                )}
              </div>
            </Section>
          )
        })}
      </PageBody>
    </>
  )
}

/** Projects placed in the column of the step waiting for someone. */
function Board({ projects }: { projects: Project[] }) {
  return (
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
      {STEPS.map((step) => (
        <div key={step.key} className="flex flex-col gap-2.5" data-testid={`column-${step.key}`}>
          <div className="flex items-center gap-2 border-t-2 border-primary/30 pt-2.5" title={COLUMN_HINT[step.key]}>
            <span className="text-eyebrow text-primary/80">{step.n}</span>
            <span className="text-sm font-semibold">{step.label}</span>
            <span className="truncate text-xs text-muted-foreground">{COLUMN_HINT[step.key]}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {projects.map((p) => (
              <BoardCard key={p.id} project={p} column={step.key} />
            ))}
            <p className="hidden rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground only:block">
              Nothing here
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function BoardCard({ project, column }: { project: Project; column: StepKey }) {
  const stage = useProjectStage(project)
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const { data: doc } = useQuery(docQuery(project.id))
  if (stage.stage !== column) return null
  const draft = doc?.draft as ShowDefinition | undefined
  const step = STEPS.find((s) => s.key === column)
  return (
    <Link
      to={step?.to ?? '/projects/$projectId'}
      params={{ projectId: project.id }}
      className={cn(
        'group space-y-3 rounded-xl border bg-card p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg',
        stage.live && 'border-motion/40',
      )}
      data-testid={`board-${project.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium group-hover:text-primary">{project.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId}
            {draft && ` · ${formatMs(draft.durationMs, false)}`}
          </div>
        </div>
        <StageBadge stage={stage} />
      </div>
      <div className="rounded-md bg-sidebar/70 px-2 py-1">
        {draft ? <ShowStrip show={draft} className="h-10" /> : <div className="h-10" />}
      </div>
      <div className="flex items-center justify-between">
        <TeamAvatars project={project} max={4} />
        <span className="text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100">
          {step?.label} <ArrowRight className="inline size-3" />
        </span>
      </div>
    </Link>
  )
}

/**
 * What is waiting for the signed-in person, from their roles: a revision to review,
 * a show to deploy or launch, a rejected revision to fix. Hidden when there is nothing.
 */
function NextSteps({ projects }: { projects: Project[] }) {
  return (
    <section className="hidden space-y-2 has-[li]:block" data-testid="next-steps">
      <h2 className="text-sm font-semibold">Your next steps</h2>
      <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
        {projects.map((p) => (
          <NextStep key={p.id} project={p} />
        ))}
      </ul>
    </section>
  )
}

function NextStep({ project }: { project: Project }) {
  const user = useUser()
  const stage = useProjectStage(project)
  const { data: revisions = [] } = useQuery(revisionsQuery(project.id))
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const edit = useProjectCan('edit', project)
  const review = useProjectCan('review', project)
  const operate = useProjectCan('operate', project)
  const env = envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId
  const latest = revisions[0]
  const can = (key: Parameters<typeof canCall>[1]) => canCall(user, key)

  let step: { text: string; detail: string; to: (typeof STEPS)[number]['to']; action: string } | null = null
  if (stage.stage === 'animate' && stage.rejected && edit && can('saveDraft'))
    step = {
      text: `Fix ${project.name}`,
      detail: `r${latest?.revision} came back: ${latest?.reviewNote || 'see the review'}`,
      to: '/projects/$projectId/show',
      action: 'Open timeline',
    }
  else if (stage.stage === 'review' && review && can('approveRevision') && latest && latest.publishedBy !== user?.name)
    step = {
      text: `Review r${latest.revision} of ${project.name}`,
      detail: `Published by ${cap(latest.publishedBy)}${latest.note ? `: ${latest.note}` : ''}`,
      to: '/projects/$projectId/review',
      action: 'Open review',
    }
  else if (stage.stage === 'deploy' && operate && can('createDeployment'))
    step = {
      text: `Deploy ${project.name}`,
      detail: `${stage.label} · onto every controller of ${env}`,
      to: '/projects/$projectId/deploy',
      action: 'Deploy',
    }
  else if (stage.stage === 'launch' && operate && can('launch'))
    step = {
      text: stage.live ? `${project.name} is live` : `Launch ${project.name}`,
      detail: stage.live ? `Running in ${env}` : `Good to go in ${env}`,
      to: '/projects/$projectId/launch',
      action: 'Control room',
    }
  if (!step) return null
  return (
    <li>
      <Link
        to={step.to}
        params={{ projectId: project.id }}
        className="group flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.05] px-4 py-3 transition hover:border-primary/60"
        data-testid={`next-${project.id}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover:text-primary">{step.text}</span>
          <span className="block truncate text-xs text-muted-foreground">{step.detail}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {step.action} <ArrowRight className="size-3.5" />
        </span>
      </Link>
    </li>
  )
}
