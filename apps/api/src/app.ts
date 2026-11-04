import { join, resolve } from 'node:path'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { API_PREFIX, type Asset, type AssetKind, type ProjectPermission, ShowBundle } from '@studio/schema'
import { buildAsyncApi, buildOpenApi } from '@studio/schema/openapi'
import Fastify, { type FastifyInstance } from 'fastify'
import { AuditLog } from './audit.ts'
import { type BlobStore, FsBlobStore } from './blobs.ts'
import type { Config } from './config.ts'
import { type Db, iso, migrate, openDb } from './db/index.ts'
import { actor, type RequestContext, registerRoute } from './http.ts'
import { Metrics } from './metrics.ts'
import { HttpProblem, problems } from './problems.ts'
import { issueSession, loadSigner, type Signer } from './security.ts'
import { FleetService } from './services/fleet.ts'
import { buildPackage, packageFileName } from './services/packages.ts'
import { LocationService, ProjectService, WORKSPACE } from './services/projects.ts'
import { StudioService } from './services/studio.ts'

export const VERSION = '0.1.0'

export interface App {
  app: FastifyInstance
  db: Db
  fleet: FleetService
  studio: StudioService
  signer: Signer
  close(): Promise<void>
}

/** Identify uploads by their bytes, never by the client-supplied name or MIME type. */
function sniff(bytes: Buffer): { kind: AssetKind; mime: string } | null {
  const ascii = (from: number, to: number) => bytes.toString('ascii', from, to)
  if (ascii(0, 4) === 'glTF') return { kind: 'model', mime: 'model/gltf-binary' }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { kind: 'audio', mime: 'audio/wav' }
  if (ascii(0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' }
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0))
    return { kind: 'audio', mime: 'audio/mpeg' }
  return null
}

