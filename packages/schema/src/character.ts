import { z } from 'zod'
import { Sha256, Vec3 } from './common.ts'

export const JointType = z.enum(['revolute', 'prismatic']).meta({ id: 'JointType' })
export type JointType = z.infer<typeof JointType>

export const Joint = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Use snake_case, e.g. "neck_pitch"')
      .describe('Logical joint name referenced by show tracks'),
    node: z.string().min(1).describe('glTF node this joint rotates/translates'),
    type: JointType,
    axis: Vec3.describe('Unit axis in the node local frame'),
    min: z.number().describe('Lower limit: degrees (revolute) or meters (prismatic)'),
    max: z.number().describe('Upper limit: degrees (revolute) or meters (prismatic)'),
    home: z.number().describe('Safe rest position; shows start from and return to it'),
    maxVelocity: z.number().positive().describe('deg/s (revolute) or m/s (prismatic)'),
  })
  .meta({ id: 'Joint' })
export type Joint = z.infer<typeof Joint>

/**
 * Digital definition of a physical mechatronic figure. Published revisions are
 * immutable; changing a limit produces a new revision that shows must re-pin.
 */
export const CharacterDefinition = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    model: z.object({ assetId: Sha256 }).nullable().describe('GLB model asset; null renders placeholder geometry'),
    footprint: z
      .object({ size: Vec3 })
      .describe('Bounding box of the full range of motion, used for stage boundary checks'),
    joints: z.array(Joint).max(256),
  })
  .meta({ id: 'CharacterDefinition' })
export type CharacterDefinition = z.infer<typeof CharacterDefinition>
