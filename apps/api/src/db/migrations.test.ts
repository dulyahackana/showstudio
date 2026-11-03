import { describe, expect, it } from 'bun:test'
import { migrate, openDb } from './index.ts'
import { migrations } from './migrations.ts'

describe('migrations', () => {
  it('turns v2 projects (folders of documents) into one project per show', async () => {
    const db = await openDb({ dataDir: '', memory: true })
    await db.exec('create table schema_migrations (version integer primary key, applied_at timestamptz default now())')
    for (const m of migrations.filter((m) => m.version <= 2)) {
      await db.exec(m.sql)
      await db.query('insert into schema_migrations (version) values ($1)', [m.version])
    }
    await db.exec(`
      insert into projects (id, name, created_by) values ('park', 'Park', 'alice');
      insert into project_members (project_id, user_name, role, added_by) values
        ('park', 'alice', 'owner', 'alice'), ('park', 'olga', 'operator', 'alice');
      insert into documents (id, kind, name, draft, created_by, updated_by, project_id) values
        ('robot', 'character', 'Robot', '{}', 'alice', 'alice', 'park'),
        ('lair', 'environment', 'Lair', '{}', 'alice', 'alice', 'park'),
        ('awakens', 'show', 'Awakens', '{}', 'alice', 'alice', 'park'),
        ('orphan', 'show', 'Orphan', '{}', 'alice', 'alice', 'general');
    `)

    expect(await migrate(db)).toEqual(migrations.filter((m) => m.version > 2).map((m) => m.version))

    const projects = await db.query<{ id: string }>('select id from projects order by id')
    expect(projects.map((p) => p.id)).toEqual(['awakens', 'orphan'])
    const members = await db.query<{ project_id: string; user_name: string; role: string }>(
      'select project_id, user_name, role from project_members order by project_id, user_name',
    )
    expect(members.map((m) => [m.project_id, m.user_name, m.role])).toEqual([
      ['awakens', 'alice', 'owner'],
      ['awakens', 'olga', 'operator'],
    ])
    const docs = await db.query<{ id: string; project_id: string | null; location_id: string | null }>(
      'select id, project_id, location_id from documents order by id',
    )
    expect(docs.map((d) => [d.id, d.project_id, d.location_id])).toEqual([
      ['awakens', 'awakens', null],
      ['lair', null, 'unassigned'],
      ['orphan', 'orphan', null],
      ['robot', null, null],
    ])
    // A show without a project, or an environment without a location, is rejected from now on.
    await expect(
      db.exec(`insert into documents (id, kind, name, draft, created_by, updated_by) values
        ('loose', 'show', 'Loose', '{}', 'alice', 'alice')`),
    ).rejects.toThrow()
    await db.close()
  })
})
