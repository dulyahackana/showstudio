import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrations } from './migrations.ts'

/** Minimal database port: PGlite (embedded Postgres) in dev/test, Postgres in production. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  exec(sql: string): Promise<void>
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

const wrap = (q: Queryable, exec: (sql: string) => Promise<unknown>): Omit<Db, 'transaction' | 'close'> => ({
  query: async <T>(sql: string, params: unknown[] = []) => (await q.query(sql, params)).rows as T[],
  exec: async (sql: string) => {
    await exec(sql)
  },
})

export async function openDb(opts: { url?: string; dataDir: string; memory?: boolean }): Promise<Db> {
  if (opts.url) {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 })
    const base = wrap(pool, (sql) => pool.query(sql))
    return {
      ...base,
      transaction: async (fn) => {
        const client = await pool.connect()
        try {
          await client.query('begin')
          const tx = wrap(client, (sql) => client.query(sql))
          const result = await fn({ ...tx, transaction: (inner) => inner({ ...tx } as Db), close: async () => {} })
          await client.query('commit')
          return result
        } catch (err) {
          await client.query('rollback')
          throw err
        } finally {
          client.release()
        }
      },
      close: () => pool.end(),
    }
  }

  // Bun before 1.4 aborts (SIGTRAP) about 10 s after PGlite starts; fail with a reason instead.
  if (Bun.semver.order(Bun.version, '1.4.0') < 0) {
    throw new Error(
      `Embedded Postgres needs Bun >= 1.4 (running ${Bun.version}); run \`bun upgrade\` or set DATABASE_URL`,
    )
  }
  const { PGlite } = await import('@electric-sql/pglite')
  let dataDir: string | undefined
  if (!opts.memory) {
    dataDir = join(opts.dataDir, 'pg')
    mkdirSync(dataDir, { recursive: true })
  }
  const lite = await PGlite.create(dataDir)
  const base = wrap(lite, (sql) => lite.exec(sql))
  return {
    ...base,
    transaction: (fn) =>
      lite.transaction(async (t) => {
        const tx = wrap(t, (sql) => t.exec(sql))
        return fn({ ...tx, transaction: (inner) => inner({ ...tx } as Db), close: async () => {} })
      }),
    close: () => lite.close(),
  }
}

export async function migrate(db: Db): Promise<number[]> {
  await db.exec(
    'create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())',
  )
  const done = new Set(
    (await db.query<{ version: number }>('select version from schema_migrations')).map((r) => r.version),
  )
  const applied: number[] = []
  for (const m of migrations) {
    if (done.has(m.version)) continue
    await db.transaction(async (tx) => {
      await tx.exec(m.sql)
      await tx.query('insert into schema_migrations (version) values ($1)', [m.version])
    })
    applied.push(m.version)
  }
  return applied
}

export const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString()
export const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v))
