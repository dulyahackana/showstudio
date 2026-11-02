/**
 * Canonical JSON: object keys sorted, no whitespace, undefined dropped. Hashes of
 * documents and bundles are taken over this form, so identical content always
 * produces identical bytes (reproducible builds, content addressing).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Cannot canonicalize a non-finite number')
  }
  return value
}
