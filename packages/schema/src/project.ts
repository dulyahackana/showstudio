import { z } from 'zod'
import { Id, Timestamp } from './common.ts'

/*
 * Product-lifecycle structure: a workspace (the company) holds projects (one per
 * attraction programme); every document belongs to exactly one project, and access is
 * granted per project. Global roles say what kind of work someone does; the project
 * role says where they may do it. Both must allow an action (admins bypass).
 */

export const ProjectRole = z.enum(['owner', 'editor', 'reviewer', 'operator', 'viewer']).meta({
  id: 'ProjectRole',
  description:
    'owner: everything incl. members; editor: author documents; reviewer: approve/reject; operator: deploy/launch; viewer: read',
})
export type ProjectRole = z.infer<typeof ProjectRole>

/** Which project roles grant each permission. The API enforces it; the editor hides what you cannot do. */
export const PROJECT_PERMISSIONS = {
  read: ['owner', 'editor', 'reviewer', 'operator', 'viewer'],
  edit: ['owner', 'editor'],
  review: ['owner', 'reviewer'],
  operate: ['owner', 'operator'],
  manage: ['owner'],
} as const satisfies Record<string, readonly ProjectRole[]>
export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS

export const projectAllows = (role: ProjectRole | null | undefined, permission: ProjectPermission): boolean =>
  !!role && (PROJECT_PERMISSIONS[permission] as readonly ProjectRole[]).includes(role)

export const ProjectMember = z
  .object({ user: z.string(), role: ProjectRole, addedBy: z.string(), addedAt: Timestamp })
  .meta({ id: 'ProjectMember' })
export type ProjectMember = z.infer<typeof ProjectMember>

export const Project = z
  .object({
    id: Id,
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    createdAt: Timestamp,
    createdBy: z.string(),
    myRole: ProjectRole.nullable().describe('Your role in this project; null for admins who are not members'),
    members: z.array(ProjectMember),
    counts: z.object({ character: z.number().int(), environment: z.number().int(), show: z.number().int() }),
  })
  .meta({ id: 'Project' })
export type Project = z.infer<typeof Project>
export const ProjectList = z.array(Project).meta({ id: 'ProjectList' })

export const CreateProjectRequest = z
  .object({ id: Id, name: z.string().min(1).max(120), description: z.string().max(2000).default('') })
  .meta({ id: 'CreateProjectRequest' })

export const SetMemberRequest = z.object({ role: ProjectRole }).meta({ id: 'SetMemberRequest' })

export const ProjectParams = z.object({ projectId: Id })
export const MemberParams = z.object({ projectId: Id, user: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,59}$/) })

export const Person = z
  .object({ name: z.string(), displayName: z.string(), title: z.string() })
  .meta({ id: 'Person', description: 'Workspace directory entry (from the identity provider in production)' })
export type Person = z.infer<typeof Person>

export const Workspace = z
  .object({
    id: Id,
    name: z.string(),
    plan: z.string(),
    region: z.string(),
    sites: z.array(z.string()),
    directory: z.array(Person),
  })
  .meta({ id: 'Workspace', description: 'The tenant. Single, static workspace in this prototype' })
export type Workspace = z.infer<typeof Workspace>
