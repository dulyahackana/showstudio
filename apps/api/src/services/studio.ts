import {
  canonicalJson,
  compileBundle,
  toReport,
  validateCharacter,
  validateEnvironment,
  validateShow,
} from '@studio/playback'
import {
  API_PREFIX,
  type CharacterDefinition,
  type DocKind,
  type DocRef,
  type DocumentSummary,
  type EnvironmentDefinition,
  type Issue,
  type RevisionDetail,
  type RevisionSummary,
  refKey,
  type ShowDefinition,
  type StudioDocument,
  type User,
  type ValidationReport,
} from '@studio/schema'
import type { AuditLog } from '../audit.ts'
import { type Db, iso, isoOrNull } from '../db/index.ts'
import { problems } from '../problems.ts'
import { type Signer, sha256Hex } from '../security.ts'

type Draft = CharacterDefinition | EnvironmentDefinition | ShowDefinition

interface DocRow {
  id: string
  project_id: string
  kind: DocKind
  name: string
  draft: Draft
  draft_version: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  latest_revision: number | null
  latest_approved_revision: number | null
}

interface RevisionRow {
  doc_id: string
  revision: number
  kind: DocKind
  name: string
  content: Draft
  sha256: string
  note: string
  status: RevisionSummary['status']
  published_by: string
  published_at: Date
  reviewed_by: string | null
  reviewed_at: Date | null
  review_note: string | null
  bundle_sha256: string | null
  signature: string | null
}

const DOC_SELECT = `
  select d.*,
    (select max(r.revision) from revisions r where r.doc_id = d.id) as latest_revision,
    (select max(r.revision) from revisions r where r.doc_id = d.id and r.status = 'approved') as latest_approved_revision
  from documents d`

const REVISION_SELECT = `
  select r.*, b.signature from revisions r left join bundles b on b.sha256 = r.bundle_sha256`

const toSummary = (r: DocRow): DocumentSummary => ({
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  name: r.name,
  draftVersion: r.draft_version,
  createdAt: iso(r.created_at),
  createdBy: r.created_by,
  updatedAt: iso(r.updated_at),
  updatedBy: r.updated_by,
  latestRevision: r.latest_revision,
  latestApprovedRevision: r.latest_approved_revision,
})

const toRevisionSummary = (r: RevisionRow): RevisionSummary => ({
  docId: r.doc_id,
  kind: r.kind,
  revision: r.revision,
  name: r.name,
  sha256: r.sha256,
  status: r.status,
  note: r.note,
  publishedBy: r.published_by,
  publishedAt: iso(r.published_at),
  reviewedBy: r.reviewed_by,
  reviewedAt: isoOrNull(r.reviewed_at),
  reviewNote: r.review_note,
  bundleSha256: r.bundle_sha256,
  signed: r.signature != null,
})

export const assetPath = (id: string) => `${API_PREFIX}/assets/${id}`

