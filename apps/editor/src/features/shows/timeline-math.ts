import type { AudioCue, LightKey, MotionKey, ShowDefinition, Tracks } from '@studio/schema'

export const SNAP_MS = 50
export const KEY_TOLERANCE_MS = 20

export type RowRef =
  | { kind: 'motion'; deviceId: string; joint: string }
  | { kind: 'light'; deviceId: string }
  | { kind: 'audio'; deviceId: string }

export interface Selection {
  row: RowRef
  index: number | null
}

/** What the timeline edits: the main show or one sensor-response clip. */
export type Target = { kind: 'main' } | { kind: 'behavior'; id: string }

export const rowKey = (r: RowRef) => (r.kind === 'motion' ? `m:${r.deviceId}:${r.joint}` : `${r.kind[0]}:${r.deviceId}`)
export const sameRow = (a: RowRef | undefined, b: RowRef | undefined) => !!a && !!b && rowKey(a) === rowKey(b)
export const issueKey = (deviceId: string | undefined, joint: string | undefined, index: number | undefined) =>
  `${deviceId ?? ''}|${joint ?? ''}|${index ?? ''}`

export const snap = (t: number, step = SNAP_MS) => Math.max(0, Math.round(t / step) * step)
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const round = (v: number, digits = 2) => Number(v.toFixed(digits))
export const dbToGain = (db: number) => Math.min(1, 10 ** (db / 20))

type AnyKey = MotionKey | LightKey | AudioCue

export function keysOf(tracks: Tracks, row: RowRef): readonly AnyKey[] {
  if (row.kind === 'motion') return tracks.motion[row.deviceId]?.[row.joint] ?? []
  if (row.kind === 'light') return tracks.lights[row.deviceId] ?? []
  return tracks.audio[row.deviceId] ?? []
}

/** Mutable key array inside an immer draft, created on demand. */
export function draftKeys(tracks: Tracks, row: RowRef): AnyKey[] {
  if (row.kind === 'motion') {
    tracks.motion[row.deviceId] ??= {}
    const joints = tracks.motion[row.deviceId] as Record<string, MotionKey[]>
    joints[row.joint] ??= []
    return joints[row.joint] as MotionKey[]
  }
  if (row.kind === 'light') {
    tracks.lights[row.deviceId] ??= []
    return tracks.lights[row.deviceId] as LightKey[]
  }
  tracks.audio[row.deviceId] ??= []
  return tracks.audio[row.deviceId] as AudioCue[]
}

/**
 * Insert a key keeping times sorted, or replace the key already within
 * `tolerance` of `key.t`. Returns the key's index. Mutates `keys`.
 */
export function upsertKey<T extends { t: number }>(keys: T[], key: T, tolerance = KEY_TOLERANCE_MS): number {
  const existing = keys.findIndex((k) => Math.abs(k.t - key.t) <= tolerance)
  if (existing >= 0) {
    keys[existing] = { ...keys[existing], ...key, t: (keys[existing] as T).t }
    return existing
  }
  const at = keys.findIndex((k) => k.t > key.t)
  const index = at < 0 ? keys.length : at
  keys.splice(index, 0, key)
  return index
}

/** Keep a dragged key between its neighbours so keys stay strictly ordered. */
export function clampKeyTime(keys: readonly { t: number }[], index: number, t: number, durationMs: number): number {
  const prev = keys[index - 1]?.t
  const next = keys[index + 1]?.t
  return clamp(t, prev === undefined ? 0 : prev + 1, next === undefined ? durationMs : Math.min(durationMs, next - 1))
}

export function targetTracks(show: ShowDefinition, target: Target): { tracks: Tracks; durationMs: number } | null {
  if (target.kind === 'main') return { tracks: show.tracks, durationMs: show.durationMs }
  const b = show.behaviors.find((x) => x.id === target.id)
  return b ? { tracks: b.tracks, durationMs: b.durationMs } : null
}

export function draftTargetTracks(show: ShowDefinition, target: Target): Tracks | null {
  if (target.kind === 'main') return show.tracks
  return show.behaviors.find((x) => x.id === target.id)?.tracks ?? null
}

/** Ruler tick spacing (ms) for a zoom level in px per second. */
export function tickSteps(pxPerSecond: number): { major: number; minor: number } {
  if (pxPerSecond >= 160) return { major: 1000, minor: 100 }
  if (pxPerSecond >= 60) return { major: 1000, minor: 250 }
  if (pxPerSecond >= 25) return { major: 5000, minor: 1000 }
  return { major: 10_000, minor: 2000 }
}
