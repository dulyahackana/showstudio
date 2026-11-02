import { randomUUID } from 'node:crypto'
import {
  API_PREFIX,
  type Deployment,
  type Device,
  DeviceToFleet,
  type EnvironmentDefinition,
  type EnvironmentStatus,
  environmentDevices,
  type FleetToDevice,
  type HelloMsg,
  PROTOCOL_VERSION,
  type PreparedShow,
  type ProvisioningResponse,
  type RunStatus,
  refKey,
  type SensorEvent,
  ShowBundle,
  type ShowRun,
  type StagedShow,
  type StatusMsg,
  type TargetStatus,
  type User,
} from '@studio/schema'
import type { FastifyBaseLogger } from 'fastify'
import type { WebSocket } from 'ws'
import type { AuditLog } from '../audit.ts'
import type { Config } from '../config.ts'
import { type Db, iso, isoOrNull } from '../db/index.ts'
import { problems } from '../problems.ts'
import { deviceToken, type Signer, verifyDeviceToken } from '../security.ts'
import type { StudioService } from './studio.ts'

const HEARTBEAT_MS = 1000
const OFFLINE_AFTER_MS = 5000
const MAX_STAGED_PER_DEVICE = 5
const RESEND_AFTER_MS = 10_000

interface Connection {
  socket: WebSocket
  hello: HelloMsg
  status: StatusMsg | null
  lastSeen: number
  sent: Map<string, number>
}

interface BundleMeta {
  sha256: string
  showId: string
  revision: number
  signature: string | null
  bundle: ShowBundle
}

interface DeviceRow {
  environment_id: string
  id: string
  kind: Device['kind']
  firmware: string
  character_ref: Device['characterRef']
  state: Device['state']
  staged: StagedShow[]
  active: Device['active']
  fault: string | null
  last_seen_at: Date | null
}

interface RunRow {
  id: string
  environment_id: string
  show_id: string
  revision: number
  name: string
  sha256: string
  start_at: number
  duration_ms: number
  launched_by: string
  stopped_at: Date | null
  stop_reason: string | null
}

const key = (environmentId: string, deviceId: string) => `${environmentId}/${deviceId}`

export interface FleetEvents {
  onDeploy?: () => void
  onLaunch?: () => void
  onEstop?: () => void
}

/**
 * Fleet manager: device gateway (WebSocket), desired-vs-reported reconciliation,
 * deployments, synchronized launch and e-stop. Live device state is kept in
 * memory and persisted on meaningful change.
 */
