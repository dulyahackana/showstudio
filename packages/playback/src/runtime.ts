import type {
  AudioCue,
  AudioPayload,
  BehaviorSchedule,
  DevicePayload,
  DollPayload,
  LightPayload,
  SensorEvent,
  ShowBundle,
} from '@studio/schema'
import {
  ease,
  type LightSample,
  lerp,
  mixLight,
  sampleJoint,
  sampleLight,
  sampleLightClip,
  sampleMotion,
} from './interpolate.ts'

/*
 * Deterministic show runtime. Everything is a pure function of
 * (bundle, show time, list of started behaviors), so the editor preview, the
 * simulated devices and the engine produce the same pose at the same time.
 *
 * Sensor response timeline (local time from trigger):
 *   [0, blend)               blend from the pose at trigger time to clip start (clip clock held)
 *   [blend, blend+dur)       clip
 *   [blend+dur, 2*blend+dur) blend from clip end to where the main timeline will be at the end
 */

export interface StartedBehavior {
  id: string
  /** Show time (ms) at which the behavior started. */
  startAt: number
}

export const behaviorEnd = (s: BehaviorSchedule, startAt: number): number => startAt + 2 * s.blendMs + s.durationMs

export type Phase =
  | { kind: 'in'; w: number }
  | { kind: 'clip'; local: number }
  | { kind: 'out'; w: number; tEnd: number }

export function phaseOf(s: BehaviorSchedule, startAt: number, t: number): Phase | null {
  const local = t - startAt
  if (local < 0) return null
  if (local < s.blendMs) return { kind: 'in', w: ease(local / s.blendMs) }
  if (local < s.blendMs + s.durationMs) return { kind: 'clip', local: local - s.blendMs }
  if (local < 2 * s.blendMs + s.durationMs)
    return { kind: 'out', w: ease((local - s.blendMs - s.durationMs) / s.blendMs), tEnd: behaviorEnd(s, startAt) }
  return null
}

/**
 * Arbitrates sensor events. Runs once per attraction (the park-local show
 * controller) and broadcasts decisions, so all devices agree.
 * Rules: trigger + event match, inside window, past cooldown (measured from the
 * end of the previous run), and no running behavior shares a device.
 */
export class BehaviorScheduler {
  private readonly started: StartedBehavior[] = []
  private readonly byId: Map<string, BehaviorSchedule>

  constructor(private readonly schedules: readonly BehaviorSchedule[]) {
    this.byId = new Map(schedules.map((s) => [s.id, s]))
  }

  get history(): readonly StartedBehavior[] {
    return this.started
  }

  trigger(sensorId: string, event: SensorEvent, t: number): StartedBehavior[] {
    const out: StartedBehavior[] = []
    for (const s of this.schedules) {
      if (s.trigger.sensorId !== sensorId || s.trigger.event !== event) continue
      if (s.window && (t < s.window.fromMs || t > s.window.toMs)) continue
      const last = this.started.findLast((x) => x.id === s.id)
      if (last && t < behaviorEnd(s, last.startAt) + s.cooldownMs) continue
      const busy = this.started.some((x) => {
        const other = this.byId.get(x.id)
        return (
          other !== undefined &&
          t >= x.startAt &&
          t < behaviorEnd(other, x.startAt) &&
          other.devices.some((d) => s.devices.includes(d))
        )
      })
      if (busy) continue
      const entry = { id: s.id, startAt: t }
      this.started.push(entry)
      out.push(entry)
    }
    return out
  }

  /** Forget starts after `t` (editor scrubbing backwards). */
  truncate(t: number): void {
    for (let i = this.started.length - 1; i >= 0; i--) {
      if ((this.started[i] as StartedBehavior).startAt > t) this.started.splice(i, 1)
    }
  }

  reset(): void {
    this.started.length = 0
  }
}

export interface ActiveBehavior {
  schedule: BehaviorSchedule
  startAt: number
  phase: Phase
}

/** The behavior currently driving `deviceId`, if any (latest start wins). */
export function activeBehaviorFor(
  bundle: Pick<ShowBundle, 'behaviors'>,
  deviceId: string,
  t: number,
  started: readonly StartedBehavior[],
): ActiveBehavior | null {
  for (let i = started.length - 1; i >= 0; i--) {
    const entry = started[i] as StartedBehavior
    const schedule = bundle.behaviors.find((b) => b.id === entry.id)
    if (!schedule?.devices.includes(deviceId)) continue
    const phase = phaseOf(schedule, entry.startAt, t)
    if (phase) return { schedule, startAt: entry.startAt, phase }
  }
  return null
}

