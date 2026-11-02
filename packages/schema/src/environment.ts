import { z } from 'zod'
import { Box, DocRef, HexColor, Id, Sha256, Vec3 } from './common.ts'

export const Placement = z
  .object({
    deviceId: Id.describe('Figure controller id in this attraction'),
    name: z.string().min(1),
    character: DocRef.describe('Pinned character definition revision'),
    position: Vec3,
    rotationY: z.number().describe('Yaw in degrees'),
  })
  .meta({ id: 'Placement' })
export type Placement = z.infer<typeof Placement>

export const LightFixture = z
  .object({
    deviceId: Id,
    name: z.string().min(1),
    position: Vec3,
    target: Vec3.describe('Point the fixture aims at'),
    dmx: z.object({
      universe: z.number().int().min(0).max(32767),
      address: z.number().int().min(1).max(512),
    }),
  })
  .meta({ id: 'LightFixture' })
export type LightFixture = z.infer<typeof LightFixture>

export const AudioZone = z
  .object({
    deviceId: Id,
    name: z.string().min(1),
    position: Vec3,
    maxVolumeDb: z.number().max(0).describe('Output ceiling in dBFS; louder cues are rejected'),
  })
  .meta({ id: 'AudioZone' })
export type AudioZone = z.infer<typeof AudioZone>

export const SensorType = z.enum(['presence', 'proximity', 'button']).meta({ id: 'SensorType' })
export type SensorType = z.infer<typeof SensorType>

export const SensorEvent = z.enum(['enter', 'exit', 'press']).meta({ id: 'SensorEvent' })
export type SensorEvent = z.infer<typeof SensorEvent>

/** Which events each sensor type can emit. */
export const SENSOR_EVENTS: Record<SensorType, readonly SensorEvent[]> = {
  presence: ['enter', 'exit'],
  proximity: ['enter', 'exit'],
  button: ['press'],
}

export const Sensor = z
  .object({
    deviceId: Id,
    name: z.string().min(1),
    type: SensorType,
    position: Vec3,
    range: z.number().positive().describe('Detection radius in meters'),
  })
  .meta({ id: 'Sensor' })
export type Sensor = z.infer<typeof Sensor>

export const KeepOutZone = z
  .object({ name: z.string().min(1), box: Box })
  .meta({ id: 'KeepOutZone', description: 'Guest area or walkway no figure footprint may reach' })
export type KeepOutZone = z.infer<typeof KeepOutZone>

export const PaletteColor = z.object({ name: z.string().min(1), color: HexColor }).meta({ id: 'PaletteColor' })

export const SceneryItem = z
  .object({
    id: Id,
    name: z.string().min(1),
    model: z.object({ assetId: Sha256 }),
    position: Vec3,
    rotationY: z.number().describe('Yaw in degrees'),
    scale: z.number().positive(),
  })
  .meta({
    id: 'SceneryItem',
    description: 'Static set dressing (rock, treasure, pillar). Not a device: never moves and is not in bundles',
  })
export type SceneryItem = z.infer<typeof SceneryItem>

/** One attraction: its boundaries, installed figures, fixtures, speakers and sensors. */
export const EnvironmentDefinition = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    stage: Box.describe('Show boundary; every figure footprint must stay inside'),
    keepOut: z.array(KeepOutZone),
    ambient: z.object({ color: HexColor, intensity: z.number().min(0).max(1) }),
    palette: z.array(PaletteColor),
    placements: z.array(Placement),
    lights: z.array(LightFixture),
    audio: z.array(AudioZone),
    sensors: z.array(Sensor),
    scenery: z.array(SceneryItem).default([]).describe('Set dressing for previews and digital twins'),
  })
  .meta({ id: 'EnvironmentDefinition' })
export type EnvironmentDefinition = z.infer<typeof EnvironmentDefinition>

export type EnvironmentDeviceKind = 'doll' | 'light' | 'audio' | 'sensor'

/** Every device the attraction contains, in a stable order. */
export function environmentDevices(
  env: EnvironmentDefinition,
): { deviceId: string; kind: EnvironmentDeviceKind; name: string }[] {
  return [
    ...env.placements.map((p) => ({ deviceId: p.deviceId, kind: 'doll' as const, name: p.name })),
    ...env.lights.map((l) => ({ deviceId: l.deviceId, kind: 'light' as const, name: l.name })),
    ...env.audio.map((a) => ({ deviceId: a.deviceId, kind: 'audio' as const, name: a.name })),
    ...env.sensors.map((s) => ({ deviceId: s.deviceId, kind: 'sensor' as const, name: s.name })),
  ]
}
