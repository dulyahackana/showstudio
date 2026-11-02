import { z } from 'zod'
import { Joint } from './character.ts'
import { DocRef, Id, Revision, Sha256 } from './common.ts'
import { SensorEvent, SensorType } from './environment.ts'
import { AudioCue, LightKey, MotionTracks } from './show.ts'

export const JointLimits = Joint.pick({
  name: true,
  type: true,
  min: true,
  max: true,
  home: true,
  maxVelocity: true,
}).meta({ id: 'JointLimits' })
export type JointLimits = z.infer<typeof JointLimits>

/**
 * Scheduling metadata for a sensor response. Shared by every device so the
 * park-local show controller can arbitrate deterministically; per-device clip
 * data lives in each device payload, keyed by behavior id.
 */
export const BehaviorSchedule = z
  .object({
    id: Id,
    trigger: z.object({ sensorId: Id, event: SensorEvent }),
    window: z.object({ fromMs: z.number().int(), toMs: z.number().int() }).nullable(),
    blendMs: z.number().int().min(0),
    cooldownMs: z.number().int().min(0),
    durationMs: z.number().int().positive(),
    devices: z.array(Id).describe('Devices with clip data; two behaviors sharing a device never overlap'),
  })
  .meta({ id: 'BehaviorSchedule' })
export type BehaviorSchedule = z.infer<typeof BehaviorSchedule>

export const DollPayload = z
  .object({
    kind: z.literal('doll'),
    character: z.object({ ref: DocRef, joints: z.array(JointLimits) }),
    motion: MotionTracks,
    behaviorMotion: z.record(Id, MotionTracks).describe('behavior id -> clip motion'),
  })
  .meta({ id: 'DollPayload' })
export type DollPayload = z.infer<typeof DollPayload>

export const LightPayload = z
  .object({
    kind: z.literal('light'),
    dmx: z.object({ universe: z.number().int(), address: z.number().int() }),
    keys: z.array(LightKey),
    behaviorKeys: z.record(Id, z.array(LightKey)),
  })
  .meta({ id: 'LightPayload' })
export type LightPayload = z.infer<typeof LightPayload>

export const AudioPayload = z
  .object({
    kind: z.literal('audio'),
    maxVolumeDb: z.number().max(0),
    cues: z.array(AudioCue),
    behaviorCues: z.record(Id, z.array(AudioCue)),
    assets: z
      .record(Sha256, z.object({ path: z.string() }))
      .describe('Audio files to fetch and verify before reporting staged'),
  })
  .meta({ id: 'AudioPayload' })
export type AudioPayload = z.infer<typeof AudioPayload>

export const SensorPayload = z
  .object({ kind: z.literal('sensor'), type: SensorType, range: z.number().positive() })
  .meta({ id: 'SensorPayload' })
export type SensorPayload = z.infer<typeof SensorPayload>

export const DevicePayload = z
  .discriminatedUnion('kind', [DollPayload, LightPayload, AudioPayload, SensorPayload])
  .meta({ id: 'DevicePayload' })
export type DevicePayload = z.infer<typeof DevicePayload>

/**
 * Compiled, deterministic show artifact. Byte-identical for identical inputs
 * (no timestamps), content-addressed by SHA-256 of its canonical JSON, signed
 * on safety approval. Devices verify hash + signature before staging.
 */
export const ShowBundle = z
  .object({
    schemaVersion: z.literal(1),
    show: z.object({ id: Id, revision: Revision, name: z.string() }),
    environment: DocRef,
    durationMs: z.number().int().positive(),
    behaviors: z.array(BehaviorSchedule),
    devices: z.record(Id, DevicePayload),
  })
  .meta({ id: 'ShowBundle' })
export type ShowBundle = z.infer<typeof ShowBundle>
