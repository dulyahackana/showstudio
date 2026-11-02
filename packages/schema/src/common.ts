import { z } from 'zod'

/** Version of the document/bundle formats. Bump on breaking changes; consumers reject unknown versions. */
export const SCHEMA_VERSION = 1 as const
/** Version of the fleet <-> device WebSocket protocol, negotiated in `hello`. */
export const PROTOCOL_VERSION = 1 as const

export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Use lowercase letters, digits, "-" or "_" (max 64 chars)')
  .meta({ id: 'Id', description: 'Stable, human-readable identifier' })
export type Id = z.infer<typeof Id>

export const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Expected a lowercase SHA-256 hex digest')
  .meta({ id: 'Sha256', description: 'SHA-256 hex digest, used as a content address' })
export type Sha256 = z.infer<typeof Sha256>

export const Vec3 = z
  .tuple([z.number(), z.number(), z.number()])
  .meta({ id: 'Vec3', description: '[x, y, z] in meters. Y-up, right-handed (glTF convention)' })
export type Vec3 = z.infer<typeof Vec3>

export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color')
  .meta({ id: 'HexColor' })
export type HexColor = z.infer<typeof HexColor>

export const TimeMs = z
  .number()
  .int()
  .nonnegative()
  .meta({ id: 'TimeMs', description: 'Milliseconds from the start of the show (or clip)' })

export const Revision = z.number().int().positive()

export const DocRef = z
  .object({ id: Id, revision: Revision })
  .meta({ id: 'DocRef', description: 'Pin to an immutable, published document revision' })
export type DocRef = z.infer<typeof DocRef>

export const Box = z.object({ min: Vec3, max: Vec3 }).meta({ id: 'Box', description: 'Axis-aligned box in meters' })
export type Box = z.infer<typeof Box>

export const Role = z
  .enum(['engineer', 'safety', 'operator', 'admin'])
  .meta({ id: 'Role', description: 'engineer: author; safety: approve; operator: run shows' })
export type Role = z.infer<typeof Role>

export const Timestamp = z.iso.datetime({ offset: true }).meta({ id: 'Timestamp' })

export const refKey = (ref: DocRef): string => `${ref.id}@${ref.revision}`