export class FleetService {
  private readonly conns = new Map<string, Connection>()
  /** environment/device -> desired bundle hashes (mirrors desired_bundles). */
  private readonly desired = new Map<string, Set<string>>()
  private readonly bundles = new Map<string, BundleMeta>()
  private readonly sweep: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly studio: StudioService,
    private readonly audit: AuditLog,
    private readonly signer: Signer,
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
    private readonly events: FleetEvents = {},
  ) {
    this.sweep = setInterval(() => this.dropStale(), HEARTBEAT_MS)
    this.sweep.unref()
  }

  async init(): Promise<void> {
    for (const row of await this.db.query<{ environment_id: string; device_id: string; sha256: string }>(
      'select environment_id, device_id, sha256 from desired_bundles',
    )) {
      this.desiredFor(row.environment_id, row.device_id).add(row.sha256)
    }
  }

  close(): void {
    clearInterval(this.sweep)
    for (const c of this.conns.values()) c.socket.close(1001, 'server shutting down')
  }

  onlineCount(): number {
    return this.conns.size
  }

  private desiredFor(environmentId: string, deviceId: string): Set<string> {
    const k = key(environmentId, deviceId)
    let set = this.desired.get(k)
    if (!set) {
      set = new Set()
      this.desired.set(k, set)
    }
    return set
  }

  private async bundle(sha256: string): Promise<BundleMeta> {
    const cached = this.bundles.get(sha256)
    if (cached) return cached
    const [row] = await this.db.query<{
      sha256: string
      show_id: string
      revision: number
      signature: string | null
      body: string
    }>('select sha256, show_id, revision, signature, body from bundles where sha256 = $1', [sha256])
    if (!row) throw problems.notFound(`Bundle ${sha256} does not exist`)
    const meta = {
      sha256,
      showId: row.show_id,
      revision: row.revision,
      signature: row.signature,
      bundle: ShowBundle.parse(JSON.parse(row.body)),
    }
    if (meta.signature) this.bundles.set(sha256, meta) // only cache once immutable (signed)
    return meta
  }

  async bundleBody(sha256: string): Promise<{ body: string; signature: string | null }> {
    const [row] = await this.db.query<{ body: string; signature: string | null }>(
      'select body, signature from bundles where sha256 = $1',
      [sha256],
    )
    if (!row) throw problems.notFound(`Bundle ${sha256} does not exist`)
    return row
  }

  private send(conn: Connection, msg: FleetToDevice): void {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(msg))
  }

  private broadcast(environmentId: string, make: (opId: string) => FleetToDevice): number {
    let n = 0
    for (const conn of this.conns.values()) {
      if (conn.hello.environmentId !== environmentId) continue
      this.send(conn, make(randomUUID()))
      n++
    }
    return n
  }

  // ---- gateway ----------------------------------------------------------------------------

  handleSocket(socket: WebSocket): void {
    let conn: Connection | null = null
    const helloTimer = setTimeout(() => socket.close(4001, 'hello timeout'), 5000)
    const reject = (code: number, error: string, message: string) => {
      socket.send(JSON.stringify({ type: 'error', code: error, message } satisfies FleetToDevice))
      socket.close(code, error)
    }

    socket.on('message', async (raw) => {
      let msg: DeviceToFleet
      try {
        msg = DeviceToFleet.parse(JSON.parse(raw.toString()))
      } catch (err) {
        this.log.warn({ err }, 'invalid device message')
        socket.send(
          JSON.stringify({ type: 'error', code: 'bad-message', message: 'Message does not match the protocol' }),
        )
        return
      }
      try {
        if (!conn) {
          if (msg.type !== 'hello') return reject(4002, 'hello-required', 'Send hello first')
          if (msg.protocolVersion !== PROTOCOL_VERSION)
            return reject(4003, 'protocol-unsupported', `Server speaks protocol ${PROTOCOL_VERSION}`)
          if (!verifyDeviceToken(this.config.DEVICE_SECRET, msg.environmentId, msg.deviceId, msg.token))
            return reject(4004, 'unauthorized', 'Invalid device credential')
          clearTimeout(helloTimer)
          const k = key(msg.environmentId, msg.deviceId)
          this.conns.get(k)?.socket.close(4005, 'replaced by a newer connection')
          conn = { socket, hello: msg, status: null, lastSeen: Date.now(), sent: new Map() }
          this.conns.set(k, conn)
          await this.persistHello(msg)
          this.send(conn, { type: 'welcome', serverTime: Date.now(), heartbeatMs: HEARTBEAT_MS })
          // A device that was offline when an e-stop was broadcast must still honour the latch.
          const estop = await this.estopState(msg.environmentId)
          if (estop.active)
            this.send(conn, { type: 'estop', opId: randomUUID(), reason: estop.reason ?? 'e-stop latched' })
          this.log.info({ device: k, kind: msg.kind, firmware: msg.firmware }, 'device connected')
          return
        }
        conn.lastSeen = Date.now()
        if (msg.type === 'status') {
          const changed = statusChanged(conn.status, msg)
          conn.status = msg
          if (changed) await this.persistStatus(conn)
          await this.reconcile(conn)
        } else if (msg.type === 'ack' && !msg.ok) {
          this.log.warn({ device: conn.hello.deviceId, opId: msg.opId, error: msg.error }, 'device rejected command')
        } else if (msg.type === 'sensorEvent') {
          this.log.info({ sensor: msg.sensorId, event: msg.event }, 'sensor event (handled locally in the park)')
        }
      } catch (err) {
        this.log.error({ err }, 'device message handling failed')
      }
    })

    socket.on('close', () => {
      clearTimeout(helloTimer)
      if (!conn) return
      const k = key(conn.hello.environmentId, conn.hello.deviceId)
      if (this.conns.get(k) === conn) {
        this.conns.delete(k)
        void this.db
          .query('update devices set last_seen_at = now() where environment_id = $1 and id = $2', [
            conn.hello.environmentId,
            conn.hello.deviceId,
          ])
          .catch((err) => this.log.error({ err }, 'failed to record disconnect'))
        this.log.info({ device: k }, 'device disconnected')
      }
    })
  }

  private dropStale(): void {
    const now = Date.now()
    for (const conn of this.conns.values()) {
      if (now - conn.lastSeen > OFFLINE_AFTER_MS) conn.socket.terminate()
    }
  }

  private async persistHello(msg: HelloMsg): Promise<void> {
    await this.db.query(
      `insert into devices (environment_id, id, kind, firmware, character_ref, state, last_seen_at)
       values ($1, $2, $3, $4, $5, 'idle', now())
       on conflict (environment_id, id) do update
         set kind = excluded.kind, firmware = excluded.firmware, character_ref = excluded.character_ref, last_seen_at = now()`,
      [msg.environmentId, msg.deviceId, msg.kind, msg.firmware, msg.characterRef],
    )
  }

  private async persistStatus(conn: Connection): Promise<void> {
    const s = conn.status
    if (!s) return
    await this.db.query(
      `update devices set state = $1, staged = $2, active = $3, fault = $4, last_seen_at = now()
       where environment_id = $5 and id = $6`,
      [
        s.state,
        JSON.stringify(s.staged),
        s.active ? JSON.stringify(s.active) : null,
        s.fault,
        conn.hello.environmentId,
        conn.hello.deviceId,
      ],
    )
  }

  /** Push the device towards its desired set: deploy what is missing, remove what is not wanted. */
  private async reconcile(conn: Connection): Promise<void> {
    const reported = new Map((conn.status?.staged ?? []).map((s) => [s.sha256, s]))
    const desired = this.desiredFor(conn.hello.environmentId, conn.hello.deviceId)
    const now = Date.now()
    for (const sha of desired) {
      if (reported.has(sha)) continue
      const opId = `deploy:${sha}`
      if (now - (conn.sent.get(opId) ?? 0) < RESEND_AFTER_MS) continue
      const meta = await this.bundle(sha)
      if (!meta.signature) continue
      conn.sent.set(opId, now)
      this.send(conn, {
        type: 'deploy',
        opId,
        showId: meta.showId,
        revision: meta.revision,
        sha256: sha,
        url: `${API_PREFIX}/bundles/${sha}`,
        signature: meta.signature,
      })
    }
    const activeSha = conn.status?.active?.sha256
    if (activeSha && now - (conn.sent.get('stop') ?? 0) >= RESEND_AFTER_MS) {
      // Missed a stop while offline? Bring the device back in line with the current run.
      const run = await this.latestRun(conn.hello.environmentId)
      const live = run && run.sha256 === activeSha && ['scheduled', 'running'].includes(this.runStatus(run))
      if (!live) {
        conn.sent.set('stop', now)
        this.send(conn, { type: 'stop', opId: randomUUID() })
      }
    }
    for (const sha of reported.keys()) {
      if (desired.has(sha) || sha === activeSha) continue
      const opId = `remove:${sha}`
      if (now - (conn.sent.get(opId) ?? 0) < RESEND_AFTER_MS) continue
      conn.sent.set(opId, now)
      this.send(conn, { type: 'remove', opId, sha256: sha })
    }
  }

  // ---- queries ------------------------------------------------------------------------------

  async listDevices(environmentId?: string): Promise<Device[]> {
    const rows = environmentId
      ? await this.db.query<DeviceRow>('select * from devices where environment_id = $1 order by id', [environmentId])
      : await this.db.query<DeviceRow>('select * from devices order by environment_id, id')
    return rows.map((r) => {
      const live = this.conns.get(key(r.environment_id, r.id))
      const s = live?.status
      return {
        id: r.id,
        environmentId: r.environment_id,
        kind: r.kind,
        online: !!live,
        state: s?.state ?? r.state,
        firmware: live?.hello.firmware ?? r.firmware,
        characterRef: live ? live.hello.characterRef : r.character_ref,
        staged: s?.staged ?? r.staged,
        active: live ? (s?.active ?? null) : null,
        fault: s ? s.fault : r.fault,
        lastSeenAt: live ? new Date(live.lastSeen).toISOString() : isoOrNull(r.last_seen_at),
      }
    })
  }

  private targetStatus(device: Device | undefined, sha: string): { status: TargetStatus; reason: string | null } {
    if (!device?.online) return { status: 'offline', reason: null }
    const staged = device.staged.find((s) => s.sha256 === sha)
    if (!staged) return { status: 'pending', reason: null }
    return { status: staged.status, reason: staged.reason }
  }

  async listDeployments(environmentId?: string): Promise<Deployment[]> {
    const rows = environmentId
      ? await this.db.query<Record<string, unknown>>(
          'select * from deployments where environment_id = $1 order by created_at desc limit 50',
          [environmentId],
        )
      : await this.db.query<Record<string, unknown>>('select * from deployments order by created_at desc limit 50')
    const devices = new Map((await this.listDevices(environmentId)).map((d) => [key(d.environmentId, d.id), d]))
    const out: Deployment[] = []
    for (const r of rows) {
      const meta = await this.bundle(String(r.sha256))
      const env = String(r.environment_id)
      const targets = Object.keys(meta.bundle.devices).map((deviceId) => ({
        deviceId,
        ...this.targetStatus(devices.get(key(env, deviceId)), meta.sha256),
      }))
      out.push({
        id: String(r.id),
        environmentId: env,
        showId: String(r.show_id),
        revision: Number(r.revision),
        name: String(r.name),
        sha256: meta.sha256,
        createdBy: String(r.created_by),
        createdAt: iso(r.created_at),
        targets,
        goodToGo: targets.every((t) => t.status === 'staged'),
      })
    }
    return out
  }

  private async latestEnvironment(
    environmentId: string,
  ): Promise<{ revision: number; env: EnvironmentDefinition } | null> {
    const [row] = await this.db.query<{ revision: number; content: EnvironmentDefinition }>(
      `select revision, content from revisions where doc_id = $1 and kind = 'environment' order by revision desc limit 1`,
      [environmentId],
    )
    return row ? { revision: row.revision, env: row.content } : null
  }

  private runStatus(r: RunRow, now = Date.now()): RunStatus {
    if (r.stopped_at) return 'stopped'
    if (now < r.start_at) return 'scheduled'
    if (now < r.start_at + r.duration_ms) return 'running'
    return 'completed'
  }

  private toRun(r: RunRow): ShowRun {
    return {
      id: r.id,
      environmentId: r.environment_id,
      showId: r.show_id,
      revision: r.revision,
      name: r.name,
      sha256: r.sha256,
      startAt: r.start_at,
      durationMs: r.duration_ms,
      launchedBy: r.launched_by,
      status: this.runStatus(r),
      stoppedAt: isoOrNull(r.stopped_at),
      stopReason: r.stop_reason,
    }
  }

  private async latestRun(environmentId: string): Promise<RunRow | null> {
    const [row] = await this.db.query<RunRow>(
      'select * from show_runs where environment_id = $1 order by start_at desc limit 1',
      [environmentId],
    )
    return row ?? null
  }

  private async estopState(environmentId: string) {
    const [row] = await this.db.query<{
      active: boolean
      at: Date | null
      actor: string | null
      reason: string | null
    }>('select * from estops where environment_id = $1', [environmentId])
    return { active: row?.active ?? false, at: isoOrNull(row?.at), by: row?.actor ?? null, reason: row?.reason ?? null }
  }

  async environmentStatus(environmentId: string): Promise<EnvironmentStatus> {
    const latest = await this.latestEnvironment(environmentId)
    const devices = await this.listDevices(environmentId)
    const run = await this.latestRun(environmentId)
    const desiredShas = new Set<string>()
    for (const [k, set] of this.desired)
      if (k.startsWith(`${environmentId}/`)) for (const sha of set) desiredShas.add(sha)

    const prepared: PreparedShow[] = []
    const seen = new Set<string>()
    for (const d of await this.listDeployments(environmentId)) {
      if (seen.has(d.sha256) || !desiredShas.has(d.sha256)) continue
      seen.add(d.sha256)
      const meta = await this.bundle(d.sha256)
      prepared.push({
        showId: d.showId,
        revision: d.revision,
        sha256: d.sha256,
        name: d.name,
        durationMs: meta.bundle.durationMs,
        goodToGo: d.goodToGo,
        stagedOn: d.targets.filter((t) => t.status === 'staged').length,
        targets: d.targets.length,
      })
    }
    return {
      environmentId,
      environmentRevision: latest?.revision ?? null,
      expectedDevices: latest ? environmentDevices(latest.env) : [],
      devices,
      run: run ? this.toRun(run) : null,
      estop: await this.estopState(environmentId),
      prepared,
      serverTime: Date.now(),
    }
  }

  // ---- commands ------------------------------------------------------------------------------

  private async approvedBundle(showId: string, revision: number): Promise<BundleMeta> {
    const rev = await this.studio.getRevisionSummary(showId, revision)
    if (rev.kind !== 'show' || !rev.bundleSha256)
      throw problems.badRequest(`${showId}@${revision} is not a show revision`)
    if (rev.status !== 'approved' || !rev.signed)
      throw problems.precondition('Only safety-approved revisions can be deployed or launched', [
        `${showId}@${revision} is ${rev.status}`,
      ])
    return this.bundle(rev.bundleSha256)
  }

  /** All-or-nothing pre-check: every device of the attraction must be online and compatible. */
  private compatibility(meta: BundleMeta): string[] {
    const envId = meta.bundle.environment.id
    const reasons: string[] = []
    for (const [deviceId, payload] of Object.entries(meta.bundle.devices)) {
      const conn = this.conns.get(key(envId, deviceId))
      if (!conn) {
        reasons.push(`${deviceId}: offline`)
        continue
      }
      if (conn.hello.kind !== payload.kind) {
        reasons.push(`${deviceId}: is a ${conn.hello.kind} controller, the show expects a ${payload.kind}`)
      } else if (payload.kind === 'doll') {
        const has = conn.hello.characterRef ? refKey(conn.hello.characterRef) : 'no definition'
        const needs = refKey(payload.character.ref)
        if (has !== needs) reasons.push(`${deviceId}: controller runs ${has}, the show requires ${needs}`)
      }
    }
    return reasons
  }

  async deploy(showId: string, revision: number, user: User): Promise<Deployment> {
    const meta = await this.approvedBundle(showId, revision)
    const envId = meta.bundle.environment.id
    const reasons = this.compatibility(meta)
    if (reasons.length) throw problems.precondition('The attraction is not ready for this show', reasons)

    const id = randomUUID()
    const evicted: { deviceId: string; sha256: string }[] = []
    await this.db.transaction(async (tx) => {
      await tx.query(
        'insert into deployments (id, environment_id, show_id, revision, name, sha256, created_by) values ($1,$2,$3,$4,$5,$6,$7)',
        [id, envId, showId, revision, meta.bundle.show.name, meta.sha256, user.name],
      )
      for (const deviceId of Object.keys(meta.bundle.devices)) {
        await tx.query(
          `insert into desired_bundles (environment_id, device_id, sha256) values ($1, $2, $3)
           on conflict (environment_id, device_id, sha256) do update set created_at = now()`,
          [envId, deviceId, meta.sha256],
        )
        const old = await tx.query<{ sha256: string }>(
          `select sha256 from desired_bundles where environment_id = $1 and device_id = $2
           order by created_at desc offset $3`,
          [envId, deviceId, MAX_STAGED_PER_DEVICE],
        )
        for (const o of old) {
          await tx.query('delete from desired_bundles where environment_id = $1 and device_id = $2 and sha256 = $3', [
            envId,
            deviceId,
            o.sha256,
          ])
          evicted.push({ deviceId, sha256: o.sha256 })
        }
      }
      await this.audit.append(
        user.name,
        'show.deploy',
        'show',
        `${showId}@${revision}`,
        {
          environmentId: envId,
          sha256: meta.sha256,
          evicted,
        },
        tx,
      )
    })
    for (const deviceId of Object.keys(meta.bundle.devices)) this.desiredFor(envId, deviceId).add(meta.sha256)
    for (const e of evicted) this.desiredFor(envId, e.deviceId).delete(e.sha256)
    for (const deviceId of Object.keys(meta.bundle.devices)) {
      const conn = this.conns.get(key(envId, deviceId))
      if (conn) await this.reconcile(conn)
    }
    this.events.onDeploy?.()
    const [created] = (await this.listDeployments(envId)).filter((d) => d.id === id)
    if (!created) throw new Error('deployment vanished')
    return created
  }

  async launch(showId: string, revision: number, user: User): Promise<ShowRun> {
    const meta = await this.approvedBundle(showId, revision)
    const envId = meta.bundle.environment.id
    if ((await this.estopState(envId)).active) throw problems.conflict('E-stop is latched; reset it before launching')
    const current = await this.latestRun(envId)
    if (current && ['scheduled', 'running'].includes(this.runStatus(current)))
      throw problems.conflict(`"${current.name}" is running; stop it before launching another show`)

    const reasons = this.compatibility(meta)
    for (const deviceId of Object.keys(meta.bundle.devices)) {
      const conn = this.conns.get(key(envId, deviceId))
      if (!conn) continue
      const staged = conn.status?.staged.find((s) => s.sha256 === meta.sha256)
      if (staged?.status !== 'staged') reasons.push(`${deviceId}: show not staged (${staged?.status ?? 'missing'})`)
      else if (conn.status?.state === 'estopped' || conn.status?.state === 'faulted')
        reasons.push(`${deviceId}: ${conn.status.state}`)
    }
    if (reasons.length) throw problems.precondition('Not good to go', reasons)

    const run: RunRow = {
      id: randomUUID(),
      environment_id: envId,
      show_id: showId,
      revision,
      name: meta.bundle.show.name,
      sha256: meta.sha256,
      start_at: Date.now() + this.config.LAUNCH_LEAD_MS,
      duration_ms: meta.bundle.durationMs,
      launched_by: user.name,
      stopped_at: null,
      stop_reason: null,
    }
    await this.db.transaction(async (tx) => {
      await tx.query(
        `insert into show_runs (id, environment_id, show_id, revision, name, sha256, start_at, duration_ms, launched_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [run.id, envId, showId, revision, run.name, run.sha256, run.start_at, run.duration_ms, user.name],
      )
      await this.audit.append(
        user.name,
        'show.launch',
        'show',
        `${showId}@${revision}`,
        {
          environmentId: envId,
          sha256: meta.sha256,
          startAt: run.start_at,
        },
        tx,
      )
    })
    this.broadcast(envId, (opId) => ({ type: 'launch', opId, sha256: meta.sha256, startAt: run.start_at }))
    this.events.onLaunch?.()
    return this.toRun(run)
  }

  private async stopRun(environmentId: string, reason: string, tx: Db): Promise<void> {
    await tx.query(
      `update show_runs set stopped_at = now(), stop_reason = $1
       where environment_id = $2 and stopped_at is null and start_at + duration_ms > $3`,
      [reason, environmentId, Date.now()],
    )
  }

  async stop(environmentId: string, user: User): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.stopRun(environmentId, `stopped by ${user.name}`, tx)
      await this.audit.append(user.name, 'show.stop', 'environment', environmentId, {}, tx)
    })
    this.broadcast(environmentId, (opId) => ({ type: 'stop', opId }))
  }

  async estop(environmentId: string, reason: string, user: User): Promise<void> {
    // Command devices first; bookkeeping must never delay an e-stop.
    const reached = this.broadcast(environmentId, (opId) => ({ type: 'estop', opId, reason }))
    this.events.onEstop?.()
    await this.db.transaction(async (tx) => {
      await tx.query(
        `insert into estops (environment_id, active, at, actor, reason) values ($1, true, now(), $2, $3)
         on conflict (environment_id) do update set active = true, at = now(), actor = $2, reason = $3`,
        [environmentId, user.name, reason],
      )
      await this.stopRun(environmentId, `e-stop: ${reason}`, tx)
      await this.audit.append(
        user.name,
        'estop.trigger',
        'environment',
        environmentId,
        { reason, devicesReached: reached },
        tx,
      )
    })
  }

  async resetEstop(environmentId: string, user: User): Promise<void> {
    if (!(await this.estopState(environmentId)).active) throw problems.conflict('E-stop is not active')
    await this.db.transaction(async (tx) => {
      await tx.query('update estops set active = false where environment_id = $1', [environmentId])
      await this.audit.append(user.name, 'estop.reset', 'environment', environmentId, {}, tx)
    })
    this.broadcast(environmentId, (opId) => ({ type: 'reset', opId }))
  }

  simulateSensor(environmentId: string, deviceId: string, event: SensorEvent): void {
    const conn = this.conns.get(key(environmentId, deviceId))
    if (!conn) throw problems.notFound(`Sensor ${deviceId} is offline`)
    if (conn.hello.kind !== 'sensor') throw problems.badRequest(`${deviceId} is not a sensor`)
    this.send(conn, { type: 'simulateSensor', opId: randomUUID(), event })
  }

  async provision(environmentId: string): Promise<ProvisioningResponse> {
    const latest = await this.latestEnvironment(environmentId)
    if (!latest) throw problems.notFound(`Environment "${environmentId}" has no published revision`)
    const characters = await this.studio.charactersFor(latest.env)
    const devices = environmentDevices(latest.env).map((d) => ({
      ...d,
      characterRef: latest.env.placements.find((p) => p.deviceId === d.deviceId)?.character ?? null,
      token: deviceToken(this.config.DEVICE_SECRET, environmentId, d.deviceId),
    }))
    await this.audit.append('provisioning', 'devices.provision', 'environment', environmentId, {
      revision: latest.revision,
      devices: devices.length,
    })
    return {
      protocolVersion: PROTOCOL_VERSION,
      environment: { id: environmentId, revision: latest.revision },
      layout: latest.env,
      devices,
      characters: Object.fromEntries(characters),
      signingPublicKeyPem: this.signer.publicKeyPem,
    }
  }
}

function statusChanged(prev: StatusMsg | null, next: StatusMsg): boolean {
  if (!prev) return true
  return (
    prev.state !== next.state ||
    prev.fault !== next.fault ||
    prev.active?.sha256 !== next.active?.sha256 ||
    JSON.stringify(prev.staged) !== JSON.stringify(next.staged)
  )
}
