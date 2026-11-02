import { type Project, type ProjectPermission, projectAllows } from '@studio/schema'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { Store, useSelector } from '@tanstack/react-store'
import { api } from './api'
import { useUser } from './session'

/*
 * The project the studio is scoped to (lists, new documents, permissions). Remembered
 * per browser; falls back to the first project you can see.
 */
const KEY = 'studio.project'
const read = (): string | null => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
export const projectStore = new Store<{ id: string | null }>({ id: read() })
projectStore.subscribe((s) => {
  try {
    if (s.id) localStorage.setItem(KEY, s.id)
  } catch {
    /* storage unavailable */
  }
})
export const selectProject = (id: string) => projectStore.setState(() => ({ id }))

export const projectsQuery = queryOptions({ queryKey: ['projects'], queryFn: () => api('listProjects') })
export const workspaceQuery = queryOptions({
  queryKey: ['workspace'],
  queryFn: () => api('getWorkspace'),
  staleTime: Number.POSITIVE_INFINITY,
})

export function useProjects() {
  return useQuery(projectsQuery)
}

/** The current project, or undefined while loading / when you have none. */
export function useCurrentProject(): Project | undefined {
  const { data: projects = [] } = useProjects()
  const id = useSelector(projectStore, (s) => s.id)
  const busiest = [...projects].sort(
    (a, b) => b.counts.show + b.counts.environment + b.counts.character - (a.counts.show + a.counts.environment + a.counts.character),
  )[0]
  return projects.find((p) => p.id === id) ?? busiest
}

/** Project-level permission (admins always pass), mirroring PROJECT_PERMISSIONS on the server. */
export function useProjectCan(permission: ProjectPermission, project?: Project | null): boolean {
  const user = useUser()
  const current = useCurrentProject()
  const p = project === undefined ? current : project
  if (user?.roles.includes('admin')) return true
  return projectAllows(p?.myRole, permission)
}

/** Permission on the project that owns a given document. */
export function useDocPermission(projectId: string | undefined, permission: ProjectPermission): boolean {
  const user = useUser()
  const { data: projects = [] } = useProjects()
  if (user?.roles.includes('admin')) return true
  return projectAllows(projects.find((p) => p.id === projectId)?.myRole, permission)
}
