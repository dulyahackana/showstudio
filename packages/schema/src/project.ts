import { z } from 'zod'
import { DocumentSummary } from './api.ts'
import { Id, Timestamp } from './common.ts'
import { ShowDefinition } from './show.ts'

/*
 * How the workspace (the company) is organised:
 *
 *   Locations  where the hardware is: each park site holds its environments (attractions).
 *   Library    characters and assets, reused by every environment.
 *   Projects   one show each, aimed at one environment, with its own team.
 *
 * Locations and the library are shared with the whole workspace; a project is private to
 * its members. Workspace roles (engineer, safety, operator) say what kind of work someone
 * does; the project role says which shows they may do it on. Both must allow an action
 * (admins bypass).
 */

export const ProjectRole = z.enum(['owner', 'editor', 'reviewer', 'operator', 'viewer']).meta({
  id: 'ProjectRole',
  description:
    'owner: everything incl. members; editor: author the show; reviewer: approve/reject; operator: deploy/launch; viewer: read',
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
    id: Id.describe("Also the id of the project's show"),
    name: z.string().min(1).max(120).describe("The show's name"),
    description: z.string().max(2000),
    environmentId: Id.describe('The environment the show is made for'),
    show: DocumentSummary.describe("The project's show: draft, latest and latest approved revision"),
    createdAt: Timestamp,
    createdBy: z.string(),
    myRole: ProjectRole.nullable().describe('Your role in this project; null for admins who are not members'),
    members: z.array(ProjectMember),
  })
  .meta({ id: 'Project', description: 'One show, from first keyframe to launch, and the team allowed to work on it' })
export type Project = z.infer<typeof Project>
export const ProjectList = z.array(Project).meta({ id: 'ProjectList' })

export const CreateProjectRequest = z
  .object({ id: Id, draft: ShowDefinition.describe('Initial show draft; its name and description name the project') })
  .meta({ id: 'CreateProjectRequest' })

export const SetMemberRequest = z.object({ role: ProjectRole }).meta({ id: 'SetMemberRequest' })

export const ProjectParams = z.object({ projectId: Id })
export const MemberParams = z.object({ projectId: Id, user: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,59}$/) })

export const Person = z
  .object({ name: z.string(), displayName: z.string(), title: z.string(), role: z.string() })
  .meta({ id: 'Person', description: 'Workspace directory entry (from the identity provider in production)' })
export type Person = z.infer<typeof Person>

export const Workspace = z
  .object({
    id: Id,
    name: z.string(),
    plan: z.string(),
    region: z.string(),
    directory: z.array(Person),
  })
  .meta({ id: 'Workspace', description: 'The tenant. Single, static workspace in this prototype' })
export type Workspace = z.infer<typeof Workspace>

export const Location = z
  .object({
    id: Id,
    name: z.string().min(1).max(120),
    region: z.string().max(120).describe('Where it is, e.g. "Orlando, Florida"'),
    description: z.string().max(2000),
    createdAt: Timestamp,
    createdBy: z.string(),
  })
  .meta({ id: 'Location', description: 'A physical site (park, studio, test lab) that holds environments' })
export type Location = z.infer<typeof Location>
export const LocationList = z.array(Location).meta({ id: 'LocationList' })

export const CreateLocationRequest = z
  .object({
    id: Id,
    name: z.string().min(1).max(120),
    region: z.string().max(120).default(''),
    description: z.string().max(2000).default(''),
  })
  .meta({ id: 'CreateLocationRequest' })
