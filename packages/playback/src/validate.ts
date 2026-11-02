import {
  type AudioZone,
  type BehaviorSchedule,
  type Box,
  type CharacterDefinition,
  type DollPayload,
  type EnvironmentDefinition,
  type Issue,
  type JointLimits,
  type LightKey,
  type MotionKey,
  type Placement,
  refKey,
  SENSOR_EVENTS,
  type ShowDefinition,
  type Tracks,
  type ValidationReport,
} from '@studio/schema'
import { sampleMotion, segmentPeakVelocity, withHome } from './interpolate.ts'

/*
 * Semantic validation shared by the editor (live feedback), the API (publish
 * gate) and devices (last software line before the hardware limits). zod checks
 * shape; this checks meaning: limits, speeds, references, boundaries.
 */

type Path = (string | number)[]
type Extra = Omit<Issue, 'severity' | 'code' | 'message' | 'path'>
const EPS = 1e-6

class Issues {
  readonly list: Issue[] = []
  error(code: string, message: string, path: Path, extra: Extra = {}) {
    this.list.push({ severity: 'error', code, message, path, ...extra })
  }
  warn(code: string, message: string, path: Path, extra: Extra = {}) {
    this.list.push({ severity: 'warning', code, message, path, ...extra })
  }
}

export function toReport(issues: readonly Issue[]): ValidationReport {
  const errors = issues.filter((i) => i.severity === 'error').length
  return { ok: errors === 0, errors, warnings: issues.length - errors, issues: [...issues] }
}

const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(2)).toString() : '∞')

// ---- geometry -------------------------------------------------------------------

export function footprintBox(placement: Placement, character: CharacterDefinition): Box {
  const [sx, sy, sz] = character.footprint.size
  const yaw = (placement.rotationY * Math.PI) / 180
  const c = Math.abs(Math.cos(yaw))
  const s = Math.abs(Math.sin(yaw))
  const hx = (c * sx + s * sz) / 2
  const hz = (s * sx + c * sz) / 2
  const [px, py, pz] = placement.position
  return { min: [px - hx, py, pz - hz], max: [px + hx, py + sy, pz + hz] }
}

export const boxInside = (inner: Box, outer: Box): boolean =>
  [0, 1, 2].every(
    (i) =>
      (inner.min[i] as number) >= (outer.min[i] as number) - EPS &&
      (inner.max[i] as number) <= (outer.max[i] as number) + EPS,
  )

export const boxesIntersect = (a: Box, b: Box): boolean =>
  [0, 1, 2].every(
    (i) => (a.min[i] as number) < (b.max[i] as number) - EPS && (b.min[i] as number) < (a.max[i] as number) - EPS,
  )

// ---- characters ----------------------------------------------------------------

export function validateCharacter(def: CharacterDefinition, opts: { modelNodes?: readonly string[] } = {}): Issue[] {
  const out = new Issues()
  if (!def.model) out.warn('model-missing', 'No 3D model attached; a placeholder will be rendered', ['model'])
  def.footprint.size.forEach((v, i) => {
    if (v <= 0) out.error('footprint-invalid', 'Footprint dimensions must be positive', ['footprint', 'size', i])
  })
  if (def.joints.length === 0) out.warn('no-joints', 'Character has no joints to animate', ['joints'])
  const seen = new Set<string>()
  def.joints.forEach((j, i) => {
    const path = ['joints', i]
    const extra = { joint: j.name, index: i }
    if (seen.has(j.name)) out.error('joint-duplicate', `Joint "${j.name}" is defined twice`, path, extra)
    seen.add(j.name)
    if (j.min >= j.max) out.error('joint-range-invalid', `${j.name}: min must be below max`, path, extra)
    if (j.home < j.min || j.home > j.max)
      out.error('joint-home-out-of-range', `${j.name}: home ${j.home} is outside [${j.min}, ${j.max}]`, path, extra)
    if (Math.hypot(...j.axis) < EPS) out.error('joint-axis-invalid', `${j.name}: axis must be non-zero`, path, extra)
    if (opts.modelNodes && !opts.modelNodes.includes(j.node))
      out.error('joint-node-missing', `${j.name}: node "${j.node}" does not exist in the model`, path, extra)
  })
  return out.list
}

// ---- environments ------------------------------------------------------------------

export interface EnvironmentContext {
  /** Published character definitions keyed by "id@revision". */
  characters: ReadonlyMap<string, CharacterDefinition>
}

