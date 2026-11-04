import {
  type Location,
  type Project,
  type ProjectPermission,
  type ProjectRole,
  projectAllows,
  type ShowDefinition,
  type User,
  type Workspace,
} from '@studio/schema'
import type { AuditLog } from '../audit.ts'
import { type Db, iso } from '../db/index.ts'
import { problems } from '../problems.ts'
import type { StudioService } from './studio.ts'

/** The tenant. Static in this prototype; production reads it from the identity provider. */
export const WORKSPACE: Workspace = {
  id: 'lumen-parks',
  name: 'Lumen Parks · Creative Engineering',
  plan: 'Enterprise',
  region: 'us-west-2',
  directory: [
    { name: 'alice', displayName: 'Alice Moreau', title: 'Show engineer', role: 'engineer' },
    { name: 'sam', displayName: 'Sam Okafor', title: 'Safety reviewer', role: 'safety' },
    { name: 'olga', displayName: 'Olga Lindqvist', title: 'Park operator', role: 'operator' },
    { name: 'admin', displayName: 'Studio admin', title: 'Administrator', role: 'admin' },
    { name: 'priya', displayName: 'Priya Raman', title: 'Animation lead', role: 'engineer' },
    { name: 'tom', displayName: 'Tom Becker', title: 'Controls engineer', role: 'engineer' },
  ],
}

const isAdmin = (user: User) => user.roles.includes('admin')

interface ProjectRow {
  id: string
  created_at: Date
  created_by: string
  deleted_at: Date | null
  deleted_by: string | null
}

/**
 * Projects (one show each) and their access lists. A show's reads need any role in its
 * project, writes need a role that grants the permission (PROJECT_PERMISSIONS).
 * Non-members get 404, so show names do not leak. Library characters and location
 * environments belong to no project: the workspace roles in the contract govern them.
 * A deleted project is only hidden: its members can still read it, nobody can change it
 * until an owner or admin recovers it.
 */
