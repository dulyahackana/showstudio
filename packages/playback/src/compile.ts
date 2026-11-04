import {
  type AudioCue,
  type BehaviorSchedule,
  type CharacterDefinition,
  type DevicePayload,
  type EnvironmentDefinition,
  type LightKey,
  type MotionTracks,
  refKey,
  type ShowBundle,
  type ShowDefinition,
  type Tracks,
} from '@studio/schema'

export interface CompileInput {
  show: { id: string; revision: number }
  definition: ShowDefinition
  environment: EnvironmentDefinition
  /** Published character definitions keyed by "id@revision". */
  characters: ReadonlyMap<string, CharacterDefinition>
  /** Where devices download an audio asset from. */
  assetPath: (assetId: string) => string
}

const byTime = <T extends { t: number }>(keys: readonly T[]): T[] => [...keys].sort((a, b) => a.t - b.t)

const nonEmptyMotion = (motion: MotionTracks | undefined): MotionTracks =>
  Object.fromEntries(
    Object.entries(motion ?? {}).flatMap(([joint, keys]) => (keys.length ? [[joint, byTime(keys)]] : [])),
  )

const hasData = (tracks: Tracks, deviceId: string): boolean =>
  Object.keys(nonEmptyMotion(tracks.motion[deviceId])).length > 0 ||
  (tracks.lights[deviceId]?.length ?? 0) > 0 ||
  (tracks.audio[deviceId]?.length ?? 0) > 0

/**
 * Compile an authored show into the per-device bundle the fleet ships. Pure and
 * deterministic: identical inputs give a byte-identical canonical bundle. Callers
 * validate first; unresolved references throw.
 */
export function compileBundle(input: CompileInput): ShowBundle {
  const { definition: show, environment: env } = input
  const behaviors = show.behaviors.filter((b) => b.enabled)
  const devices: Record<string, DevicePayload> = {}

  for (const placement of env.placements) {
    const character = input.characters.get(refKey(placement.character))
    if (!character) throw new Error(`Character ${refKey(placement.character)} is not available`)
    const behaviorMotion: Record<string, MotionTracks> = {}
    for (const b of behaviors) {
      const motion = nonEmptyMotion(b.tracks.motion[placement.deviceId])
      if (Object.keys(motion).length) behaviorMotion[b.id] = motion
    }
    devices[placement.deviceId] = {
      kind: 'doll',
      character: {
        ref: placement.character,
        joints: character.joints.map(({ name, type, min, max, home, maxVelocity }) => ({
          name,
          type,
          min,
          max,
          home,
          maxVelocity,
        })),
      },
      motion: nonEmptyMotion(show.tracks.motion[placement.deviceId]),
      behaviorMotion,
    }
  }

  for (const light of env.lights) {
    const behaviorKeys: Record<string, LightKey[]> = {}
    for (const b of behaviors) {
      const keys = b.tracks.lights[light.deviceId]
      if (keys?.length) behaviorKeys[b.id] = byTime(keys)
    }
    devices[light.deviceId] = {
      kind: 'light',
      dmx: light.dmx,
      keys: byTime(show.tracks.lights[light.deviceId] ?? []),
      behaviorKeys,
    }
  }

  for (const zone of env.audio) {
    const cues = byTime(show.tracks.audio[zone.deviceId] ?? [])
    const behaviorCues: Record<string, AudioCue[]> = {}
    for (const b of behaviors) {
      const list = b.tracks.audio[zone.deviceId]
      if (list?.length) behaviorCues[b.id] = byTime(list)
    }
    const assetIds = new Set([...cues, ...Object.values(behaviorCues).flat()].map((c) => c.assetId))
    devices[zone.deviceId] = {
      kind: 'audio',
      maxVolumeDb: zone.maxVolumeDb,
      cues,
      behaviorCues,
      assets: Object.fromEntries([...assetIds].sort().map((id) => [id, { path: input.assetPath(id) }])),
    }
  }

  for (const sensor of env.sensors) {
    devices[sensor.deviceId] = { kind: 'sensor', type: sensor.type, range: sensor.range }
  }

  const schedules: BehaviorSchedule[] = behaviors.map((b) => ({
    id: b.id,
    trigger: b.trigger,
    window: b.window,
    standby: b.standby ?? false,
    blendMs: b.blendMs,
    cooldownMs: b.cooldownMs,
    durationMs: b.durationMs,
    devices: Object.keys(devices)
      .filter((id) => hasData(b.tracks, id))
      .sort(),
  }))

  return {
    schemaVersion: 1,
    show: { id: input.show.id, revision: input.show.revision, name: show.name },
    environment: show.environment,
    durationMs: show.durationMs,
    behaviors: schedules,
    devices,
  }
}