export function validateEnvironment(env: EnvironmentDefinition, ctx: EnvironmentContext): Issue[] {
  const out = new Issues()
  ;[0, 1, 2].forEach((i) => {
    if ((env.stage.min[i] as number) >= (env.stage.max[i] as number))
      out.error('stage-invalid', 'Stage min must be below max on every axis', ['stage'])
  })

  const ids = new Map<string, number>()
  const allDevices: [string, Path][] = [
    ...env.placements.map((p, i): [string, Path] => [p.deviceId, ['placements', i]]),
    ...env.lights.map((l, i): [string, Path] => [l.deviceId, ['lights', i]]),
    ...env.audio.map((a, i): [string, Path] => [a.deviceId, ['audio', i]]),
    ...env.sensors.map((s, i): [string, Path] => [s.deviceId, ['sensors', i]]),
  ]
  for (const [id, path] of allDevices) {
    ids.set(id, (ids.get(id) ?? 0) + 1)
    if (ids.get(id) === 2)
      out.error('device-duplicate', `Device id "${id}" is used more than once`, path, { deviceId: id })
  }

  if (env.placements.length === 0) out.warn('no-figures', 'No figures placed in this environment', ['placements'])
  const boxes: { id: string; box: Box }[] = []
  env.placements.forEach((p, i) => {
    const path = ['placements', i]
    const character = ctx.characters.get(refKey(p.character))
    if (!character) {
      out.error('character-unresolved', `${p.deviceId}: character ${refKey(p.character)} is not published`, path, {
        deviceId: p.deviceId,
      })
      return
    }
    const box = footprintBox(p, character)
    if (!boxInside(box, env.stage))
      out.error('placement-outside-stage', `${p.deviceId}: range of motion leaves the stage boundary`, path, {
        deviceId: p.deviceId,
      })
    env.keepOut.forEach((zone) => {
      if (boxesIntersect(box, zone.box))
        out.error(
          'placement-in-keep-out',
          `${p.deviceId}: range of motion reaches keep-out zone "${zone.name}"`,
          path,
          {
            deviceId: p.deviceId,
          },
        )
    })
    for (const other of boxes) {
      if (boxesIntersect(box, other.box))
        out.warn('placement-overlap', `${p.deviceId}: range of motion overlaps ${other.id}`, path, {
          deviceId: p.deviceId,
        })
    }
    boxes.push({ id: p.deviceId, box })
  })

  const dmx = new Map<string, string>()
  env.lights.forEach((l, i) => {
    const key = `${l.dmx.universe}/${l.dmx.address}`
    const other = dmx.get(key)
    if (other)
      out.warn('dmx-address-conflict', `${l.deviceId}: DMX ${key} is also used by ${other}`, ['lights', i, 'dmx'], {
        deviceId: l.deviceId,
      })
    dmx.set(key, l.deviceId)
  })
  return out.list
}

// ---- shows ---------------------------------------------------------------------------

export interface ShowContext extends EnvironmentContext {
  environment: EnvironmentDefinition
  /** Known asset ids; when omitted asset references are not checked. */
  assets?: ReadonlySet<string>
}

interface ClipInfo {
  behaviorId: string
  blendMs: number
}

/**
 * Validate one joint track against limits.
 * `clip` = keys of a sensor response; they start after a blend instead of from home.
 */