/** Characters, environments and shows: drafts, immutable revisions, approval. */
export class StudioService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditLog,
    private readonly signer: Signer,
  ) {}

  /** visible: project ids the caller may read (null = all, for admins). */
  async listDocuments(filter: { kind?: DocKind; projectId?: string; visible: string[] | null }): Promise<DocumentSummary[]> {
    const where: string[] = []
    const args: unknown[] = []
    if (filter.kind) where.push(`d.kind = $${args.push(filter.kind)}`)
    if (filter.projectId) where.push(`d.project_id = $${args.push(filter.projectId)}`)
    if (filter.visible) where.push(`d.project_id = any($${args.push(filter.visible)})`)
    const rows = await this.db.query<DocRow>(
      `${DOC_SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by d.kind, d.name`,
      args,
    )
    return rows.map(toSummary)
  }

  async getDocument(id: string, db: Db = this.db): Promise<StudioDocument> {
    const [row] = await db.query<DocRow>(`${DOC_SELECT} where d.id = $1`, [id])
    if (!row) throw problems.notFound(`Document "${id}" does not exist`)
    return { ...toSummary(row), kind: row.kind, draft: row.draft } as StudioDocument
  }

  async createDocument(kind: DocKind, id: string, projectId: string, draft: Draft, user: User): Promise<StudioDocument> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.query('select 1 from documents where id = $1', [id])
      if (existing) throw problems.conflict(`A document with id "${id}" already exists`)
      await tx.query(
        'insert into documents (id, project_id, kind, name, draft, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $6)',
        [id, projectId, kind, draft.name, draft, user.name],
      )
      await this.audit.append(user.name, 'document.create', kind, id, { name: draft.name, projectId }, tx)
      return this.getDocument(id, tx)
    })
  }

  async saveDraft(id: string, kind: DocKind, draftVersion: number, draft: Draft, user: User): Promise<DocumentSummary> {
    const doc = await this.getDocument(id)
    if (doc.kind !== kind) throw problems.badRequest(`Document "${id}" is a ${doc.kind}, not a ${kind}`)
    const updated = await this.db.query<{ id: string }>(
      `update documents set draft = $1, name = $2, draft_version = draft_version + 1, updated_at = now(), updated_by = $3
       where id = $4 and draft_version = $5 returning id`,
      [draft, draft.name, user.name, id, draftVersion],
    )
    if (updated.length === 0) {
      throw problems.conflict(
        `The draft was saved by ${doc.updatedBy} at ${doc.updatedAt} (version ${doc.draftVersion}); reload to continue`,
      )
    }
    const [row] = await this.db.query<DocRow>(`${DOC_SELECT} where d.id = $1`, [id])
    return toSummary(row as DocRow)
  }

  // ---- reference resolution --------------------------------------------------------------

  async revisionContent<T extends Draft>(ref: DocRef, db: Db = this.db): Promise<T | null> {
    const [row] = await db.query<{ content: T }>('select content from revisions where doc_id = $1 and revision = $2', [
      ref.id,
      ref.revision,
    ])
    return row?.content ?? null
  }

  async charactersFor(env: EnvironmentDefinition, db: Db = this.db): Promise<Map<string, CharacterDefinition>> {
    const map = new Map<string, CharacterDefinition>()
    for (const p of env.placements) {
      const def = await this.revisionContent<CharacterDefinition>(p.character, db)
      if (def) map.set(refKey(p.character), def)
    }
    return map
  }

  private async validate(kind: DocKind, draft: Draft, db: Db): Promise<Issue[]> {
    if (kind === 'character') return validateCharacter(draft as CharacterDefinition)
    if (kind === 'environment') {
      const env = draft as EnvironmentDefinition
      return validateEnvironment(env, { characters: await this.charactersFor(env, db) })
    }
    const show = draft as ShowDefinition
    const environment = await this.revisionContent<EnvironmentDefinition>(show.environment, db)
    if (!environment) {
      return [
        {
          severity: 'error',
          code: 'environment-unresolved',
          message: `Environment ${refKey(show.environment)} is not published`,
          path: ['environment'],
        },
      ]
    }
    const assets = new Set((await db.query<{ id: string }>('select id from assets')).map((r) => r.id))
    return validateShow(show, { environment, characters: await this.charactersFor(environment, db), assets })
  }

  async validateDraft(id: string): Promise<ValidationReport> {
    const doc = await this.getDocument(id)
    return toReport(await this.validate(doc.kind, doc.draft, this.db))
  }

  // ---- revisions ----------------------------------------------------------------------------

  async publish(id: string, draftVersion: number, note: string, user: User): Promise<RevisionSummary> {
    const summary = await this.db.transaction(async (tx) => {
      const doc = await this.getDocument(id, tx)
      if (doc.draftVersion !== draftVersion) {
        throw problems.conflict(
          `The draft changed since you reviewed it (now version ${doc.draftVersion}); review again`,
        )
      }
      const issues = await this.validate(doc.kind, doc.draft, tx)
      if (issues.some((i) => i.severity === 'error')) throw problems.validation(issues)

      const contentSha = sha256Hex(canonicalJson(doc.draft))
      const [latest] = await tx.query<{ revision: number; sha256: string }>(
        'select revision, sha256 from revisions where doc_id = $1 order by revision desc limit 1',
        [id],
      )
      if (latest?.sha256 === contentSha) throw problems.conflict(`No changes since revision ${latest.revision}`)
      const revision = (latest?.revision ?? 0) + 1

      let bundleSha: string | null = null
      if (doc.kind === 'show') {
        const environment = await this.revisionContent<EnvironmentDefinition>(doc.draft.environment, tx)
        if (!environment) throw problems.badRequest('Environment revision not found')
        const bundle = compileBundle({
          show: { id, revision },
          definition: doc.draft,
          environment,
          characters: await this.charactersFor(environment, tx),
          assetPath,
        })
        const body = canonicalJson(bundle)
        bundleSha = sha256Hex(body)
        await tx.query(
          `insert into bundles (sha256, show_id, revision, environment_id, body) values ($1, $2, $3, $4, $5)
           on conflict (sha256) do nothing`,
          [bundleSha, id, revision, bundle.environment.id, body],
        )
      }
      await tx.query(
        `insert into revisions (doc_id, revision, kind, name, content, sha256, note, status, published_by, bundle_sha256)
         values ($1, $2, $3, $4, $5, $6, $7, 'published', $8, $9)`,
        [id, revision, doc.kind, doc.draft.name, doc.draft, contentSha, note, user.name, bundleSha],
      )
      await this.audit.append(
        user.name,
        'revision.publish',
        doc.kind,
        `${id}@${revision}`,
        {
          sha256: contentSha,
          bundleSha256: bundleSha,
          warnings: issues.length,
        },
        tx,
      )
      return this.getRevisionSummary(id, revision, tx)
    })
    return summary
  }

  async listRevisions(id: string): Promise<RevisionSummary[]> {
    await this.getDocument(id)
    const rows = await this.db.query<RevisionRow>(`${REVISION_SELECT} where r.doc_id = $1 order by r.revision desc`, [
      id,
    ])
    return rows.map(toRevisionSummary)
  }

  private async revisionRow(id: string, revision: number, db: Db): Promise<RevisionRow> {
    const [row] = await db.query<RevisionRow>(`${REVISION_SELECT} where r.doc_id = $1 and r.revision = $2`, [
      id,
      revision,
    ])
    if (!row) throw problems.notFound(`Revision ${id}@${revision} does not exist`)
    return row
  }

  async getRevisionSummary(id: string, revision: number, db: Db = this.db): Promise<RevisionSummary> {
    return toRevisionSummary(await this.revisionRow(id, revision, db))
  }

  async getRevision(id: string, revision: number): Promise<RevisionDetail> {
    const row = await this.revisionRow(id, revision, this.db)
    return { ...toRevisionSummary(row), content: row.content } as RevisionDetail
  }

  /** Safety review. Approval signs the exact bundle bytes; devices refuse anything unsigned. */
  async review(id: string, revision: number, decision: 'approve' | 'reject', note: string, user: User) {
    return this.db.transaction(async (tx) => {
      const row = await this.revisionRow(id, revision, tx)
      if (row.kind !== 'show') throw problems.badRequest('Only show revisions go through safety review')
      if (row.status !== 'published') throw problems.conflict(`Revision is already ${row.status}`)
      if (row.published_by === user.name) {
        throw problems.forbidden('Four-eyes rule: the author of a revision cannot review it')
      }
      if (decision === 'approve') {
        const [bundle] = await tx.query<{ body: string }>('select body from bundles where sha256 = $1', [
          row.bundle_sha256,
        ])
        if (!bundle) throw problems.conflict('Compiled bundle is missing')
        await tx.query('update bundles set signature = $1 where sha256 = $2', [
          this.signer.sign(Buffer.from(bundle.body, 'utf8')),
          row.bundle_sha256,
        ])
      }
      await tx.query(
        `update revisions set status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3
         where doc_id = $4 and revision = $5`,
        [decision === 'approve' ? 'approved' : 'rejected', user.name, note, id, revision],
      )
      await this.audit.append(
        user.name,
        `revision.${decision}`,
        'show',
        `${id}@${revision}`,
        {
          bundleSha256: row.bundle_sha256,
          note,
        },
        tx,
      )
      return this.getRevisionSummary(id, revision, tx)
    })
  }
}
