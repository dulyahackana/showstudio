import { z } from 'zod'
import { DocRef, HexColor, Id, Sha256, TimeMs } from './common.ts'
import { SensorEvent } from './environment.ts'

export const Interp = z
  .enum(['linear', 'ease', 'step'])
  .meta({ id: 'Interp', description: 'Interpolation from this key to the next one' })
export type Interp = z.infer<typeof Interp>

export const MotionKey = z
  .object({ t: TimeMs, v: z.number().describe('Joint position (deg or m)'), interp: Interp })
  .meta({ id: 'MotionKey' })
export type MotionKey = z.infer<typeof MotionKey>

export const LightKey = z
  .object({ t: TimeMs, color: HexColor, intensity: z.number().min(0).max(1), interp: Interp })
  .meta({ id: 'LightKey' })
export type LightKey = z.infer<typeof LightKey>

export const AudioCue = z
  .object({
    id: Id,
    t: TimeMs,
    assetId: Sha256,
    volumeDb: z.number().max(0).describe('Playback level in dBFS'),
    label: z.string(),
  })
  .meta({ id: 'AudioCue' })
export type AudioCue = z.infer<typeof AudioCue>

export const MotionTracks = z
  .record(z.string(), z.array(MotionKey))
  .meta({ id: 'MotionTracks', description: 'joint name -> keys (sorted by t)' })
export type MotionTracks = z.infer<typeof MotionTracks>

export const Tracks = z
  .object({
    motion: z.record(Id, MotionTracks).describe('figure deviceId -> joint -> keys'),
    lights: z.record(Id, z.array(LightKey)).describe('fixture deviceId -> keys'),
    audio: z.record(Id, z.array(AudioCue)).describe('audio zone deviceId -> cues'),
  })
  .meta({ id: 'Tracks' })
export type Tracks = z.infer<typeof Tracks>

/**
 * A bounded sensor response: when `trigger` fires inside `window`, blend into a
 * short clip, play it, blend back to the main timeline. Bounded clips (not
 * scripts) keep every possible show path statically verifiable.
 */
export const Behavior = z
  .object({
    id: Id,
    name: z.string().min(1),
    enabled: z.boolean(),
    trigger: z.object({ sensorId: Id, event: SensorEvent }),
    window: z
      .object({ fromMs: TimeMs, toMs: TimeMs })
      .nullable()
      .describe('Show-time window in which the trigger is honoured; null = whole show'),
    blendMs: z.number().int().min(0).max(10_000).describe('Blend in/out duration'),
    cooldownMs: z.number().int().min(0).max(3_600_000),
    durationMs: z.number().int().positive().max(600_000).describe('Clip length'),
    tracks: Tracks,
  })
  .meta({ id: 'Behavior' })
export type Behavior = z.infer<typeof Behavior>

export const ShowDefinition = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    environment: DocRef.describe('Pinned environment revision'),
    durationMs: z.number().int().positive().max(3_600_000),
    tracks: Tracks,
    behaviors: z.array(Behavior).max(64),
  })
  .meta({ id: 'ShowDefinition' })
export type ShowDefinition = z.infer<typeof ShowDefinition>

export const emptyTracks = (): Tracks => ({ motion: {}, lights: {}, audio: {} })