export function sampleDollPose(payload: DollPayload, t: number, active: ActiveBehavior | null): Record<string, number> {
  const pose: Record<string, number> = {}
  for (const joint of payload.character.joints) {
    const keys = payload.motion[joint.name] ?? []
    const base = (time: number) => sampleJoint(keys, joint.home, time)
    const clip = active ? payload.behaviorMotion[active.schedule.id]?.[joint.name] : undefined
    if (!active || !clip?.length) {
      pose[joint.name] = base(t)
      continue
    }
    const p = active.phase
    if (p.kind === 'in') {
      const from = base(active.startAt)
      pose[joint.name] = lerp(from, sampleMotion(clip, 0, from), p.w)
    } else if (p.kind === 'clip') {
      pose[joint.name] = sampleMotion(clip, p.local, joint.home)
    } else {
      const from = sampleMotion(clip, active.schedule.durationMs, joint.home)
      pose[joint.name] = lerp(from, base(p.tEnd), p.w)
    }
  }
  return pose
}

export function sampleLightState(payload: LightPayload, t: number, active: ActiveBehavior | null): LightSample {
  const clip = active ? payload.behaviorKeys[active.schedule.id] : undefined
  if (!active || !clip?.length) return sampleLight(payload.keys, t)
  const p = active.phase
  if (p.kind === 'in') return mixLight(sampleLight(payload.keys, active.startAt), sampleLightClip(clip, 0), p.w)
  if (p.kind === 'clip') return sampleLightClip(clip, p.local)
  return mixLight(sampleLightClip(clip, active.schedule.durationMs), sampleLight(payload.keys, p.tEnd), p.w)
}

export interface AudioEvent {
  cue: AudioCue
  /** Show time at which the cue starts. */
  at: number
  source: 'timeline' | { behaviorId: string }
}

/** Cues that start in the half-open interval (from, to]. Use from = -1 for the first tick. */
export function audioEventsBetween(
  payload: AudioPayload,
  bundle: Pick<ShowBundle, 'behaviors'>,
  from: number,
  to: number,
  started: readonly StartedBehavior[],
): AudioEvent[] {
  const events: AudioEvent[] = payload.cues
    .filter((c) => c.t > from && c.t <= to)
    .map((cue) => ({ cue, at: cue.t, source: 'timeline' as const }))
  for (const entry of started) {
    const schedule = bundle.behaviors.find((b) => b.id === entry.id)
    const cues = payload.behaviorCues[entry.id]
    if (!schedule || !cues) continue
    for (const cue of cues) {
      const at = entry.startAt + schedule.blendMs + cue.t
      if (at > from && at <= to) events.push({ cue, at, source: { behaviorId: entry.id } })
    }
  }
  return events.sort((a, b) => a.at - b.at)
}

/**
 * The attraction between shows. After a show completes, its standby responses keep
 * answering guests: the same runtime with the main timeline emptied (figures rest at
 * home, fixtures dark, no cues) and no show-time windows. Its clock starts when the
 * show ends. Null when the show has no standby responses.
 */
export function standbyBundle(bundle: ShowBundle): ShowBundle | null {
  const behaviors = bundle.behaviors.filter((b) => b.standby).map((b) => ({ ...b, window: null }))
  if (behaviors.length === 0) return null
  const devices = Object.fromEntries(
    Object.entries(bundle.devices).map(([id, p]): [string, DevicePayload] => {
      if (p.kind === 'doll') return [id, { ...p, motion: {} }]
      if (p.kind === 'light') return [id, { ...p, keys: [] }]
      if (p.kind === 'audio') return [id, { ...p, cues: [] }]
      return [id, p]
    }),
  )
  return { ...bundle, behaviors, devices }
}

export interface ShowFrame {
  poses: Record<string, Record<string, number>>
  lights: Record<string, LightSample>
  /** Behavior ids driving at least one device right now. */
  activeBehaviors: string[]
}

/** Whole-attraction state at show time `t` (editor preview, telemetry mirrors). */
export function sampleFrame(bundle: ShowBundle, t: number, started: readonly StartedBehavior[]): ShowFrame {
  const frame: ShowFrame = { poses: {}, lights: {}, activeBehaviors: [] }
  const active = new Set<string>()
  for (const [deviceId, payload] of Object.entries(bundle.devices)) {
    const behavior = activeBehaviorFor(bundle, deviceId, t, started)
    if (behavior) active.add(behavior.schedule.id)
    if (payload.kind === 'doll') frame.poses[deviceId] = sampleDollPose(payload, t, behavior)
    else if (payload.kind === 'light') frame.lights[deviceId] = sampleLightState(payload, t, behavior)
  }
  frame.activeBehaviors = [...active]
  return frame
}
