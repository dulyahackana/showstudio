import {
  type Project,
  type ProjectPermission,
  type ProjectRole,
  projectAllows,
  type User,
  type Workspace,
} from '@studio/schema'
import type { AuditLog } from '../audit.ts'
import { type Db, iso } from '../db/index.ts'
import { problems } from '../problems.ts'

/** The tenant. Static in this prototype; production reads it from the identity provider. */
export const WORKSPACE: Workspace = {
  id: 'lumen-parks',
  name: 'Lumen Parks · Creative Engineering',
  plan: 'Enterprise',
  region: 'us-west-2',
  sites: ['Burbank studio', 'Lumen Parks Orlando'],
  directory: [
    { name: 'alice', displayName: 'Alice Moreau', title: 'Show engineer' },
    { name: 'sam', displayName: 'Sam Okafor', title: 'Safety reviewer' },
    { name: 'olga', displayName: 'Olga Lindqvist', title: 'Park operator' },
    { name: 'admin', displayName: 'Studio admin', title: 'Administrator' },
    { name: 'priya', displayName: 'Priya Raman', title: 'Animation lead' },
    { name: 'tom', displayName: 'Tom Becker', title: 'Controls engineer' },
  ],
}

const isAdmin = (user: User) => user.roles.includes('admin')

interface ProjectRow {
  id: string
  name: string
  description: string
  created_at: Date
  created_by: string
}

/**
 * Projects and their access lists. Every document belongs to one project; reads need
 * any role in it, writes need a role that grants the permission (PROJECT_PERMISSIONS).
 * Non-members get 404, so project and document names do not leak.
 */
export class ProjectService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditLog,
  ) {}

  async roleOf(user: User, projectId: string, db: Db = this.db): Promise<ProjectRole | null> {
    const [row] = await db.query<{ role: ProjectRole }>(
      'select role from project_members where project_id = $1 and user_name = $2',
      [projectId, user.name],
    )
    return row?.role ?? null
  }

  /** Throws 404 (not a member) or 403 (role too weak); admins always pass. */
  async require(user: User, projectId: string, permission: ProjectPermission, db: Db = this.db): Promise<void> {
    if (isAdmin(user)) {
      const [exists] = await db.query('select 1 from projects where id = $1', [projectId])
      if (!exists) throw problems.notFound(`Project "${projectId}" does not exist`)
      return
    }
    const role = await this.roleOf(user, projectId, db)
    if (!role) throw problems.notFound(`Project "${projectId}" does not exist or you are not a member`)
    if (!projectAllows(role, permission))
      throw problems.forbidden(`Your role in "${projectId}" (${role}) does not allow ${permission}`)
  }

  async projectOfDocument(docId: string, db: Db = this.db): Promise<string> {
    const [row] = await db.query<{ project_id: string }>('select project_id from documents where id = $1', [docId])
    if (!row) throw problems.notFound(`Document "${docId}" does not exist`)
    return row.project_id
  }

  /** Permission check for an action on a document (404 if it does not exist or is not visible). */
  async requireForDocument(user: User, docId: string, permission: ProjectPermission, db: Db = this.db): Promise<void> {
    const projectId = await this.projectOfDocument(docId, db).catch(() => null)
    if (!projectId) throw problems.notFound(`Document "${docId}" does not exist`)
    await this.require(user, projectId, permission, db).catch((err) => {
      throw err.status === 404 ? problems.notFound(`Document "${docId}" does not exist`) : err
    })
  }

  /** Project ids the user can read (null = all, for admins). */
  async visibleProjectIds(user: User): Promise<string[] | null> {
    if (isAdmin(user)) return null
    const rows = await this.db.query<{ project_id: string }>(
      'select project_id from project_members where user_name = $1',
      [user.name],
    )
    return rows.map((r) => r.project_id)
  }

  async list(user: User): Promise<Project[]> {
    const visible = await this.visibleProjectIds(user)
    const rows = visible
      ? await this.db.query<ProjectRow>('select * from projects where id = any($1) order by name', [visible])
      : await this.db.query<ProjectRow>('select * from projects order by name')
    return Promise.all(rows.map((r) => this.toProject(r, user)))
  }

  async get(projectId: string, user: User): Promise<Project> {
    await this.require(user, projectId, 'read')
    const [row] = await this.db.query<ProjectRow>('select * from projects where id = $1', [projectId])
    if (!row) throw problems.notFound(`Project "${projectId}" does not exist`)
    return this.toProject(row, user)
  }

  async create(input: { id: string; name: string; description: string }, user: User): Promise<Project> {
    await this.db.transaction(async (tx) => {
      const [exists] = await tx.query('select 1 from projects where id = $1', [input.id])
      if (exists) throw problems.conflict(`A project with id "${input.id}" already exists`)
      await tx.query('insert into projects (id, name, description, created_by) values ($1, $2, $3, $4)', [
        input.id,
        input.name,
        input.description,
        user.name,
      ])
      await tx.query(
        `insert into project_members (project_id, user_name, role, added_by) values ($1, $2, 'owner', $2)`,
        [input.id, user.name],
      )
      await this.audit.append(user.name, 'project.create', 'project', input.id, { name: input.name }, tx)
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
    const counts = await this.db.query<{ kind: string; n: number }>(
      'select kind, count(*)::int as n from documents where project_id = $1 group by kind',
      [row.id],
    )
    const count = (kind: string) => Number(counts.find((c) => c.kind === kind)?.n ?? 0)
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: iso(row.created_at),
      createdBy: row.created_by,
      myRole: members.find((m) => m.user_name === user.name)?.role ?? null,
      members: members.map((m) => ({ user: m.user_name, role: m.role, addedBy: m.added_by, addedAt: iso(m.added_at) })),
      counts: { character: count('character'), environment: count('environment'), show: count('show') },
    }
  }
}