export class ProjectService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditLog,
    private readonly studio: StudioService,
  ) {}

  async roleOf(user: User, projectId: string, db: Db = this.db): Promise<ProjectRole | null> {
    const [row] = await db.query<{ role: ProjectRole }>(
      'select role from project_members where project_id = $1 and user_name = $2',
      [projectId, user.name],
    )
    return row?.role ?? null
  }

  /**
   * Throws 404 (not a member), 403 (role too weak) or 409 (deleted, for anything but
   * reading); admins pass the role checks.
   */
  async require(
    user: User,
    projectId: string,
    permission: ProjectPermission,
    db: Db = this.db,
    opts: { allowDeleted?: boolean } = {},
  ): Promise<void> {
    const [project] = await db.query<{ deleted_at: Date | null }>('select deleted_at from projects where id = $1', [
      projectId,
    ])
    if (isAdmin(user)) {
      if (!project) throw problems.notFound(`Project "${projectId}" does not exist`)
    } else {
      const role = project ? await this.roleOf(user, projectId, db) : null
      if (!role) throw problems.notFound(`Project "${projectId}" does not exist or you are not a member`)
      if (!projectAllows(role, permission))
        throw problems.forbidden(`Your role in "${projectId}" (${role}) does not allow ${permission}`)
    }
    if (project?.deleted_at && permission !== 'read' && !opts.allowDeleted)
      throw problems.conflict(`Project "${projectId}" is deleted; recover it first`)
  }

  /** Permission check for an action on a document (404 if it does not exist or is not visible). */
  async requireForDocument(user: User, docId: string, permission: ProjectPermission, db: Db = this.db): Promise<void> {
    const [row] = await db.query<{ project_id: string | null }>('select project_id from documents where id = $1', [
      docId,
    ])
    if (!row) throw problems.notFound(`Document "${docId}" does not exist`)
    if (!row.project_id) return // library or location: shared with the workspace
    await this.require(user, row.project_id, permission, db).catch((err) => {
      throw err.status === 404 ? problems.notFound(`Document "${docId}" does not exist`) : err
    })
  }

  /** Projects the user is listed for: members see theirs, admins see all. Deleted ones only on request. */
  private async rows(user: User, status: 'active' | 'deleted'): Promise<ProjectRow[]> {
    const member = isAdmin(user) ? '' : 'and p.id in (select project_id from project_members where user_name = $1)'
    return this.db.query<ProjectRow>(
      `select p.* from projects p join documents d on d.id = p.id
       where (p.deleted_at is null) = ${status === 'active'} ${member}
       order by ${status === 'active' ? 'd.name' : 'p.deleted_at desc'}`,
      isAdmin(user) ? [] : [user.name],
    )
  }

  /** Ids of the projects whose shows appear in document lists (deleted ones never do). */
  async visibleProjectIds(user: User): Promise<string[]> {
    return (await this.rows(user, 'active')).map((r) => r.id)
  }

  async list(user: User, status: 'active' | 'deleted' = 'active'): Promise<Project[]> {
    return Promise.all((await this.rows(user, status)).map((r) => this.toProject(r, user)))
  }

  async get(projectId: string, user: User): Promise<Project> {
    await this.require(user, projectId, 'read')
    const [row] = await this.db.query<ProjectRow>('select * from projects where id = $1', [projectId])
    if (!row) throw problems.notFound(`Project "${projectId}" does not exist`)
    return this.toProject(row, user)
  }

  /** Creates the project and its show together; the creator becomes the owner. */
  async create(input: { id: string; draft: ShowDefinition }, user: User): Promise<Project> {
    await this.db.transaction(async (tx) => {
      const [exists] = await tx.query<{ deleted_at: Date | null }>('select deleted_at from projects where id = $1', [
        input.id,
      ])
      if (exists)
        throw problems.conflict(
          exists.deleted_at
            ? `A deleted project uses the id "${input.id}"; recover it or choose another id`
            : `A project with id "${input.id}" already exists`,
        )
      if (!(await this.studio.revisionContent(input.draft.environment, tx)))
        throw problems.badRequest(
          `Environment ${input.draft.environment.id}@${input.draft.environment.revision} is not published`,
        )
      await tx.query('insert into projects (id, created_by) values ($1, $2)', [input.id, user.name])
      await tx.query(
        `insert into project_members (project_id, user_name, role, added_by) values ($1, $2, 'owner', $2)`,
        [input.id, user.name],
      )
      await this.audit.append(
        user.name,
        'project.create',
        'project',
        input.id,
        { name: input.draft.name, environment: input.draft.environment.id },
        tx,
      )
      await this.studio.createDocument('show', input.id, { projectId: input.id }, input.draft, user, tx)
    })
    return this.get(input.id, user)
  }

  async setMember(projectId: string, member: string, role: ProjectRole, user: User): Promise<Project> {
    if (!WORKSPACE.directory.some((p) => p.name === member))
      throw problems.badRequest(`"${member}" is not in the workspace directory`)
    await this.db.transaction(async (tx) => {
      await this.require(user, projectId, 'manage', tx)
      if (role !== 'owner') await this.assertAnotherOwner(projectId, member, tx)
      await tx.query(
        `insert into project_members (project_id, user_name, role, added_by) values ($1, $2, $3, $4)
         on conflict (project_id, user_name) do update set role = excluded.role, added_by = excluded.added_by, added_at = now()`,
        [projectId, member, role, user.name],
      )
      await this.audit.append(user.name, 'project.member.set', 'project', projectId, { member, role }, tx)
    })
    return this.get(projectId, user)
  }

  async removeMember(projectId: string, member: string, user: User): Promise<Project> {
    await this.db.transaction(async (tx) => {
      await this.require(user, projectId, 'manage', tx)
      await this.assertAnotherOwner(projectId, member, tx)
      await tx.query('delete from project_members where project_id = $1 and user_name = $2', [projectId, member])
      await this.audit.append(user.name, 'project.member.remove', 'project', projectId, { member }, tx)
    })
    return this.get(projectId, user)
  }

  /** Soft delete: hidden and read-only; the caller takes the show off the controllers. */
  async delete(projectId: string, user: User): Promise<Project> {
    await this.db.transaction(async (tx) => {
      await this.require(user, projectId, 'manage', tx)
      await tx.query('update projects set deleted_at = now(), deleted_by = $2 where id = $1', [projectId, user.name])
      await this.audit.append(user.name, 'project.delete', 'project', projectId, {}, tx)
    })
    return this.get(projectId, user)
  }

  async restore(projectId: string, user: User): Promise<Project> {
    await this.db.transaction(async (tx) => {
      await this.require(user, projectId, 'manage', tx, { allowDeleted: true })
      const [row] = await tx.query<{ deleted_at: Date | null }>('select deleted_at from projects where id = $1', [
        projectId,
      ])
      if (!row?.deleted_at) throw problems.conflict(`Project "${projectId}" is not deleted`)
      await tx.query('update projects set deleted_at = null, deleted_by = null where id = $1', [projectId])
      await this.audit.append(user.name, 'project.restore', 'project', projectId, {}, tx)
    })
    return this.get(projectId, user)
  }

  /** A project always keeps at least one owner. */
  private async assertAnotherOwner(projectId: string, member: string, tx: Db): Promise<void> {
    const owners = await tx.query<{ user_name: string }>(
      `select user_name from project_members where project_id = $1 and role = 'owner'`,
      [projectId],
    )
    if (owners.length === 1 && owners[0]?.user_name === member)
      throw problems.conflict('A project must keep at least one owner')
  }

  private async toProject(row: ProjectRow, user: User): Promise<Project> {
    const members = await this.db.query<{ user_name: string; role: ProjectRole; added_by: string; added_at: Date }>(
      'select * from project_members where project_id = $1 order by added_at, user_name',
      [row.id],
    )
    const { draft, ...show } = await this.studio.getDocument(row.id)
    const definition = draft as ShowDefinition
    return {
      id: row.id,
      name: show.name,
      description: definition.description,
      environmentId: definition.environment.id,
      show,
      createdAt: iso(row.created_at),
      createdBy: row.created_by,
      myRole: members.find((m) => m.user_name === user.name)?.role ?? null,
      members: members.map((m) => ({ user: m.user_name, role: m.role, addedBy: m.added_by, addedAt: iso(m.added_at) })),
      deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
      deletedBy: row.deleted_by,
    }
  }
}

