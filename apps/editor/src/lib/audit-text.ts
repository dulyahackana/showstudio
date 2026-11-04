import type { AuditEntry } from '@studio/schema'

/*
 * Audit entries as sentences people read: "approved and signed r2", "added Sam as
 * reviewer". The raw action, subject and details stay available for tooltips.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** "dragon-awakens@2" → { doc: "dragon-awakens", revision: "r2" }. */
function subjectOf(e: AuditEntry) {
  const [doc = e.entityId, rev] = e.entityId.split('@')
  return { doc, revision: rev ? `r${rev}` : '' }
}

/**
 * What the actor did, without the actor. With `subject`, names the document or
 * environment too ("approved r2 of dragon-awakens"); inside a project leave it out.
 */
export function describeAudit(e: AuditEntry, opts: { subject?: boolean } = {}): string {
  const d = e.details
  const { doc, revision } = subjectOf(e)
  const of = opts.subject ? ` of ${doc}` : ''
  const on = opts.subject ? ` ${doc}` : ''
  switch (e.action) {
    case 'project.create':
      return opts.subject ? `created project ${doc}` : 'created the project'
    case 'document.create':
      return e.entity === 'show' && !opts.subject ? 'created the show' : `created ${e.entity} ${text(d.name) || doc}`
    case 'project.member.set':
      return `added ${cap(text(d.member))} as ${text(d.role)}${opts.subject ? ` on ${doc}` : ''}`
    case 'project.member.remove':
      return `removed ${cap(text(d.member))} from the team${opts.subject ? ` of ${doc}` : ''}`
    case 'revision.publish':
      return `published ${revision}${of}`
    case 'revision.approve':
      return `approved and signed ${revision}${of}`
    case 'revision.reject':
      return `rejected ${revision}${of}`
    case 'draft.restore':
      return `restored r${String(d.revision ?? '?')} as the draft${of}`
    case 'show.package':
      return `downloaded the ${revision} install package${of}`
    case 'show.deploy':
      return `deployed ${revision}${of} to ${text(d.environmentId) || 'the attraction'}`
    case 'show.launch':
      return `launched ${revision}${of}`
    case 'show.stop':
      return `stopped${on || ' the show'}`
    case 'estop.trigger':
      return `pressed the e-stop${on}${text(d.reason) ? ` (${text(d.reason)})` : ''}`
    case 'estop.reset':
      return `reset the e-stop${on}`
    case 'project.delete':
      return opts.subject ? `deleted project ${doc}` : 'deleted the project'
    case 'project.restore':
      return opts.subject ? `recovered project ${doc}` : 'recovered the project'
    case 'asset.upload':
      return `uploaded ${text(d.name) || 'a file'}`
    case 'location.create':
      return `created location ${text(d.name) || doc}`
    case 'devices.provision':
      return `provisioned the controllers of ${doc}`
    default:
      return `${e.action.replace(/[._]/g, ' ')}${on}`
  }
}

export interface AuditGroup {
  entries: AuditEntry[]
  sentence: string
}

/** Collapses runs of the same person doing the same thing ("added Priya, Sam and Olga to the team"). */
export function groupAudit(entries: readonly AuditEntry[], opts: { subject?: boolean } = {}): AuditGroup[] {
  const groups: AuditGroup[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    const head = last?.entries[0]
    if (last && head && head.actor === e.actor && head.action === e.action && head.entityId === e.entityId) {
      last.entries.push(e)
      continue
    }
    groups.push({ entries: [e], sentence: describeAudit(e, opts) })
  }
  for (const g of groups) {
    if (g.entries.length < 2) continue
    const head = g.entries[0] as AuditEntry
    if (head.action === 'project.member.set') {
      const people = g.entries.map((x) => `${cap(text(x.details.member))} (${text(x.details.role)})`).reverse()
      g.sentence = `added ${list(people)} to the team`
    } else g.sentence = `${g.sentence} ×${g.entries.length}`
  }
  return groups
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
