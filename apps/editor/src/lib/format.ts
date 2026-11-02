export function formatMs(ms: number, precise = true): string {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const m = Math.floor(abs / 60_000)
  const s = (abs % 60_000) / 1000
  return `${sign}${m}:${s.toFixed(precise ? 2 : 0).padStart(precise ? 5 : 2, '0')}`
}

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 8) : '—')

export function timeAgo(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs == null) return '—'
  const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs)
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return new Date(t).toLocaleDateString()
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

export const formatCount = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