export function validateMotionKeys(
  keys: readonly MotionKey[],
  joint: JointLimits,
  durationMs: number,
  path: Path,
  extra: Extra,
  clip: ClipInfo | null,
  out: Issues = new Issues(),
): Issue[] {
  const unit = joint.type === 'revolute' ? '°' : 'm'
  keys.forEach((k, i) => {
    const at = { ...extra, joint: joint.name, index: i, t: k.t }
    if (k.t > durationMs)
      out.error('key-after-end', `${joint.name}: key at ${k.t} ms is after the end`, [...path, i], at)
    const prev = keys[i - 1]
    if (prev && k.t <= prev.t)
      out.error(
        k.t === prev.t ? 'keys-duplicate-time' : 'keys-unsorted',
        `${joint.name}: keys must have strictly increasing times`,
        [...path, i],
        at,
      )
    if (k.v < joint.min - EPS || k.v > joint.max + EPS)
      out.error(
        'motion-out-of-range',
        `${joint.name}: ${fmt(k.v)}${unit} at ${k.t} ms is outside [${joint.min}, ${joint.max}]`,
        [...path, i],
        at,
      )
  })

  const effective = clip ? keys : withHome(keys, joint.home)
  const offset = effective.length - keys.length
  for (let i = 1; i < effective.length; i++) {
    const a = effective[i - 1] as MotionKey
    const b = effective[i] as MotionKey
    const v = segmentPeakVelocity(a, b)
    if (v > joint.maxVelocity + EPS) {
      const index = i - offset
      const from = i === 1 && offset === 1 ? 'from home' : `from ${a.t} ms`
      out.error(
        'motion-velocity-exceeded',
        `${joint.name}: ${fmt(v)}${unit}/s ${from} to ${b.t} ms exceeds ${joint.maxVelocity}${unit}/s`,
        [...path, index],
        { ...extra, joint: joint.name, index, t: b.t },
      )
    }
  }

  const last = keys[keys.length - 1]
  if (!clip && last && Math.abs(last.v - joint.home) > EPS)
    out.warn(
      'motion-not-home-at-end',
      `${joint.name}: ends at ${fmt(last.v)}${unit}, not home (${joint.home})`,
      [...path, keys.length - 1],
      { ...extra, joint: joint.name, index: keys.length - 1, t: last.t },
    )

  if (clip && keys.length > 0) {
    // Blends start from (and return to) wherever the timeline is, so assume the worst case: either limit.
    const ends: [string, number][] = [
      ['in', sampleMotion(keys, 0, joint.home)],
      ['out', sampleMotion(keys, durationMs, joint.home)],
    ]
    for (const [dir, v] of ends) {
      const worst = Math.max(Math.abs(v - joint.min), Math.abs(joint.max - v))
      const speed = clip.blendMs > 0 ? (1.5 * worst * 1000) / clip.blendMs : worst > EPS ? Number.POSITIVE_INFINITY : 0
      if (speed > joint.maxVelocity + EPS) {
        const needed = Math.ceil((1.5 * worst * 1000) / joint.maxVelocity)
        out.error(
          'behavior-blend-too-fast',
          `${joint.name}: blend-${dir} could reach ${fmt(speed)}${unit}/s; needs blendMs >= ${needed}`,
          path,
          { ...extra, joint: joint.name, behaviorId: clip.behaviorId },
        )
      }
    }
  }
  return out.list
}

function validateKeyTimes(
  keys: readonly { t: number }[],
  durationMs: number,
  path: Path,
  extra: Extra,
  label: string,
  out: Issues,
) {
  keys.forEach((k, i) => {
    if (k.t > durationMs)
      out.error('key-after-end', `${label}: key at ${k.t} ms is after the end`, [...path, i], {
        ...extra,
        index: i,
        t: k.t,
      })
    const prev = keys[i - 1]
    if (prev && k.t <= prev.t)
      out.error('keys-unsorted', `${label}: keys must have strictly increasing times`, [...path, i], {
        ...extra,
        index: i,
        t: k.t,
      })
  })
}

function validateTracks(
  tracks: Tracks,
  durationMs: number,
  path: Path,
  ctx: ShowContext,
  clip: ClipInfo | null,
  out: Issues,
) {
  const env = ctx.environment
  const extraBase: Extra = clip ? { behaviorId: clip.behaviorId } : {}
  const placements = new Map(env.placements.map((p) => [p.deviceId, p]))
  const lights = new Set(env.lights.map((l) => l.deviceId))
  const zones = new Map<string, AudioZone>(env.audio.map((a) => [a.deviceId, a]))

  for (const [deviceId, joints] of Object.entries(tracks.motion)) {
    const p = [...path, 'motion', deviceId]
    const extra = { ...extraBase, deviceId }
    const placement = placements.get(deviceId)
    if (!placement) {
      out.error('track-device-unknown', `Motion track for unknown figure "${deviceId}"`, p, extra)
      continue
    }
    const character = ctx.characters.get(refKey(placement.character))
    if (!character) {
      out.error(
        'character-unresolved',
        `${deviceId}: character ${refKey(placement.character)} is not available`,
        p,
        extra,
      )
      continue
    }
    for (const [jointName, keys] of Object.entries(joints)) {
      const joint = character.joints.find((j) => j.name === jointName)
      if (!joint) {
        out.error(
          'track-joint-unknown',
          `${deviceId}: "${character.name}" has no joint "${jointName}"`,
          [...p, jointName],
          {
            ...extra,
            joint: jointName,
          },
        )
        continue
      }
      validateMotionKeys(keys, joint, durationMs, [...p, jointName], extra, clip, out)
    }
  }

  for (const [deviceId, keys] of Object.entries(tracks.lights)) {
    const p = [...path, 'lights', deviceId]
    const extra = { ...extraBase, deviceId }
    if (!lights.has(deviceId)) {
      out.error('track-device-unknown', `Light track for unknown fixture "${deviceId}"`, p, extra)
      continue
    }
    validateKeyTimes(keys as LightKey[], durationMs, p, extra, deviceId, out)
  }

  for (const [deviceId, cues] of Object.entries(tracks.audio)) {
    const p = [...path, 'audio', deviceId]
    const extra = { ...extraBase, deviceId }
    const zone = zones.get(deviceId)
    if (!zone) {
      out.error('track-device-unknown', `Audio track for unknown zone "${deviceId}"`, p, extra)
      continue
    }
    const ids = new Set<string>()
    cues.forEach((cue, i) => {
      const at = { ...extra, index: i, t: cue.t }
      if (cue.t > durationMs)
        out.error('key-after-end', `${deviceId}: cue "${cue.label}" starts after the end`, [...p, i], at)
      if (cue.volumeDb > zone.maxVolumeDb + EPS)
        out.error(
          'audio-too-loud',
          `${deviceId}: cue "${cue.label}" at ${cue.volumeDb} dBFS exceeds the zone limit of ${zone.maxVolumeDb} dBFS`,
          [...p, i],
          at,
        )
      if (ctx.assets && !ctx.assets.has(cue.assetId))
        out.error(
          'audio-asset-missing',
          `${deviceId}: cue "${cue.label}" references a missing audio file`,
          [...p, i],
          at,
        )
      if (ids.has(cue.id)) out.error('cue-duplicate', `${deviceId}: cue id "${cue.id}" is used twice`, [...p, i], at)
      ids.add(cue.id)
    })
  }
}

