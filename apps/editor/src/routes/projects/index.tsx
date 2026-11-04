import type { Project } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Clapperboard, Trash } from 'lucide-react'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { DeletedProjectRow, DeleteProjectButton } from '@/components/project-delete'
import { NewProjectDialog, RoleBadge, StageBadge, StepDots, TeamAvatars } from '@/components/project-ui'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { timeAgo } from '@/lib/format'
import { deletedProjectsQuery, locationsQuery, useProjectStage, useProjects } from '@/lib/project'
import { docsQuery } from '@/lib/queries'

export const Route = createFileRoute('/projects/')({ component: ProjectsPage })

function ProjectsPage() {
  const { data: projects = [] } = useProjects()
  const { data: deleted = [] } = useQuery(deletedProjectsQuery)
  return (
    <>
      <PageHeader eyebrow={`${projects.length} projects`} title="Projects" actions={<NewProjectDialog />} />
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
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto_7rem_2rem] items-center gap-4 px-5 py-2 text-[11px] text-muted-foreground">
              <span>Project</span>
              <span>Runs in</span>
              <span>Step</span>
              <span>Team</span>
              <span className="text-right">Updated</span>
              <span />
            </div>
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </Panel>
        )}
        {deleted.length > 0 && (
          <Panel className="divide-y overflow-hidden" data-testid="deleted-projects">
            <div className="flex items-center gap-2 px-5 py-3">
              <Trash className="size-4 text-muted-foreground" />
              <span className="font-semibold">Deleted ({deleted.length})</span>
              <span className="text-xs text-muted-foreground">
                Hidden and read-only. Owners and admins can recover them; nothing was erased.
              </span>
            </div>
            {deleted.map((p) => (
              <DeletedProjectRow key={p.id} project={p} />
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
      className="group grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto_7rem_2rem] items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2"
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
      <DeleteProjectButton project={project} />
    </Link>
  )
}
