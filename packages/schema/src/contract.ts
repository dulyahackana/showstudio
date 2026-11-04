import { z } from 'zod'
import {
  Ack,
  Asset,
  AssetList,
  AuditList,
  AuditVerification,
  CreateDeploymentRequest,
  CreateDocumentRequest,
  Deployment,
  DeploymentList,
  DeviceList,
  DevLoginRequest,
  DevLoginResponse,
  DocKind,
  DocumentList,
  DocumentSummary,
  EnvironmentCommand,
  EnvironmentStatus,
  Health,
  LaunchRequest,
  ProvisioningResponse,
  PublishRequest,
  RestoreRequest,
  ReviewRequest,
  RevisionDetail,
  RevisionList,
  RevisionSummary,
  SaveDraftRequest,
  ShowRun,
  SigningKey,
  SimulateConsoleRequest,
  SimulateSensorRequest,
  StudioDocument,
  User,
  ValidationReport,
} from './api.ts'
import { Id, type Role, Sha256 } from './common.ts'
import {
  CreateLocationRequest,
  CreateProjectRequest,
  Location,
  LocationList,
  MemberParams,
  Project,
  ProjectList,
  ProjectListQuery,
  ProjectParams,
  SetMemberRequest,
  Workspace,
} from './project.ts'

/**
 * The REST contract. Server routes, the typed editor client and the generated
 * OpenAPI document are all derived from this table, so they cannot drift.
 */
export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Path below API_PREFIX, `:param` placeholders. */
  path: string
  summary: string
  tag: 'auth' | 'workspace' | 'assets' | 'documents' | 'fleet' | 'devices' | 'audit' | 'ops'
  /** user: bearer token; device: device credential; provisioning: site token. */
  auth: 'public' | 'user' | 'user-or-device' | 'provisioning'
  /** Any listed role grants access (admin always does). Omitted = any authenticated user. */
  roles?: readonly Role[]
  params?: z.ZodObject
  query?: z.ZodObject
  body?: z.ZodType | 'multipart'
  response: z.ZodType | 'binary'
  status?: 200 | 201 | 202
}

export const API_PREFIX = '/api/v1'

const IdParams = z.object({ id: Id })
const RevisionParams = z.object({ id: Id, revision: z.coerce.number().int().positive() })
const EnvParams = z.object({ environmentId: Id })

