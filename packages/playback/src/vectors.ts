import type {
  BehaviorSchedule,
  DollPayload,
  JointLimits,
  LightKey,
  MotionKey,
  SensorEvent,
  ShowBundle,
} from '@studio/schema'
import { compileBundle } from './compile.ts'
import { characters, lab, makeShow, robot } from './fixtures.ts'
import { type LightSample, sampleJoint, sampleLight } from './interpolate.ts'
import {
  audioEventsBetween,
  BehaviorScheduler,
  type ShowFrame,
  type StartedBehavior,
  sampleFrame,
  standbyBundle,
} from './runtime.ts'
import { validateDollPayload } from './validate.ts'

/**
 * Conformance vectors: inputs + expected outputs that every playback
 * implementation (TypeScript, the game-engine simulator, real controllers)
 * must reproduce within `tolerance`. Regenerate with `bun run gen:vectors`.
 */
export interface Vectors {
  description: string
  tolerance: number
  motion: { name: string; home: number; keys: MotionKey[]; samples: [number, number][] }[]
  lights: { name: string; keys: LightKey[]; samples: [number, LightSample][] }[]
  frames: {
    name: string
    bundle: ShowBundle
    started: StartedBehavior[]
    samples: { t: number; frame: ShowFrame }[]
    /** Every cue each audio device starts over the whole show: audioEventsBetween(payload, bundle, -1, durationMs). */
    audio: Record<string, AudioVector[]>
  }[]
  /** Sensor arbitration: feed the triggers in order; each must start exactly `started`. */
  scheduler: { name: string; behaviors: BehaviorSchedule[]; steps: SchedulerStep[] }[]
  /** Device-side limit check: the sorted, distinct error codes validateDollPayload reports. */
  deviceChecks: DeviceCheck[]
  /** Between shows: standbyBundle(bundle), null when the show has no standby responses. */
  standby: { name: string; bundle: ShowBundle; standby: ShowBundle | null }[]
}

export interface AudioVector {
  cueId: string
  at: number
}

export interface SchedulerStep {
  sensorId: string
  event: SensorEvent
  t: number
  started: StartedBehavior[]
}

export interface DeviceCheck {
  name: string
  payload: DollPayload
  limits: JointLimits[]
  durationMs: number
  behaviors: BehaviorSchedule[]
  errors: string[]
}

export const errorCodes = (...args: Parameters<typeof validateDollPayload>): string[] =>
  [
    ...new Set(
      validateDollPayload(...args)
        .filter((i) => i.severity === 'error')
        .map((i) => i.code),
    ),
  ].sort()

export function audioVectors(bundle: ShowBundle, started: readonly StartedBehavior[]): Record<string, AudioVector[]> {
  const out: Record<string, AudioVector[]> = {}
  for (const [deviceId, payload] of Object.entries(bundle.devices)) {
    if (payload.kind !== 'audio') continue
    out[deviceId] = audioEventsBetween(payload, bundle, -1, bundle.durationMs, started).map((e) => ({
      cueId: e.cue.id,
      at: e.at,
    }))
  }
  return out
}

const schedule = (s: Partial<BehaviorSchedule> & Pick<BehaviorSchedule, 'id' | 'trigger' | 'devices'>) => ({
  window: null,
  blendMs: 0,
  cooldownMs: 0,
  durationMs: 1000,
  ...s,
})

function schedulerCase(
  name: string,
  behaviors: BehaviorSchedule[],
  triggers: [string, SensorEvent, number][],
): Vectors['scheduler'][number] {
  const scheduler = new BehaviorScheduler(behaviors)
  return {
    name,
    behaviors,
    steps: triggers.map(([sensorId, event, t]) => ({
      sensorId,
      event,
      t,
      started: scheduler.trigger(sensorId, event, t),
    })),
  }
}

function deviceChecks(bundle: ShowBundle): DeviceCheck[] {
  const payload = bundle.devices['robot-01'] as DollPayload
  const limits: JointLimits[] = robot.joints.map(({ name, type, min, max, home, maxVelocity }) => ({
    name,
    type,
    min,
    max,
    home,
    maxVelocity,
  }))
  const edit = (fn: (p: DollPayload) => void): DollPayload => {
    const copy = structuredClone(payload)
    fn(copy)
    return copy
  }
  const cases: Omit<DeviceCheck, 'errors'>[] = [
    { name: 'compiled payload passes', payload, limits, durationMs: bundle.durationMs, behaviors: bundle.behaviors },
    {
      name: 'key outside the range of motion',
      payload: edit((p) => {
        ;(p.motion.head_yaw as MotionKey[])[0] = { t: 1000, v: 95, interp: 'ease' }
      }),
      limits,
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors,
    },
    {
      name: 'controller holds tighter limits than the cloud',
      payload,
      limits: limits.map((j) => (j.name === 'head_yaw' ? { ...j, min: -30, max: 30 } : j)),
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors,
    },
    {
      name: 'too fast from home',
      payload: edit((p) => {
        p.motion.arm_pitch = [
          { t: 100, v: 90, interp: 'linear' },
          { t: 6000, v: 0, interp: 'linear' },
        ]
      }),
      limits,
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors,
    },
    {
      name: 'step jump and unsorted keys',
      payload: edit((p) => {
        p.motion.head_yaw = [
          { t: 2000, v: 10, interp: 'step' },
          { t: 3000, v: 20, interp: 'linear' },
          { t: 2500, v: 0, interp: 'linear' },
        ]
      }),
      limits,
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors,
    },
    {
      name: 'joint the controller does not have, clip for an unknown behavior',
      payload: edit((p) => {
        p.motion.tail_wag = [{ t: 1000, v: 1, interp: 'linear' }]
        p.behaviorMotion.ghost = {}
      }),
      limits,
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors,
    },
    {
      name: 'blend too short to be safe from any pose',
      payload,
      limits,
      durationMs: bundle.durationMs,
      behaviors: bundle.behaviors.map((b) => ({ ...b, blendMs: 500 })),
    },
    { name: 'key after the end', payload, limits, durationMs: 5000, behaviors: bundle.behaviors },
  ]
  return cases.map((c) => ({ ...c, errors: errorCodes(c.payload, c.limits, c.durationMs, c.behaviors) }))
}