interface LocationRow {
  id: string
  name: string
  region: string
  description: string
  created_at: Date
  created_by: string
}

const toLocation = (r: LocationRow): Location => ({
  id: r.id,
  name: r.name,
  region: r.region,
  description: r.description,
  createdAt: iso(r.created_at),
  createdBy: r.created_by,
})

/** Physical sites. Visible to the whole workspace; their environments are documents with a location_id. */
export class LocationService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditLog,
  ) {}

  async list(): Promise<Location[]> {
    return (await this.db.query<LocationRow>('select * from locations order by name')).map(toLocation)
  }

  async require(id: string): Promise<void> {
    const [row] = await this.db.query('select 1 from locations where id = $1', [id])
    if (!row) throw problems.notFound(`Location "${id}" does not exist`)
  }

  async create(input: { id: string; name: string; region: string; description: string }, user: User) {
    return this.db.transaction(async (tx) => {
      const [exists] = await tx.query('select 1 from locations where id = $1', [input.id])
      if (exists) throw problems.conflict(`A location with id "${input.id}" already exists`)
      const [row] = await tx.query<LocationRow>(
        'insert into locations (id, name, region, description, created_by) values ($1, $2, $3, $4, $5) returning *',
        [input.id, input.name, input.region, input.description, user.name],
      )
      await this.audit.append(user.name, 'location.create', 'location', input.id, { name: input.name }, tx)
      return toLocation(row as LocationRow)
    })
  }
}
