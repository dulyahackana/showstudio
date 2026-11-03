import { z } from 'zod'
import { CharacterDefinition } from './character.ts'
import { DocRef, Id, Revision, Role, Sha256, Timestamp } from './common.ts'
import { EnvironmentDefinition } from './environment.ts'
import { ActiveShow, DeviceKind, DeviceState, StagedShow } from './protocol.ts'
import { ShowDefinition } from './show.ts'

// ---- auth -------------------------------------------------------------------

export const User = z.object({ name: z.string(), roles: z.array(Role) }).meta({ id: 'User' })
export type User = z.infer<typeof User>

export const DevLoginRequest = z
  .object({ name: z.string().min(1).max(60), roles: z.array(Role).min(1) })
  .meta({ id: 'DevLoginRequest', description: 'Development stand-in for OIDC single sign-on' })

export const DevLoginResponse = z.object({ token: z.string(), user: User }).meta({ id: 'DevLoginResponse' })

// ---- assets -----------------------------------------------------------------

export const AssetKind = z.enum(['model', 'audio']).meta({ id: 'AssetKind' })
export type AssetKind = z.infer<typeof AssetKind>

export const Asset = z
  .object({
    id: Sha256.describe('Content address: SHA-256 of the file bytes'),
    name: z.string(),
    kind: AssetKind,
    mime: z.string(),
    size: z.number().int().nonnegative(),
    createdAt: Timestamp,
    createdBy: z.string(),
  })
  .meta({ id: 'Asset' })
export type Asset = z.infer<typeof Asset>
export const AssetList = z.array(Asset).meta({ id: 'AssetList' })

// ---- documents & revisions ----------------------------------------------------

export const DocKind = z.enum(['character', 'environment', 'show']).meta({ id: 'DocKind' })
export type DocKind = z.infer<typeof DocKind>

export const RevisionStatus = z
  .enum(['published', 'approved', 'rejected'])
  .meta({ id: 'RevisionStatus', description: 'Shows need safety approval before deployment' })
export type RevisionStatus = z.infer<typeof RevisionStatus>

const docBase = {
  id: Id,
  projectId: Id.nullable().describe('Shows: their project (same id), which grants access. Otherwise null'),
  locationId: Id.nullable().describe('Environments: the location they are installed at. Otherwise null'),
  name: z.string(),
  draftVersion: z.number().int().positive().describe('Optimistic-concurrency token for the draft'),
  createdAt: Timestamp,
  createdBy: z.string(),
  updatedAt: Timestamp,
  updatedBy: z.string(),
  latestRevision: Revision.nullable(),
  latestRevisionStatus: RevisionStatus.nullable().describe('Review state of latestRevision'),
  latestApprovedRevision: Revision.nullable(),
}

export const DocumentSummary = z.object({ kind: DocKind, ...docBase }).meta({ id: 'DocumentSummary' })
export type DocumentSummary = z.infer<typeof DocumentSummary>
export const DocumentList = z.array(DocumentSummary).meta({ id: 'DocumentList' })

export const CharacterDocument = z
  .object({ kind: z.literal('character'), ...docBase, draft: CharacterDefinition })
  .meta({ id: 'CharacterDocument' })
export const EnvironmentDocument = z
  .object({ kind: z.literal('environment'), ...docBase, draft: EnvironmentDefinition })
  .meta({ id: 'EnvironmentDocument' })
export const ShowDocument = z
  .object({ kind: z.literal('show'), ...docBase, draft: ShowDefinition })
  .meta({ id: 'ShowDocument' })

export const StudioDocument = z
  .discriminatedUnion('kind', [CharacterDocument, EnvironmentDocument, ShowDocument])
  .meta({ id: 'StudioDocument' })
export type StudioDocument = z.infer<typeof StudioDocument>
export type DocumentOf<K extends DocKind> = Extract<StudioDocument, { kind: K }>

export const CreateDocumentRequest = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('character'), id: Id, draft: CharacterDefinition }),
    z.object({ kind: z.literal('environment'), id: Id, locationId: Id, draft: EnvironmentDefinition }),
  ])
  .meta({
    id: 'CreateDocumentRequest',
    description: 'Characters go to the library, environments to a location. Shows are created with their project',
  })

export const SaveDraftRequest = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('character'), draftVersion: z.number().int(), draft: CharacterDefinition }),
    z.object({
      kind: z.literal('environment'),
      draftVersion: z.number().int(),
      draft: EnvironmentDefinition,
    }),
    z.object({ kind: z.literal('show'), draftVersion: z.number().int(), draft: ShowDefinition }),
  ])
  .meta({
    id: 'SaveDraftRequest',
    description: 'draftVersion must match the stored draft, otherwise 409 (someone else saved first)',
  })