export const contract = {
  health: {
    method: 'GET',
    path: '/health',
    summary: 'Liveness probe',
    tag: 'ops',
    auth: 'public',
    response: Health,
  },
  devLogin: {
    method: 'POST',
    path: '/auth/dev-login',
    summary: 'Issue a session token for a named persona (development only)',
    tag: 'auth',
    auth: 'public',
    body: DevLoginRequest,
    response: DevLoginResponse,
  },
  me: { method: 'GET', path: '/me', summary: 'Current user', tag: 'auth', auth: 'user', response: User },

  listAssets: {
    method: 'GET',
    path: '/assets',
    summary: 'List uploaded models and audio',
    tag: 'assets',
    auth: 'user',
    response: AssetList,
  },
  uploadAsset: {
    method: 'POST',
    path: '/assets',
    summary: 'Upload a GLB model or audio file (multipart field "file")',
    tag: 'assets',
    auth: 'user',
    roles: ['engineer'],
    body: 'multipart',
    response: Asset,
    status: 201,
  },
  getAsset: {
    method: 'GET',
    path: '/assets/:id',
    summary: 'Download an asset by content hash (immutable, cacheable)',
    tag: 'assets',
    auth: 'user-or-device',
    params: z.object({ id: Sha256 }),
    response: 'binary',
  },

  getWorkspace: {
    method: 'GET',
    path: '/workspace',
    summary: 'The workspace (tenant) and its people directory',
    tag: 'workspace',
    auth: 'user',
    response: Workspace,
  },
  listLocations: {
    method: 'GET',
    path: '/locations',
    summary: 'Every location (park, studio, lab); their environments are documents with that locationId',
    tag: 'workspace',
    auth: 'user',
    response: LocationList,
  },
  createLocation: {
    method: 'POST',
    path: '/locations',
    summary: 'Register a location (admins)',
    tag: 'workspace',
    auth: 'user',
    roles: ['admin'],
    body: CreateLocationRequest,
    response: Location,
    status: 201,
  },
  listProjects: {
    method: 'GET',
    path: '/projects',
    summary: 'Projects (one show each) you are a member of (admins see all), with members and your role',
    tag: 'workspace',
    auth: 'user',
    query: ProjectListQuery,
    response: ProjectList,
  },
  deleteProject: {
    method: 'DELETE',
    path: '/projects/:projectId',
    summary:
      'Delete a project (owners and admins): hidden from every list, read-only, its show taken off the controllers. Nothing is erased; it can be recovered',
    tag: 'workspace',
    auth: 'user',
    params: ProjectParams,
    response: Project,
  },
  restoreProject: {
    method: 'POST',
    path: '/projects/:projectId/restore',
    summary: 'Recover a deleted project (owners and admins). Its show must be deployed again before it can run',
    tag: 'workspace',
    auth: 'user',
    params: ProjectParams,
    response: Project,
  },
  createProject: {
    method: 'POST',
    path: '/projects',
    summary: 'Create a project and its show in one step; the creator becomes its owner',
    tag: 'workspace',
    auth: 'user',
    roles: ['engineer'],
    body: CreateProjectRequest,
    response: Project,
    status: 201,
  },
  getProject: {
    method: 'GET',
    path: '/projects/:projectId',
    summary: 'One project with its access list',
    tag: 'workspace',
    auth: 'user',
    params: ProjectParams,
    response: Project,
  },
  setProjectMember: {
    method: 'PUT',
    path: '/projects/:projectId/members/:user',
    summary: 'Grant or change a member role (project owners and admins)',
    tag: 'workspace',
    auth: 'user',
    params: MemberParams,
    body: SetMemberRequest,
    response: Project,
  },
  removeProjectMember: {
    method: 'DELETE',
    path: '/projects/:projectId/members/:user',
    summary: 'Revoke access (project owners and admins; a project keeps at least one owner)',
    tag: 'workspace',
    auth: 'user',
    params: MemberParams,
    response: Project,
  },
  listDocuments: {
    method: 'GET',
    path: '/docs',
    summary: 'List characters (library), environments (locations) and the shows of your projects',
    tag: 'documents',
    auth: 'user',
    query: z.object({ kind: DocKind.optional(), locationId: Id.optional() }),
    response: DocumentList,
  },
  createDocument: {
    method: 'POST',
    path: '/docs',
    summary: 'Create a document with an initial draft',
    tag: 'documents',
    auth: 'user',
    roles: ['engineer'],
    body: CreateDocumentRequest,
    response: StudioDocument,
    status: 201,
  },
  getDocument: {
    method: 'GET',
    path: '/docs/:id',
    summary: 'Get a document and its current draft',
    tag: 'documents',
    auth: 'user',
    params: IdParams,
    response: StudioDocument,
  },
  saveDraft: {
    method: 'PUT',
    path: '/docs/:id/draft',
    summary: 'Save the draft (optimistic concurrency via draftVersion)',
    tag: 'documents',
    auth: 'user',
    roles: ['engineer'],
    params: IdParams,
    body: SaveDraftRequest,
    response: DocumentSummary,
  },
  validateDraft: {
    method: 'POST',
    path: '/docs/:id/validate',
    summary: 'Run the server-side validator on the stored draft',
    tag: 'documents',
    auth: 'user',
    params: IdParams,
    response: ValidationReport,
  },
  publish: {
    method: 'POST',
    path: '/docs/:id/publish',
    summary: 'Validate and freeze the draft as a new immutable revision',
    tag: 'documents',
    auth: 'user',
    roles: ['engineer'],
    params: IdParams,
    body: PublishRequest,
    response: RevisionSummary,
    status: 201,
  },
  listRevisions: {
    method: 'GET',
    path: '/docs/:id/revisions',
    summary: 'Revision history',
    tag: 'documents',
    auth: 'user',
    params: IdParams,
    response: RevisionList,
  },
  getRevision: {
    method: 'GET',
    path: '/docs/:id/revisions/:revision',
    summary: 'Get an immutable revision',
    tag: 'documents',
    auth: 'user',
    params: RevisionParams,
    response: RevisionDetail,
  },
  restoreRevision: {
    method: 'POST',
    path: '/docs/:id/revisions/:revision/restore',
    summary:
      'Make an earlier revision the draft again; publishing it creates a new revision, which goes through review like any other',
    tag: 'documents',
    auth: 'user',
    roles: ['engineer'],
    params: RevisionParams,
    body: RestoreRequest,
    response: DocumentSummary,
  },
  downloadPackage: {
    method: 'GET',
    path: '/docs/:id/revisions/:revision/package',
    summary:
      'Offline install package of a safety-approved show revision: zip with manifest.json, the signed bundle, its signature, the audio files and a README',
    tag: 'documents',
    auth: 'user',
    roles: ['engineer', 'operator'],
    params: RevisionParams,
    response: 'binary',
  },
  approveRevision: {
    method: 'POST',
    path: '/docs/:id/revisions/:revision/approve',
    summary: 'Safety approval: signs the compiled bundle (author cannot approve own work)',
    tag: 'documents',
    auth: 'user',
    roles: ['safety'],
    params: RevisionParams,
    body: ReviewRequest,
    response: RevisionSummary,
  },
  rejectRevision: {
    method: 'POST',
    path: '/docs/:id/revisions/:revision/reject',
    summary: 'Safety rejection',
    tag: 'documents',
    auth: 'user',
    roles: ['safety'],
    params: RevisionParams,
    body: ReviewRequest,
    response: RevisionSummary,
  },

  getBundle: {
    method: 'GET',
    path: '/bundles/:sha256',
    summary: 'Download the exact signed bundle bytes',
    tag: 'devices',
    auth: 'user-or-device',
    params: z.object({ sha256: Sha256 }),
    response: 'binary',
  },
  provision: {
    method: 'GET',
    path: '/fleet/provisioning/:environmentId',
    summary: 'Device credentials and pinned definitions for an attraction',
    tag: 'devices',
    auth: 'provisioning',
    params: EnvParams,
    response: ProvisioningResponse,
  },
  signingKey: {
    method: 'GET',
    path: '/fleet/signing-key',
    summary: 'Public key used to verify bundle signatures',
    tag: 'devices',
    auth: 'public',
    response: SigningKey,
  },

  listDevices: {
    method: 'GET',
    path: '/fleet/devices',
    summary: 'Registered devices with reported state',
    tag: 'fleet',
    auth: 'user',
    query: z.object({ environmentId: Id.optional() }),
    response: DeviceList,
  },
  environmentStatus: {
    method: 'GET',
    path: '/fleet/environments/:environmentId/status',
    summary: 'Operator view: devices, prepared shows, current run, e-stop',
    tag: 'fleet',
    auth: 'user',
    params: EnvParams,
    response: EnvironmentStatus,
  },
  listDeployments: {
    method: 'GET',
    path: '/fleet/deployments',
    summary: 'Deployments with live per-device status',
    tag: 'fleet',
    auth: 'user',
    query: z.object({ environmentId: Id.optional() }),
    response: DeploymentList,
  },
  createDeployment: {
    method: 'POST',
    path: '/fleet/deployments',
    summary: 'Stage an approved show on every device of its attraction (all-or-nothing pre-check)',
    tag: 'fleet',
    auth: 'user',
    roles: ['engineer', 'operator'],
    body: CreateDeploymentRequest,
    response: Deployment,
    status: 202,
  },
  launch: {
    method: 'POST',
    path: '/fleet/launch',
    summary: 'Launch a staged show at a synchronized start time',
    tag: 'fleet',
    auth: 'user',
    roles: ['operator'],
    body: LaunchRequest,
    response: ShowRun,
    status: 202,
  },
  stop: {
    method: 'POST',
    path: '/fleet/stop',
    summary: 'Stop the running show; figures return home',
    tag: 'fleet',
    auth: 'user',
    roles: ['operator'],
    body: EnvironmentCommand,
    response: Ack,
  },
  estop: {
    method: 'POST',
    path: '/fleet/estop',
    summary: 'Software e-stop (latched). Any signed-in user may trigger it',
    tag: 'fleet',
    auth: 'user',
    body: EnvironmentCommand,
    response: Ack,
  },
  resetEstop: {
    method: 'POST',
    path: '/fleet/reset',
    summary: 'Clear the e-stop latch',
    tag: 'fleet',
    auth: 'user',
    roles: ['operator'],
    body: EnvironmentCommand,
    response: Ack,
  },
  simulateSensor: {
    method: 'POST',
    path: '/fleet/sensors/:deviceId/simulate',
    summary: 'Development: make a simulated sensor fire',
    tag: 'fleet',
    auth: 'user',
    roles: ['operator', 'engineer'],
    params: z.object({ deviceId: Id }),
    body: SimulateSensorRequest,
    response: Ack,
  },
  simulateConsole: {
    method: 'POST',
    path: '/fleet/consoles/:deviceId/simulate',
    summary: 'Development: press a button on a simulated operator console',
    tag: 'fleet',
    auth: 'user',
    roles: ['operator'],
    params: z.object({ deviceId: Id }),
    body: SimulateConsoleRequest,
    response: Ack,
  },

  listAudit: {
    method: 'GET',
    path: '/audit',
    summary: 'Append-only audit log (newest first)',
    tag: 'audit',
    auth: 'user',
    query: z.object({ limit: z.coerce.number().int().min(1).max(1000).optional() }),
    response: AuditList,
  },
  verifyAudit: {
    method: 'GET',
    path: '/audit/verify',
    summary: 'Verify the audit hash chain',
    tag: 'audit',
    auth: 'user',
    response: AuditVerification,
  },
} as const satisfies Record<string, RouteDef>

export type Contract = typeof contract
export type RouteKey = keyof Contract

type In<S> = S extends z.ZodType ? z.input<S> : never
type Out<S> = S extends z.ZodType ? z.output<S> : S extends 'binary' ? Blob : never

export type RouteInput<K extends RouteKey> = (Contract[K] extends { params: infer P }
  ? { params: In<P> }
  : { params?: never }) &
  (Contract[K] extends { query: infer Q } ? { query?: In<Q> } : { query?: never }) &
  (Contract[K] extends { body: infer B }
    ? B extends 'multipart'
      ? { body: FormData }
      : { body: In<B> }
    : { body?: never })

export type RouteOutput<K extends RouteKey> = Out<Contract[K]['response']>

/** Fill `:param` placeholders. */
export function buildPath(path: string, params: Record<string, unknown> = {}): string {
  return path.replace(/:([A-Za-z0-9]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`)
    return encodeURIComponent(String(value))
  })
}
