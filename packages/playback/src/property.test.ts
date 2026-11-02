import { describe, expect, it } from 'bun:test'
import type { BehaviorSchedule, DollPayload, JointLimits, MotionKey } from '@studio/schema'
import fc from 'fast-check'
import { sampleJoint, sampleMotion } from './interpolate.ts'
import { activeBehaviorFor, sampleDollPose } from './runtime.ts'
import { validateMotionKeys } from './validate.ts'

/*
 * Properties that make the safety argument: if the validator accepts a track,
 * the sampled motion stays inside the limits and below the speed limit — also
 * while blending into and out of sensor responses.
 */

const joint: JointLimits = { name: 'j', type: 'revolute', min: -90, max: 90, home: 0, maxVelocity: 120 }

const keysArb = (minGap = 50) =>
  fc
    .array(
      fc.record({
        dt: fc.integer({ min: minGap, max: 3000 }),
        v: fc.double({ min: joint.min, max: joint.max, noNaN: true }),
        interp: fc.constantFrom<MotionKey['interp']>('linear', 'ease', 'step'),
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((items) => {
      let t = 0
      return items.map(({ dt, v, interp }) => {
        t += dt
        return { t, v, interp }
      })
    })

const maxSpeed = (f: (t: number) => number, from: number, to: number, dt = 1) => {
  let peak = 0
  let prev = f(from)
  for (let t = from + dt; t <= to; t += dt) {
    const cur = f(t)
    peak = Math.max(peak, (Math.abs(cur - prev) * 1000) / dt)
    prev = cur
  }
  return peak
}

describe('interpolation never overshoots', () => {
  it('stays within the range spanned by the keys', () => {
    fc.assert(
      fc.property(keysArb(), fc.integer({ min: -100, max: 30_000 }), (keys, t) => {
        const v = sampleMotion(keys, t, 0)
        const vs = keys.map((k) => k.v)
        return v >= Math.min(...vs) - 1e-9 && v <= Math.max(...vs) + 1e-9
      }),
    )
  })
})

describe('validated tracks respect the speed limit', () => {
  it('holds for the main timeline (including the move from home)', () => {
    fc.assert(
      fc.property(keysArb(), (keys) => {
        const duration = (keys[keys.length - 1] as MotionKey).t
        const errors = validateMotionKeys(keys, joint, duration, [], {}, null).filter((i) => i.severity === 'error')
        fc.pre(errors.length === 0)
        const peak = maxSpeed((t) => sampleJoint(keys, joint.home, t), 0, duration)
        expect(peak).toBeLessThanOrEqual(joint.maxVelocity * 1.001)
      }),
      { numRuns: 300 },
    )
  })

  it('holds across sensor-response blends', () => {
    fc.assert(
      fc.property(
        keysArb(400),
        keysArb(400),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 20_000 }),
        (timeline, clip, blendMs, startAt) => {
          const clipStart = (clip[0] as MotionKey).t
          const shifted = clip.map((k) => ({ ...k, t: k.t - clipStart }))
          const durationMs = Math.max(1, (shifted[shifted.length - 1] as MotionKey).t)
          const showEnd = Math.max((timeline[timeline.length - 1] as MotionKey).t, startAt + 2 * blendMs + durationMs)
          const ok =
            validateMotionKeys(timeline, joint, showEnd, [], {}, null).every((i) => i.severity !== 'error') &&
            validateMotionKeys(shifted, joint, durationMs, [], {}, { behaviorId: 'b', blendMs }).every(
              (i) => i.severity !== 'error',
            )
          fc.pre(ok)
          const schedule: BehaviorSchedule = {
            id: 'b',
            trigger: { sensorId: 's', event: 'enter' },
            window: null,
            blendMs,
            cooldownMs: 0,
            durationMs,
            devices: ['fig'],
          }
          const payload: DollPayload = {
            kind: 'doll',
            character: { ref: { id: 'c', revision: 1 }, joints: [joint] },
            motion: { j: timeline },
            behaviorMotion: { b: { j: shifted } },
          }
          const bundle = { behaviors: [schedule] }
          const started = [{ id: 'b', startAt }]
          const pose = (t: number) =>
            sampleDollPose(payload, t, activeBehaviorFor(bundle, 'fig', t, started)).j ?? Number.NaN
          const peak = maxSpeed(pose, 0, showEnd)
          expect(peak).toBeLessThanOrEqual(joint.maxVelocity * 1.001)
        },
      ),
      { numRuns: 200 },
    )
  })
})