export const RevisionSummary = z
  .object({
    docId: Id,
    kind: DocKind,
    revision: Revision,
    name: z.string(),
    sha256: Sha256.describe('Hash of the canonical revision content'),
    status: RevisionStatus,
    note: z.string(),
    publishedBy: z.string(),
    publishedAt: Timestamp,
    reviewedBy: z.string().nullable(),
    reviewedAt: Timestamp.nullable(),
    reviewNote: z.string().nullable(),
    bundleSha256: Sha256.nullable().describe('Compiled bundle (shows only)'),
    signed: z.boolean(),
  })
  .meta({ id: 'RevisionSummary' })
export type RevisionSummary = z.infer<typeof RevisionSummary>
export const RevisionList = z.array(RevisionSummary).meta({ id: 'RevisionList' })

export const RevisionDetail = z
  .discriminatedUnion('kind', [
    RevisionSummary.extend({ kind: z.literal('character'), content: CharacterDefinition }),
    RevisionSummary.extend({ kind: z.literal('environment'), content: EnvironmentDefinition }),
    RevisionSummary.extend({ kind: z.literal('show'), content: ShowDefinition }),
  ])
  .meta({ id: 'RevisionDetail' })
export type RevisionDetail = z.infer<typeof RevisionDetail>
export type RevisionOf<K extends DocKind> = Extract<RevisionDetail, { kind: K }>

export const PublishRequest = z
  .object({
    draftVersion: z.number().int().describe('Publish exactly the draft the author reviewed'),
    note: z.string().max(500),
  })
  .meta({ id: 'PublishRequest' })

export const ReviewRequest = z.object({ note: z.string().max(500) }).meta({ id: 'ReviewRequest' })

// ---- validation & errors -------------------------------------------------------

export const Issue = z
  .object({
    severity: z.enum(['error', 'warning']),
    code: z.string(),
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
    deviceId: z.string().optional(),
    joint: z.string().optional(),
    index: z.number().int().optional(),
    t: z.number().optional(),
    behaviorId: z.string().optional(),
  })
  .meta({ id: 'Issue' })
export type Issue = z.infer<typeof Issue>

export const ValidationReport = z
  .object({ ok: z.boolean(), errors: z.number().int(), warnings: z.number().int(), issues: z.array(Issue) })
  .meta({ id: 'ValidationReport' })
export type ValidationReport = z.infer<typeof ValidationReport>

/** RFC 9457 problem details. */
export const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    issues: z.array(Issue).optional(),
    reasons: z.array(z.string()).optional(),
  })
  .meta({ id: 'Problem' })
export type Problem = z.infer<typeof Problem>

// ---- fleet ------------------------------------------------------------------------

export const Device = z
  .object({
    id: Id,
    environmentId: Id,
    kind: DeviceKind,
    online: z.boolean(),
    state: DeviceState,
    firmware: z.string(),
    characterRef: DocRef.nullable(),
    staged: z.array(StagedShow),
    active: ActiveShow.nullable(),
    fault: z.string().nullable(),
    lastSeenAt: Timestamp.nullable(),
  })
  .meta({ id: 'Device' })
export type Device = z.infer<typeof Device>
export const DeviceList = z.array(Device).meta({ id: 'DeviceList' })

export const TargetStatus = z
  .enum(['pending', 'downloading', 'staged', 'rejected', 'offline'])
  .meta({ id: 'TargetStatus' })
export type TargetStatus = z.infer<typeof TargetStatus>

export const Deployment = z
  .object({
    id: z.string(),
    environmentId: Id,
    showId: Id,
    revision: Revision,
    name: z.string(),
    sha256: Sha256,
    createdBy: z.string(),
    createdAt: Timestamp,
    targets: z.array(z.object({ deviceId: Id, status: TargetStatus, reason: z.string().nullable() })),
    goodToGo: z.boolean().describe('Every target device reports the bundle staged and verified'),
  })
  .meta({ id: 'Deployment' })
export type Deployment = z.infer<typeof Deployment>
export const DeploymentList = z.array(Deployment).meta({ id: 'DeploymentList' })

export const CreateDeploymentRequest = z
  .object({ showId: Id, revision: Revision })
  .meta({ id: 'CreateDeploymentRequest' })