const isEmpty = (t: Tracks) =>
  Object.values(t.motion).every((joints) => Object.values(joints).every((keys) => keys.length === 0)) &&
  Object.values(t.lights).every((keys) => keys.length === 0) &&
  Object.values(t.audio).every((cues) => cues.length === 0)

export function validateShow(show: ShowDefinition, ctx: ShowContext): Issue[] {
  const out = new Issues()
  validateTracks(show.tracks, show.durationMs, ['tracks'], ctx, null, out)
  if (isEmpty(show.tracks)) out.warn('show-empty', 'The main timeline has no keys yet', ['tracks'])

  const sensors = new Map(ctx.environment.sensors.map((s) => [s.deviceId, s]))
  const ids = new Set<string>()
  show.behaviors.forEach((b, i) => {
    const path = ['behaviors', i]
    const extra = { behaviorId: b.id }
    if (ids.has(b.id)) out.error('behavior-duplicate', `Behavior id "${b.id}" is used twice`, path, extra)
    ids.add(b.id)
    const sensor = sensors.get(b.trigger.sensorId)
    if (!sensor) {
      out.error(
        'behavior-sensor-unknown',
        `${b.name}: sensor "${b.trigger.sensorId}" is not in the environment`,
        [...path, 'trigger'],
        extra,
      )
    } else if (!SENSOR_EVENTS[sensor.type].includes(b.trigger.event)) {
      out.error(
        'behavior-event-invalid',
        `${b.name}: a ${sensor.type} sensor cannot emit "${b.trigger.event}"`,
        [...path, 'trigger'],
        extra,
      )
    }
    if (b.window && (b.window.fromMs >= b.window.toMs || b.window.toMs > show.durationMs))
      out.error(
        'behavior-window-invalid',
        `${b.name}: window must be a non-empty range inside the show`,
        [...path, 'window'],
        extra,
      )
    if (isEmpty(b.tracks))
      out.warn('behavior-empty', `${b.name}: response clip has no keys`, [...path, 'tracks'], extra)
    validateTracks(b.tracks, b.durationMs, [...path, 'tracks'], ctx, { behaviorId: b.id, blendMs: b.blendMs }, out)
  })
  return out.list
}

/**
 * Device-side check: validate a figure's payload against the limits the
 * controller itself holds, independent of what the cloud claims.
 */
export function validateDollPayload(
  payload: DollPayload,
  localJoints: readonly JointLimits[],
  durationMs: number,
  behaviors: readonly BehaviorSchedule[],
): Issue[] {
  const out = new Issues()
  const byName = new Map(localJoints.map((j) => [j.name, j]))
  const check = (motion: Record<string, MotionKey[]>, duration: number, path: Path, clip: ClipInfo | null) => {
    for (const [name, keys] of Object.entries(motion)) {
      const joint = byName.get(name)
      if (!joint) {
        out.error('track-joint-unknown', `Controller has no joint "${name}"`, [...path, name], { joint: name })
        continue
      }
      validateMotionKeys(keys, joint, duration, [...path, name], {}, clip, out)
    }
  }
  check(payload.motion, durationMs, ['motion'], null)
  for (const [behaviorId, motion] of Object.entries(payload.behaviorMotion)) {
    const schedule = behaviors.find((b) => b.id === behaviorId)
    if (!schedule) {
      out.error('behavior-unknown', `Clip for unknown behavior "${behaviorId}"`, ['behaviorMotion', behaviorId])
      continue
    }
    check(motion, schedule.durationMs, ['behaviorMotion', behaviorId], { behaviorId, blendMs: schedule.blendMs })
  }
  return out.list
}