const times = (to: number, step: number) => Array.from({ length: Math.floor(to / step) + 1 }, (_, i) => i * step)

export function motionSamples(keys: MotionKey[], home: number, at: number[]): [number, number][] {
  return at.map((t) => [t, sampleJoint(keys, home, t)])
}

export function buildVectors(): Vectors {
  const motionCases: { name: string; home: number; keys: MotionKey[] }[] = [
    {
      name: 'linear from home',
      home: 0,
      keys: [
        { t: 1000, v: 10, interp: 'linear' },
        { t: 2000, v: -10, interp: 'linear' },
      ],
    },
    {
      name: 'ease and step',
      home: 5,
      keys: [
        { t: 0, v: 0, interp: 'ease' },
        { t: 1000, v: 90, interp: 'step' },
        { t: 2000, v: 45, interp: 'linear' },
      ],
    },
  ]
  const lightKeys: LightKey[] = [
    { t: 500, color: '#000000', intensity: 0, interp: 'ease' },
    { t: 1500, color: '#ff8000', intensity: 1, interp: 'step' },
    { t: 2500, color: '#0000ff', intensity: 0.25, interp: 'linear' },
  ]
  const bundle = compileBundle({
    show: { id: 'demo', revision: 1 },
    definition: makeShow(),
    environment: lab,
    characters,
    assetPath: (id) => `/api/v1/assets/${id}`,
  })
  const started = [{ id: 'wave', startAt: 3500 }]
  const withStandby = makeShow()
  for (const b of withStandby.behaviors) Object.assign(b, { standby: true, window: { fromMs: 0, toMs: 100 } })
  const standbyShow = compileBundle({
    show: { id: 'demo', revision: 2 },
    definition: withStandby,
    environment: lab,
    characters,
    assetPath: (id) => `/api/v1/assets/${id}`,
  })
  return {
    description: 'Show Studio playback conformance vectors. Times in ms, angles in degrees, colors 0..1.',
    tolerance: 1e-6,
    motion: motionCases.map((c) => ({ ...c, samples: motionSamples(c.keys, c.home, times(3000, 125)) })),
    lights: [
      {
        name: 'fade, step, hold',
        keys: lightKeys,
        samples: times(3000, 125).map((t) => [t, sampleLight(lightKeys, t)]),
      },
    ],
    frames: [
      {
        name: 'fixture show with a sensor response at 3.5 s',
        bundle,
        started,
        samples: times(bundle.durationMs, 250).map((t) => ({ t, frame: sampleFrame(bundle, t, started) })),
        audio: audioVectors(bundle, started),
      },
    ],
    scheduler: [
      schedulerCase(
        'window, cooldown and one behavior per device',
        [
          schedule({
            id: 'wave',
            trigger: { sensorId: 'door', event: 'enter' },
            blendMs: 3000,
            cooldownMs: 2000,
            durationMs: 2000,
            devices: ['audio-01', 'light-01', 'robot-01'],
          }),
          schedule({
            id: 'nod',
            trigger: { sensorId: 'button', event: 'press' },
            window: { fromMs: 1000, toMs: 9000 },
            blendMs: 500,
            devices: ['robot-01'],
          }),
          schedule({
            id: 'chime',
            trigger: { sensorId: 'door', event: 'enter' },
            cooldownMs: 1000,
            durationMs: 500,
            devices: ['audio-02'],
          }),
        ],
        [
          ['door', 'enter', 500],
          ['button', 'press', 700],
          ['door', 'enter', 1200],
          ['button', 'press', 1500],
          ['door', 'exit', 2400],
          ['door', 'enter', 2500],
          ['button', 'press', 8000],
          ['button', 'press', 8600],
          ['door', 'enter', 10000],
          ['door', 'enter', 10600],
        ],
      ),
    ],
    deviceChecks: deviceChecks(bundle),
    standby: [
      { name: 'no standby responses', bundle, standby: standbyBundle(bundle) },
      { name: 'windowed response, also between shows', bundle: standbyShow, standby: standbyBundle(standbyShow) },
    ],
  }
}
