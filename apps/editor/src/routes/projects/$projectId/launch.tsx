import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { OperatorConsole } from '@/features/fleet/operator-console'
import { projectQuery } from '@/lib/project'

export const Route = createFileRoute('/projects/$projectId/launch')({ component: LaunchStep })

/** Step 4: the control room of the project's environment, with this show first. */
function LaunchStep() {
  const { projectId } = Route.useParams()
  const { data: project } = useQuery(projectQuery(projectId))
  if (!project) return null
  return <OperatorConsole environmentId={project.environmentId} focusShowId={project.id} />
}
