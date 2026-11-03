import type { Project, ShowDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { LiveAttraction } from '@/components/live-attraction'
import { PageBody, PageHeader, Panel, Section } from '@/components/page'
import { NewProjectDialog, StageBadge, TeamAvatars } from '@/components/project-ui'
import { ShowStrip } from '@/components/show-strip'
import { formatMs } from '@/lib/format'
import { locationsQuery, STEPS, type StepKey, useProjectStage, useProjects } from '@/lib/project'
import { docQuery, docsQuery } from '@/lib/queries'
import { useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: Overview })

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
        eyebrow="Overview"
        title={`${greeting()}, ${user?.name ? user.name[0]?.toUpperCase() + user.name.slice(1) : 'there'}`}
        description="Every project moves left to right: animate, review, deploy, launch. Below, what each location is doing right now."
        actions={<NewProjectDialog />}
      />
      <PageBody>
        <Section
          title="Projects"
          description="One show each, aimed at one environment. Only projects you are on are listed."
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
              description={`${loc.region} · ${here.length} environments live`}
            >
              <div className="grid gap-6 2xl:grid-cols-2">
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STEPS.map((step) => (
        <Panel key={step.key} className="flex min-h-48 flex-col bg-surface/40" data-testid={`column-${step.key}`}>
          <div className="flex items-center gap-2.5 border-b px-4 py-3">
            <span className="flex size-6 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-semibold text-primary">
              {step.n}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{step.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{COLUMN_HINT[step.key]}</div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-2.5">
            {projects.map((p) => (
              <BoardCard key={p.id} project={p} column={step.key} />
            ))}
          </div>
        </Panel>
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
        'group space-y-2.5 rounded-lg border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/40',
        stage.live && 'border-motion/40',
      )}
      data-testid={`board-${project.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:text-primary">{project.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId}
            {draft && ` · ${formatMs(draft.durationMs, false)}`}
          </div>
        </div>
        <StageBadge stage={stage} />
      </div>
      <div className="rounded-md border bg-sidebar/70 px-2 py-1">
        {draft ? <ShowStrip show={draft} className="h-10" /> : <div className="h-10" />}
      </div>
      <TeamAvatars project={project} />
    </Link>
  )
}
