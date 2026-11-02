import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useCurrentProject } from '@/lib/project'

export const Route = createFileRoute('/projects/')({ component: CurrentProject })

/** "Members & access" in the sidebar opens the current project. */
function CurrentProject() {
  const project = useCurrentProject()
  if (!project) return <p className="p-8 text-sm text-muted-foreground">You are not on any project yet.</p>
  return <Navigate to="/projects/$projectId" params={{ projectId: project.id }} replace />
}
