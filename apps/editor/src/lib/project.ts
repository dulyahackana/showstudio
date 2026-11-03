import { type DocumentSummary, type Project, type ProjectPermission, projectAllows } from '@studio/schema'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from './api'
import { envStatusQuery } from './queries'
import { canCall, useUser } from './session'

/*
 * Workspace structure in the editor: projects (one show each, private to their team),
 * locations (environments, shared) and the library (characters and assets, shared).
 */

export const projectsQuery = queryOptions({ queryKey: ['projects'], queryFn: () => api('listProjects') })
export const projectQuery = (projectId: string) =>
  queryOptions({ queryKey: ['project', projectId], queryFn: () => api('getProject', { params: { projectId } }) })
export const locationsQuery = queryOptions({
  queryKey: ['locations'],
  queryFn: () => api('listLocations'),
  staleTime: 60_000,
})
export const workspaceQuery = queryOptions({
  queryKey: ['workspace'],
  queryFn: () => api('getWorkspace'),
  staleTime: Number.POSITIVE_INFINITY,
})

export function useProjects() {
  return useQuery(projectsQuery)
}

/** Project-level permission (admins always pass), mirroring PROJECT_PERMISSIONS on the server. */
export function useProjectCan(permission: ProjectPermission, project: Project | null | undefined): boolean {
  const user = useUser()
  if (user?.roles.includes('admin')) return true
  return projectAllows(project?.myRole, permission)
}

/**
 * Permission on the project that owns a document. Library and location documents
 * (projectId null) belong to no project: only the workspace role applies to them.
 */
export function useDocPermission(projectId: string | null | undefined, permission: ProjectPermission): boolean {
  const user = useUser()
  const { data: projects = [] } = useProjects()
  if (projectId === null) return true
  if (user?.roles.includes('admin')) return true
  return projectAllows(projects.find((p) => p.id === projectId)?.myRole, permission)
}

/** May the current user change this document? Workspace role (contract) and, for shows, project role. */
export function useCanEditDoc(doc: Pick<DocumentSummary, 'projectId'> | undefined): boolean {
  const user = useUser()
  const project = useDocPermission(doc ? doc.projectId : undefined, 'edit')
  return !!doc && canCall(user, 'saveDraft') && project
}

/** The four steps every project goes through, in order. */
export const STEPS = [
  { key: 'animate', n: 1, label: 'Animate', to: '/projects/$projectId/show', blurb: 'Author the timeline' },
  { key: 'review', n: 2, label: 'Review', to: '/projects/$projectId/review', blurb: 'Safety sign-off' },
  { key: 'deploy', n: 3, label: 'Deploy', to: '/projects/$projectId/deploy', blurb: 'Stage on every device' },
  { key: 'launch', n: 4, label: 'Launch', to: '/projects/$projectId/launch', blurb: 'Run it in the park' },
] as const
export type StepKey = (typeof STEPS)[number]['key']

export interface ProjectStage {
  /** The step waiting for someone to act. */
  stage: StepKey
  /** Short status for badges, e.g. "r2 in review", "live". */
  label: string
  live: boolean
  rejected: boolean
}

/**
 * Where a project stands, from its show's revisions and its environment's live status:
 * never published → animate; latest revision waiting → review (rejected → back to animate);
 * approved but not staged everywhere → deploy; good to go → launch.
 */
export function useProjectStage(project: Project | undefined): ProjectStage {
  const { data: status } = useQuery({ ...envStatusQuery(project?.environmentId ?? ''), enabled: !!project })
  const show = project?.show
  if (!project || !show?.latestRevision) return { stage: 'animate', label: 'draft', live: false, rejected: false }
  if (show.latestRevisionStatus === 'rejected')
    return { stage: 'animate', label: `r${show.latestRevision} rejected`, live: false, rejected: true }
  if (show.latestRevisionStatus === 'published')
    return { stage: 'review', label: `r${show.latestRevision} in review`, live: false, rejected: false }
  const approved = show.latestApprovedRevision
  const prepared = status?.prepared.find((p) => p.showId === project.id && p.revision === approved)
  if (!prepared?.goodToGo)
    return {
      stage: 'deploy',
      label: prepared ? `staging ${prepared.stagedOn}/${prepared.targets}` : `r${approved} approved`,
      live: false,
      rejected: false,
    }
  const live = status?.run?.showId === project.id && ['scheduled', 'running'].includes(status.run.status)
  return { stage: 'launch', label: live ? 'live' : 'good to go', live, rejected: false }
}

export const stepIndex = (key: StepKey) => STEPS.findIndex((s) => s.key === key)
