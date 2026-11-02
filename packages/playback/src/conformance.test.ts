import { describe, expect, it } from 'bun:test'
import { verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShowBundle } from '@studio/schema'
import { sampleJoint, sampleLight } from './interpolate.ts'
import { BehaviorScheduler, sampleFrame } from './runtime.ts'
import { audioVectors, errorCodes, type Vectors } from './vectors.ts'

/*
 * Recompute every pinned vector from its inputs. The engine simulator runs the
 * same file through its own implementation, so preview == simulation == device.
 */
const vectorFile = (name: string) => readFileSync(resolve(import.meta.dirname, '../../../test-vectors', name), 'utf8')
const vectors = JSON.parse(vectorFile('playback.json')) as Vectors
const signature = JSON.parse(vectorFile('signature.json')) as {
  publicKeyPem: string
  message: string
  signature: string
}

const close = (actual: unknown, expected: unknown, tol: number, path = '$'): void => {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number')
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(tol)
  } else if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort())
    for (const [k, v] of Object.entries(expected)) close((actual as Record<string, unknown>)[k], v, tol, `${path}.${k}`)
  } else {
    expect(actual, path).toEqual(expected)
  }
}

describe('playback conformance vectors', () => {
  it.each(vectors.motion)('motion: $name', (c) => {
    for (const [t, v] of c.samples) close(sampleJoint(c.keys, c.home, t), v, vectors.tolerance, `t=${t}`)
  })

  it.each(vectors.lights)('lights: $name', (c) => {
    for (const [t, v] of c.samples) close(sampleLight(c.keys, t), v, vectors.tolerance, `t=${t}`)
  })

  it.each(vectors.frames)('frames: $name', (c) => {
    const bundle = ShowBundle.parse(c.bundle)
    for (const s of c.samples) close(sampleFrame(bundle, s.t, c.started), s.frame, vectors.tolerance, `t=${s.t}`)
    expect(audioVectors(bundle, c.started)).toEqual(c.audio)
  })

  it.each(vectors.scheduler)('scheduler: $name', (c) => {
    const scheduler = new BehaviorScheduler(c.behaviors)
    for (const step of c.steps) {
      expect(scheduler.trigger(step.sensorId, step.event, step.t), `t=${step.t}`).toEqual(step.started)
    }
  })

  it.each(vectors.deviceChecks)('device check: $name', (c) => {
    expect(errorCodes(c.payload, c.limits, c.durationMs, c.behaviors)).toEqual(c.errors)
  })

  it('signature: accepts the studio signature and rejects one changed byte', () => {
    const message = Buffer.from(signature.message, 'base64')
    const sig = Buffer.from(signature.signature, 'base64')
    expect(verify('sha256', message, signature.publicKeyPem, sig)).toBe(true)
    message[0] = (message[0] ?? 0) ^ 1
    expect(verify('sha256', message, signature.publicKeyPem, sig)).toBe(false)
  })

  it('covers every error the device-side check can raise', () => {
    const seen = new Set(vectors.deviceChecks.flatMap((c) => c.errors))
    for (const code of [
      'key-after-end',
      'keys-unsorted',
      'motion-out-of-range',
      'motion-velocity-exceeded',
      'behavior-blend-too-fast',
      'track-joint-unknown',
      'behavior-unknown',
    ])
      expect(seen.has(code), code).toBe(true)
  })
})
