import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { ChevronRight, Mountain, Users } from 'lucide-react'
import { ProjectStepper, TeamAvatars } from '@/components/project-ui'
import { locationsQuery, projectQuery } from '@/lib/project'
import { docsQuery } from '@/lib/queries'

export const Route = createFileRoute('/projects/$projectId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(projectQuery(params.projectId)),
  component: ProjectLayout,
})

/**
 * A project is one show. Its header carries the whole flow: where you are (Projects ›
 * show), the four steps, the environment it runs in, and the team.
 */
function ProjectLayout() {
  const { projectId } = Route.useParams()
  const { data: project } = useQuery(projectQuery(projectId))
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const { data: locations = [] } = useQuery(locationsQuery)
  if (!project) return null
  const env = envs.find((e) => e.id === project.environmentId)
  const location = locations.find((l) => l.id === env?.locationId)

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-surface/60 px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to="/projects" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="truncate text-base font-semibold tracking-tight hover:text-primary"
            activeOptions={{ exact: true }}
            data-testid="doc-title"
          >
            {project.name}
          </Link>
        </div>
        <div className="mx-auto">
          <ProjectStepper project={project} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {env && (
            <Link
              to="/environments/$id"
              params={{ id: env.id }}
              title={`Runs in ${location?.name ?? ''} › ${env.name}`}
              className="hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground xl:flex"
            >
              <Mountain className="size-3.5" />
              <span className="max-w-40 truncate">{env.name}</span>
            </Link>
          )}
          <Link
            to="/projects/$projectId/team"
            params={{ projectId }}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            activeProps={{ className: 'bg-surface-2 text-foreground ring-1 ring-border' }}
            data-testid="project-team"
          >
            <Users className="size-4" />
            <span className="hidden 2xl:inline">Team</span>
            <TeamAvatars project={project} max={3} />
          </Link>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
