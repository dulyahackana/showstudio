import { canonicalJson } from '@studio/playback'
import type { AuditEntry } from '@studio/schema'
import { type Db, iso } from './db/index.ts'
import { sha256Hex } from './security.ts'

const GENESIS = '0'.repeat(64)

interface Row {
  seq: number
  at: Date
  actor: string
  action: string
  entity: string
  entity_id: string
  details: Record<string, unknown>
  prev_hash: string
  hash: string
}

const entryHash = (prevHash: string, e: Omit<AuditEntry, 'seq' | 'prevHash' | 'hash'>) =>
  sha256Hex(prevHash + canonicalJson(e))

/**
 * Append-only, hash-chained audit log: who published, approved, deployed,
 * launched or e-stopped what. Editing or deleting a row breaks the chain.
 */
export class AuditLog {
  constructor(private readonly db: Db) {}

  async append(
    actor: string,
    action: string,
    entity: string,
    entityId: string,
    details: Record<string, unknown> = {},
    tx: Db = this.db,
  ): Promise<void> {
    const write = async (db: Db) => {
      await db.query('select pg_advisory_xact_lock(7331)')
      const [last] = await db.query<{ hash: string }>('select hash from audit_log order by seq desc limit 1')
      const prevHash = last?.hash ?? GENESIS
      const entry = { at: new Date().toISOString(), actor, action, entity, entityId, details }
      await db.query(
        'insert into audit_log (at, actor, action, entity, entity_id, details, prev_hash, hash) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [entry.at, actor, action, entity, entityId, details, prevHash, entryHash(prevHash, entry)],
      )
    }
    if (tx === this.db) await this.db.transaction(write)
    else await write(tx)
  }

  async list(limit = 200): Promise<AuditEntry[]> {
    const rows = await this.db.query<Row>('select * from audit_log order by seq desc limit $1', [limit])
    return rows.map(toEntry)
  }

  async verify(): Promise<{ ok: boolean; count: number; brokenAtSeq: number | null }> {
    const rows = await this.db.query<Row>('select * from audit_log order by seq asc')
    let prev = GENESIS
    for (const row of rows) {
      const e = toEntry(row)
      const { seq: _s, prevHash, hash, ...body } = e
      if (prevHash !== prev || hash !== entryHash(prevHash, body))
        return { ok: false, count: rows.length, brokenAtSeq: e.seq }
      prev = hash
    }
    return { ok: true, count: rows.length, brokenAtSeq: null }
  }
}

const toEntry = (r: Row): AuditEntry => ({
  seq: r.seq,
  at: iso(r.at),
  actor: r.actor,
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id,
  details: r.details,
  prevHash: r.prev_hash,
  hash: r.hash,
})