export const RunStatus = z.enum(['scheduled', 'running', 'completed', 'stopped']).meta({ id: 'RunStatus' })
export type RunStatus = z.infer<typeof RunStatus>

export const ShowRun = z
  .object({
    id: z.string(),
    environmentId: Id,
    showId: Id,
    revision: Revision,
    name: z.string(),
    sha256: Sha256,
    startAt: z.number().describe('Epoch ms'),
    durationMs: z.number().int(),
    launchedBy: z.string(),
    status: RunStatus,
    stoppedAt: Timestamp.nullable(),
    stopReason: z.string().nullable(),
  })
  .meta({ id: 'ShowRun' })
export type ShowRun = z.infer<typeof ShowRun>

export const LaunchRequest = z
  .object({
    showId: Id,
    revision: Revision,
    zoneClearConfirmed: z.literal(true).describe('Operator confirms the show zone is clear'),
  })
  .meta({ id: 'LaunchRequest' })

export const EnvironmentCommand = z
  .object({ environmentId: Id, reason: z.string().max(200).optional() })
  .meta({ id: 'EnvironmentCommand' })

export const SimulateSensorRequest = z
  .object({ environmentId: Id, event: z.enum(['enter', 'exit', 'press']) })
  .meta({ id: 'SimulateSensorRequest' })

export const PreparedShow = z
  .object({
    showId: Id,
    revision: Revision,
    sha256: Sha256,
    name: z.string(),
    durationMs: z.number().int(),
    goodToGo: z.boolean(),
    stagedOn: z.number().int(),
    targets: z.number().int(),
  })
  .meta({ id: 'PreparedShow' })
export type PreparedShow = z.infer<typeof PreparedShow>

export const EstopState = z
  .object({
    active: z.boolean(),
    at: Timestamp.nullable(),
    by: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .meta({ id: 'EstopState' })

export const EnvironmentStatus = z
  .object({
    environmentId: Id,
    environmentRevision: Revision.nullable(),
    expectedDevices: z.array(z.object({ deviceId: Id, kind: DeviceKind, name: z.string() })),
    devices: z.array(Device),
    run: ShowRun.nullable(),
    estop: EstopState,
    prepared: z.array(PreparedShow),
    serverTime: z.number(),
  })
  .meta({ id: 'EnvironmentStatus' })
export type EnvironmentStatus = z.infer<typeof EnvironmentStatus>

export const ProvisionedDevice = z
  .object({
    deviceId: Id,
    kind: DeviceKind,
    name: z.string(),
    characterRef: DocRef.nullable(),
    token: z.string(),
  })
  .meta({ id: 'ProvisionedDevice' })
export type ProvisionedDevice = z.infer<typeof ProvisionedDevice>

export const ProvisioningResponse = z
  .object({
    protocolVersion: z.number().int(),
    environment: DocRef,
    layout: EnvironmentDefinition.describe(
      'The attraction as installed (stage, figures, fixtures, speakers, sensors); digital twins build their scene from it',
    ),
    devices: z.array(ProvisionedDevice),
    characters: z.record(z.string(), CharacterDefinition).describe('"id@revision" -> definition'),
    signingPublicKeyPem: z.string().describe('Devices pin this key and reject unsigned bundles'),
  })
  .meta({ id: 'ProvisioningResponse' })
export type ProvisioningResponse = z.infer<typeof ProvisioningResponse>

export const SigningKey = z.object({ publicKeyPem: z.string() }).meta({ id: 'SigningKey' })

// ---- audit & ops ---------------------------------------------------------------------

export const AuditEntry = z
  .object({
    seq: z.number().int(),
    at: Timestamp,
    actor: z.string(),
    action: z.string(),
    entity: z.string(),
    entityId: z.string(),
    details: z.record(z.string(), z.unknown()),
    prevHash: z.string(),
    hash: z.string().describe('SHA-256 over prevHash + entry; tampering breaks the chain'),
  })
  .meta({ id: 'AuditEntry' })
export type AuditEntry = z.infer<typeof AuditEntry>
export const AuditList = z.array(AuditEntry).meta({ id: 'AuditList' })

export const AuditVerification = z
  .object({ ok: z.boolean(), count: z.number().int(), brokenAtSeq: z.number().int().nullable() })
  .meta({ id: 'AuditVerification' })

export const Health = z
  .object({ status: z.literal('ok'), version: z.string(), uptimeS: z.number() })
  .meta({ id: 'Health' })

export const Ack = z.object({ ok: z.literal(true) }).meta({ id: 'Ack' })
