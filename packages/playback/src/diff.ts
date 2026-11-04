import type { Behavior, ShowDefinition, Tracks } from '@studio/schema'
import { canonicalJson } from './canonical.ts'

export interface DiffEntry {
  area: 'meta' | 'motion' | 'lights' | 'audio' | 'behaviors'
  target: string
  change: 'added' | 'removed' | 'changed'
  detail: string
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
const sec = (ms: number) => `${Number((ms / 1000).toFixed(2))} s`

/** What a reviewer needs to judge a changed sensor response: before → after for every setting. */
function behaviorChanges(a: Behavior, b: Behavior): string {
  const out: string[] = []
  const window = (w: Behavior['window']) => (w ? `${sec(w.fromMs)}–${sec(w.toMs)}` : 'any time')
  if (a.name !== b.name) out.push(`renamed from "${a.name}"`)
  if (a.enabled !== b.enabled) out.push(b.enabled ? 'enabled' : 'disabled')
  if (a.trigger.sensorId !== b.trigger.sensorId || a.trigger.event !== b.trigger.event)
    out.push(`trigger ${a.trigger.sensorId} ${a.trigger.event} → ${b.trigger.sensorId} ${b.trigger.event}`)
  if (!same(a.window, b.window)) out.push(`window ${window(a.window)} → ${window(b.window)}`)
  if (a.blendMs !== b.blendMs) out.push(`blend ${sec(a.blendMs)} → ${sec(b.blendMs)}`)
  if (a.durationMs !== b.durationMs) out.push(`clip ${sec(a.durationMs)} → ${sec(b.durationMs)}`)
  if (a.cooldownMs !== b.cooldownMs) out.push(`cooldown ${sec(a.cooldownMs)} → ${sec(b.cooldownMs)}`)
  return out.join(', ')
}
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
        detail: `on ${x.trigger.sensorId}:${x.trigger.event}${x.standby ? ', also between shows' : ''}`,
      })
    else if (!same(prev, x)) {
      // Standby is called out on its own: it lets figures move with no show running.
      const { tracks: ta, standby: sa, ...ma } = prev
      const { tracks: tb, standby: sb, ...mb } = x
      if (!sa !== !sb)
        out.push({
          area: 'behaviors',
          target: x.name,
          change: 'changed',
          detail: sb ? 'now also answers guests between shows' : 'no longer answers between shows',
        })
      if (!same(ma, mb))
        out.push({ area: 'behaviors', target: x.name, change: 'changed', detail: behaviorChanges(prev, x) })
      diffTracks(ta, tb, `${x.name}: `, out)
    }
  }
  for (const [id, x] of ba)
    if (!bb.has(id)) out.push({ area: 'behaviors', target: x.name, change: 'removed', detail: '' })
  return out
}
