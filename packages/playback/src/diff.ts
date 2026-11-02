import type { ShowDefinition, Tracks } from '@studio/schema'
import { canonicalJson } from './canonical.ts'

export interface DiffEntry {
  area: 'meta' | 'motion' | 'lights' | 'audio' | 'behaviors'
  target: string
  change: 'added' | 'removed' | 'changed'
  detail: string
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function diffTracks(a: Tracks, b: Tracks, prefix: string, out: DiffEntry[]) {
  const flat = (t: Tracks) => {
    const m = new Map<string, { area: DiffEntry['area']; n: number; data: unknown }>()
    for (const [d, joints] of Object.entries(t.motion))
      for (const [j, keys] of Object.entries(joints)) m.set(`${d}.${j}`, { area: 'motion', n: keys.length, data: keys })
    for (const [d, keys] of Object.entries(t.lights)) m.set(d, { area: 'lights', n: keys.length, data: keys })
    for (const [d, cues] of Object.entries(t.audio)) m.set(d, { area: 'audio', n: cues.length, data: cues })
    return m
  }
  const fa = flat(a)
  const fb = flat(b)
  for (const [key, vb] of fb) {
    const va = fa.get(key)
    const target = prefix + key
    if (!va) {
      if (vb.n) out.push({ area: vb.area, target, change: 'added', detail: count(vb.n, 'key') })
    } else if (!same(va.data, vb.data)) {
      out.push({ area: vb.area, target, change: 'changed', detail: `${va.n} → ${vb.n} keys` })
    }
  }
  for (const [key, va] of fa) {
    if (!fb.has(key) && va.n)
      out.push({ area: va.area, target: prefix + key, change: 'removed', detail: count(va.n, 'key') })
  }
}

/** Human-readable summary of what changed between two show revisions. */
export function diffShows(a: ShowDefinition, b: ShowDefinition): DiffEntry[] {
  const out: DiffEntry[] = []
  if (a.name !== b.name) out.push({ area: 'meta', target: 'name', change: 'changed', detail: `${a.name} → ${b.name}` })
  if (a.durationMs !== b.durationMs)
    out.push({ area: 'meta', target: 'duration', change: 'changed', detail: `${a.durationMs} → ${b.durationMs} ms` })
  if (!same(a.environment, b.environment))
    out.push({
      area: 'meta',
      target: 'environment',
      change: 'changed',
      detail: `${a.environment.id}@${a.environment.revision} → ${b.environment.id}@${b.environment.revision}`,
    })
  diffTracks(a.tracks, b.tracks, '', out)
  const ba = new Map(a.behaviors.map((x) => [x.id, x]))
  const bb = new Map(b.behaviors.map((x) => [x.id, x]))
  for (const [id, x] of bb) {
    const prev = ba.get(id)
    if (!prev)
      out.push({
        area: 'behaviors',
        target: x.name,
        change: 'added',
        detail: `on ${x.trigger.sensorId}:${x.trigger.event}`,
      })
    else if (!same(prev, x)) {
      const { tracks: ta, ...ma } = prev
      const { tracks: tb, ...mb } = x
      if (!same(ma, mb))
        out.push({ area: 'behaviors', target: x.name, change: 'changed', detail: 'trigger/timing settings' })
      diffTracks(ta, tb, `${x.name}: `, out)
    }
  }
  for (const [id, x] of ba)
    if (!bb.has(id)) out.push({ area: 'behaviors', target: x.name, change: 'removed', detail: '' })
  return out
}