export async function buildApp(
  config: Config,
  opts: { memoryDb?: boolean; ephemeralKeys?: boolean } = {},
): Promise<App> {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
    bodyLimit: 5 * 1024 * 1024,
  })
  const dataDir = resolve(config.DATA_DIR)
  const db = await openDb({ url: config.DATABASE_URL, dataDir, memory: opts.memoryDb })
  await migrate(db)
  const blobs: BlobStore = new FsBlobStore(join(dataDir, 'blobs'))
  const signer = loadSigner({ pem: config.SIGNING_KEY_PEM, dataDir, ephemeral: opts.ephemeralKeys })
  const audit = new AuditLog(db)
  const studio = new StudioService(db, audit, signer)
  const projects = new ProjectService(db, audit, studio)
  const locations = new LocationService(db, audit)

  const metrics = new Metrics()
  const httpRequests = metrics.counter('studio_http_requests_total', 'HTTP requests by route and status')
  const deploysTotal = metrics.counter('studio_deployments_total', 'Show deployments')
  const launchesTotal = metrics.counter('studio_launches_total', 'Show launches')
  const estopsTotal = metrics.counter('studio_estops_total', 'E-stops triggered')
  const fleet = new FleetService(db, studio, audit, signer, config, app.log, {
    onDeploy: () => deploysTotal(),
    onLaunch: () => launchesTotal(),
    onEstop: () => estopsTotal(),
  })
  await fleet.init()
  metrics.gauge('studio_devices_online', 'Connected devices', () => [{ labels: {}, value: fleet.onlineCount() }])

  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } })
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } })

  app.addHook('onResponse', async (req, reply) => {
    httpRequests({ route: req.routeOptions.url ?? 'unmatched', status: String(reply.statusCode) })
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpProblem) {
      return reply.status(err.status).type('application/problem+json').send(err.toJSON())
    }
    const e = err as { statusCode?: number; code?: string; message: string }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE')
      return reply
        .status(413)
        .type('application/problem+json')
        .send({
          type: 'payload-too-large',
          title: 'Payload too large',
          status: 413,
          detail: `Uploads are limited to ${config.MAX_UPLOAD_MB} MB`,
        })
    if (e.statusCode && e.statusCode < 500) {
      return reply
        .status(e.statusCode)
        .type('application/problem+json')
        .send({ type: 'bad-request', title: 'Bad request', status: e.statusCode, detail: e.message })
    }
    req.log.error({ err }, 'unhandled error')
    return reply
      .status(500)
      .type('application/problem+json')
      .send({ type: 'internal', title: 'Internal server error', status: 500 })
  })

  // ---- ops ---------------------------------------------------------------------------------
  registerRoute(app, config, 'health', async () => {
    await db.query('select 1')
    return { status: 'ok' as const, version: VERSION, uptimeS: Math.round(process.uptime()) }
  })
  app.get('/metrics', async (_req, reply) => reply.type('text/plain; version=0.0.4').send(metrics.render()))
  app.get(`${API_PREFIX}/openapi.json`, async () => buildOpenApi(VERSION))
  app.get(`${API_PREFIX}/asyncapi.json`, async () => buildAsyncApi(VERSION))

  // ---- auth ----------------------------------------------------------------------------------
  registerRoute(app, config, 'devLogin', async ({ body }) => {
    if (config.DEV_LOGIN !== 'on') throw problems.forbidden('Development login is disabled; use single sign-on')
    return { token: issueSession(config.AUTH_SECRET, body), user: body }
  })
  registerRoute(app, config, 'me', async (_input, ctx) => actor(ctx))

  // ---- assets ----------------------------------------------------------------------------------
  const toAsset = (r: Record<string, unknown>): Asset => ({
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as AssetKind,
    mime: String(r.mime),
    size: Number(r.size),
    createdAt: iso(r.created_at),
    createdBy: String(r.created_by),
  })
  registerRoute(app, config, 'listAssets', async () =>
    (await db.query('select * from assets order by created_at desc')).map(toAsset),
  )
  registerRoute(app, config, 'uploadAsset', async (_input, ctx) => {
    const file = await ctx.req.file()
    if (!file) throw problems.badRequest('Expected a multipart field "file"')
    const bytes = await file.toBuffer()
    const type = sniff(bytes)
    if (!type) throw problems.unsupported('Only GLB models and WAV/OGG/MP3 audio are accepted')
    const id = blobs.put(bytes)
    const user = actor(ctx)
    await db.query(
      `insert into assets (id, name, kind, mime, size, created_by) values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing`,
      [id, file.filename.slice(0, 200), type.kind, type.mime, bytes.length, user.name],
    )
    await audit.append(user.name, 'asset.upload', type.kind, id, { name: file.filename, size: bytes.length })
    const [row] = await db.query('select * from assets where id = $1', [id])
    return toAsset(row as Record<string, unknown>)
  })
  registerRoute(app, config, 'getAsset', async ({ params }, { reply }) => {
    const [row] = await db.query<{ mime: string }>('select mime from assets where id = $1', [params.id])
    const bytes = blobs.get(params.id)
    if (!row || !bytes) throw problems.notFound('Asset not found')
    return reply
      .header('cache-control', 'private, max-age=31536000, immutable')
      .header('etag', `"${params.id}"`)
      .type(row.mime)
      .send(bytes)
  })

  // ---- workspace: locations (shared) and projects (one show each, per-project access) -------------
  registerRoute(app, config, 'getWorkspace', async () => WORKSPACE)
  registerRoute(app, config, 'listLocations', async () => locations.list())
  registerRoute(app, config, 'createLocation', async ({ body }, ctx) => locations.create(body, actor(ctx)))
  registerRoute(app, config, 'listProjects', async ({ query }, ctx) => projects.list(actor(ctx), query.status))
  registerRoute(app, config, 'createProject', async ({ body }, ctx) => projects.create(body, actor(ctx)))
  registerRoute(app, config, 'getProject', async ({ params }, ctx) => projects.get(params.projectId, actor(ctx)))
  registerRoute(app, config, 'deleteProject', async ({ params }, ctx) => {
    await projects.require(actor(ctx), params.projectId, 'manage')
    await fleet.assertNotLive(params.projectId)
    const project = await projects.delete(params.projectId, actor(ctx))
    await fleet.undeployShow(params.projectId)
    return project
  })
  registerRoute(app, config, 'restoreProject', async ({ params }, ctx) =>
    projects.restore(params.projectId, actor(ctx)),
  )
  registerRoute(app, config, 'setProjectMember', async ({ params, body }, ctx) =>
    projects.setMember(params.projectId, params.user, body.role, actor(ctx)),
  )
  registerRoute(app, config, 'removeProjectMember', async ({ params }, ctx) =>
    projects.removeMember(params.projectId, params.user, actor(ctx)),
  )

  // ---- documents & revisions --------------------------------------------------------------------
  const canDoc = (ctx: RequestContext, id: string, permission: ProjectPermission) =>
    projects.requireForDocument(actor(ctx), id, permission)
  registerRoute(app, config, 'listDocuments', async ({ query }, ctx) =>
    studio.listDocuments({ ...query, visible: await projects.visibleProjectIds(actor(ctx)) }),
  )
  registerRoute(app, config, 'createDocument', async ({ body }, ctx) => {
    if (body.kind === 'environment') {
      await locations.require(body.locationId)
      return studio.createDocument(body.kind, body.id, { locationId: body.locationId }, body.draft, actor(ctx))
    }
    return studio.createDocument(body.kind, body.id, {}, body.draft, actor(ctx))
  })
  registerRoute(app, config, 'getDocument', async ({ params }, ctx) => {
    await canDoc(ctx, params.id, 'read')
    return studio.getDocument(params.id)
  })
  registerRoute(app, config, 'saveDraft', async ({ params, body }, ctx) => {
    await canDoc(ctx, params.id, 'edit')
    return studio.saveDraft(params.id, body.kind, body.draftVersion, body.draft, actor(ctx))
  })
  registerRoute(app, config, 'validateDraft', async ({ params }, ctx) => {
    await canDoc(ctx, params.id, 'read')
    return studio.validateDraft(params.id)
  })
  registerRoute(app, config, 'publish', async ({ params, body }, ctx) => {
    await canDoc(ctx, params.id, 'edit')
    return studio.publish(params.id, body.draftVersion, body.note, actor(ctx))
  })
  registerRoute(app, config, 'listRevisions', async ({ params }, ctx) => {
    await canDoc(ctx, params.id, 'read')
    return studio.listRevisions(params.id)
  })
  registerRoute(app, config, 'getRevision', async ({ params }, ctx) => {
    await canDoc(ctx, params.id, 'read')
    return studio.getRevision(params.id, params.revision)
  })
  registerRoute(app, config, 'restoreRevision', async ({ params, body }, ctx) => {
    await canDoc(ctx, params.id, 'edit')
    return studio.restoreRevision(params.id, params.revision, body.draftVersion, actor(ctx))
  })
  // The installable artifact goes to the people who may deploy it.
  registerRoute(app, config, 'downloadPackage', async ({ params }, ctx) => {
    await canDoc(ctx, params.id, 'operate')
    const revision = await studio.getRevision(params.id, params.revision)
    if (revision.kind !== 'show' || !revision.bundleSha256)
      throw problems.badRequest(`${params.id}@${params.revision} is not a show revision`)
    if (revision.status !== 'approved' || !revision.signed)
      throw problems.precondition('Only safety-approved, signed revisions can be packaged', [
        `${params.id}@${params.revision} is ${revision.status}`,
      ])
    const bundle = await fleet.bundleBody(revision.bundleSha256)
    const ids = Object.values(ShowBundle.parse(JSON.parse(bundle.body)).devices).flatMap((p) =>
      p.kind === 'audio' ? Object.keys(p.assets) : [],
    )
    const assets = []
    for (const id of new Set(ids)) {
      const [row] = await db.query<{ mime: string }>('select mime from assets where id = $1', [id])
      const bytes = blobs.get(id)
      if (!row || !bytes) throw problems.notFound(`Asset ${id} not found`)
      assets.push({ id, mime: row.mime, bytes })
    }
    const body = buildPackage({
      revision,
      bundle: { body: bundle.body, signature: bundle.signature ?? '' },
      assets,
      publicKeyPem: signer.publicKeyPem,
    })
    const user = actor(ctx)
    await audit.append(user.name, 'show.package', 'show', `${params.id}@${params.revision}`, {
      sha256: revision.bundleSha256,
    })
    return ctx.reply
      .header('content-disposition', `attachment; filename="${packageFileName(params.id, params.revision)}"`)
      .type('application/zip')
      .send(body)
  })
  registerRoute(app, config, 'approveRevision', async ({ params, body }, ctx) => {
    await canDoc(ctx, params.id, 'review')
    return studio.review(params.id, params.revision, 'approve', body.note, actor(ctx))
  })
  registerRoute(app, config, 'rejectRevision', async ({ params, body }, ctx) => {
    await canDoc(ctx, params.id, 'review')
    return studio.review(params.id, params.revision, 'reject', body.note, actor(ctx))
  })

  // ---- fleet ----------------------------------------------------------------------------------------
  registerRoute(app, config, 'getBundle', async ({ params }, { reply }) => {
    const { body, signature } = await fleet.bundleBody(params.sha256)
    if (signature) reply.header('x-signature', signature)
    return reply.header('cache-control', 'private, max-age=31536000, immutable').type('application/json').send(body)
  })
  registerRoute(app, config, 'provision', async ({ params }) => fleet.provision(params.environmentId))
  registerRoute(app, config, 'signingKey', async () => ({ publicKeyPem: signer.publicKeyPem }))
  // Locations and their live state are visible to the whole workspace.
  registerRoute(app, config, 'listDevices', async ({ query }) => fleet.listDevices(query.environmentId))
  registerRoute(app, config, 'environmentStatus', async ({ params }, ctx) => {
    await canDoc(ctx, params.environmentId, 'read')
    return fleet.environmentStatus(params.environmentId)
  })
  registerRoute(app, config, 'listDeployments', async ({ query }) => fleet.listDeployments(query.environmentId))
  registerRoute(app, config, 'createDeployment', async ({ body }, ctx) => {
    await canDoc(ctx, body.showId, 'operate')
    return fleet.deploy(body.showId, body.revision, actor(ctx))
  })
  registerRoute(app, config, 'launch', async ({ body }, ctx) => {
    await canDoc(ctx, body.showId, 'operate')
    return fleet.launch(body.showId, body.revision, actor(ctx))
  })
  registerRoute(app, config, 'stop', async ({ body }, ctx) => {
    await canDoc(ctx, body.environmentId, 'operate')
    await fleet.stop(body.environmentId, actor(ctx))
    return { ok: true as const }
  })
  registerRoute(app, config, 'estop', async ({ body }, ctx) => {
    await fleet.estop(body.environmentId, body.reason ?? 'operator e-stop', actor(ctx))
    return { ok: true as const }
  })
  registerRoute(app, config, 'resetEstop', async ({ body }, ctx) => {
    await canDoc(ctx, body.environmentId, 'operate')
    await fleet.resetEstop(body.environmentId, actor(ctx))
    return { ok: true as const }
  })
  registerRoute(app, config, 'simulateSensor', async ({ params, body }, ctx) => {
    await canDoc(ctx, body.environmentId, 'read')
    fleet.simulateSensor(body.environmentId, params.deviceId, body.event)
    return { ok: true as const }
  })
  registerRoute(app, config, 'simulateConsole', async ({ params, body }, ctx) => {
    await canDoc(ctx, body.environmentId, 'operate')
    fleet.simulateConsole(body.environmentId, params.deviceId, body.button)
    return { ok: true as const }
  })
  app.get(`${API_PREFIX}/devices/ws`, { websocket: true }, (socket) => fleet.handleSocket(socket))

  // ---- audit -----------------------------------------------------------------------------------------
  registerRoute(app, config, 'listAudit', async ({ query }) => audit.list(query.limit))
  registerRoute(app, config, 'verifyAudit', async () => audit.verify())

  // ---- editor (single-page app) -------------------------------------------------------------------------
  if (config.EDITOR_DIST) await app.register(fastifyStatic, { root: resolve(config.EDITOR_DIST), wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (config.EDITOR_DIST && !req.url.startsWith('/api/')) return reply.sendFile('index.html')
    return reply.status(404).type('application/problem+json').send(problems.notFound('No such endpoint').toJSON())
  })

  return {
    app,
    db,
    fleet,
    studio,
    signer,
    close: async () => {
      fleet.close()
      await app.close()
      await db.close()
    },
  }
}
