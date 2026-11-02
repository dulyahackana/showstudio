import type { HexColor, Interp, LightKey, MotionKey } from '@studio/schema'

/*
 * Interpolation spec (mirrored by every playback implementation and pinned by
 * /test-vectors):
 *  - a key's `interp` shapes the segment from that key to the next one
 *  - linear: v = a + (b - a) * u
 *  - ease:   v = a + (b - a) * (3u^2 - 2u^3)   (smoothstep, never overshoots)
 *  - step:   v = a until the next key, then b
 *  - before the first key a motion track starts from `home` (implicit linear key at t=0)
 *  - before the first key a light is off; after the last key every track holds
 */

export const ease = (u: number): number => u * u * (3 - 2 * u)

export function shape(interp: Interp, u: number): number {
  switch (interp) {
    case 'step':
      return 0
    case 'linear':
      return u
    case 'ease':
      return ease(u)
  }
}

export const lerp = (a: number, b: number, w: number): number => a + (b - a) * w

/** Index of the last key with `t <= time`, or -1 when `time` precedes every key. */
export function segmentIndex(keys: readonly { t: number }[], time: number): number {
  let lo = 0
  let hi = keys.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if ((keys[mid] as { t: number }).t <= time) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Sample keys at `time`; before the first key returns the first value. */
export function sampleMotion(keys: readonly MotionKey[], time: number, fallback: number): number {
  const first = keys[0]
  if (!first) return fallback
  const i = segmentIndex(keys, time)
  if (i < 0) return first.v
  const a = keys[i] as MotionKey
  const b = keys[i + 1]
  if (!b) return a.v
  const span = b.t - a.t
  if (span <= 0) return b.v
  return lerp(a.v, b.v, shape(a.interp, (time - a.t) / span))
}

/** Motion keys with the implicit start-from-home key prepended when needed. */
export function withHome(keys: readonly MotionKey[], home: number): readonly MotionKey[] {
  const first = keys[0]
  if (!first || first.t <= 0) return keys
  return [{ t: 0, v: home, interp: 'linear' }, ...keys]
}

export const sampleJoint = (keys: readonly MotionKey[], home: number, time: number): number =>
  sampleMotion(withHome(keys, home), time, home)

/** Peak speed of the segment a -> b in units per second (Infinity for jumps). */
export function segmentPeakVelocity(a: MotionKey, b: MotionKey): number {
  const dv = Math.abs(b.v - a.v)
  if (dv === 0) return 0
  const span = b.t - a.t
  if (span <= 0 || a.interp === 'step') return Number.POSITIVE_INFINITY
  const factor = a.interp === 'ease' ? 1.5 : 1
  return (factor * dv * 1000) / span
}

// ---- lights -------------------------------------------------------------------

export interface LightSample {
  r: number
  g: number
  b: number
  intensity: number
}

export const LIGHT_OFF: LightSample = { r: 0, g: 0, b: 0, intensity: 0 }

export function hexToRgb(hex: HexColor): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(r: number, g: number, b: number): HexColor {
  const c = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function lightFromKey(key: LightKey): LightSample {
  const [r, g, b] = hexToRgb(key.color)
  return { r, g, b, intensity: key.intensity }
}

export function mixLight(a: LightSample, b: LightSample, w: number): LightSample {
  return {
    r: lerp(a.r, b.r, w),
    g: lerp(a.g, b.g, w),
    b: lerp(a.b, b.b, w),
    intensity: lerp(a.intensity, b.intensity, w),
  }
}

/** Sample light keys; before the first key the fixture is off. */
export function sampleLight(keys: readonly LightKey[], time: number): LightSample {
  const i = segmentIndex(keys, time)
  if (i < 0) return LIGHT_OFF
  const a = keys[i] as LightKey
  const b = keys[i + 1]
  if (!b) return lightFromKey(a)
  const span = b.t - a.t
  if (span <= 0) return lightFromKey(b)
  return mixLight(lightFromKey(a), lightFromKey(b), shape(a.interp, (time - a.t) / span))
}

/** Clip sampling: before the first key hold it (the blend-in handles the approach). */
export function sampleLightClip(keys: readonly LightKey[], time: number): LightSample {
  const first = keys[0]
  if (!first) return LIGHT_OFF
  return time < first.t ? lightFromKey(first) : sampleLight(keys, time)
}
