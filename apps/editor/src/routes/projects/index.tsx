import type { Project } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clapperboard } from 'lucide-react'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { NewProjectDialog, RoleBadge, StageBadge, StepDots, TeamAvatars } from '@/components/project-ui'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { timeAgo } from '@/lib/format'
import { locationsQuery, useProjectStage, useProjects } from '@/lib/project'
import { docsQuery } from '@/lib/queries'

export const Route = createFileRoute('/projects/')({ component: ProjectsPage })

function ProjectsPage() {
  const { data: projects = [] } = useProjects()
  return (
    <>
      <PageHeader
        eyebrow={`${projects.length} projects`}
        title="Projects"
        description="A project is one show for one environment: animate it, get it reviewed, deploy it, launch it. Each project has its own team; only members see it."
        actions={<NewProjectDialog />}
      />
      <PageBody>
        {projects.length === 0 ? (
          <Empty className="bg-blueprint rounded-xl border border-dashed py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard />
              </EmptyMedia>
              <EmptyTitle>You are not on any project yet</EmptyTitle>
              <EmptyDescription>Start one, or ask a project owner to add you to their team.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Panel className="divide-y overflow-hidden">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto_7rem] items-center gap-4 px-5 py-2 text-[11px] text-muted-foreground">
              <span>Show</span>
              <span>Runs in</span>
              <span>Step</span>
              <span>Team</span>
              <span className="text-right">Updated</span>
            </div>
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </Panel>
        )}
      </PageBody>
    </>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const stage = useProjectStage(project)
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const { data: locations = [] } = useQuery(locationsQuery)
  const env = envs.find((e) => e.id === project.environmentId)
  const location = locations.find((l) => l.id === env?.locationId)
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto_7rem] items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2"
      data-testid={`project-row-${project.id}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:text-primary">{project.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{project.id}</span> <RoleBadge role={project.myRole} />
        </span>
      </span>
      <span className="min-w-0 truncate text-sm">
        <span className="text-muted-foreground">{location?.name} › </span>
        {env?.name ?? project.environmentId}
      </span>
      <span className="flex items-center gap-2.5">
        <StepDots stage={stage} />
        <StageBadge stage={stage} />
      </span>
      <TeamAvatars project={project} max={4} />
      <span className="text-right text-xs text-muted-foreground">{timeAgo(project.show.updatedAt)}</span>
    </Link>
  )
}
