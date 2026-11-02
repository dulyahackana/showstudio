import { createHash, createPublicKey, type KeyObject, verify } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activeBehaviorFor,
  audioEventsBetween,
  type LightSample,
  type StartedBehavior,
  sampleDollPose,
  sampleLightState,
  validateDollPayload,
} from '@studio/playback'
import {
  type DeviceState,
  type DeviceToFleet,
  type DocRef,
  type FleetToDevice,
  FleetToDevice as FleetToDeviceSchema,
  type JointLimits,
  PROTOCOL_VERSION,
  type ProvisionedDevice,
  refKey,
  ShowBundle,
  type StagedShow,
} from '@studio/schema'
import WebSocket from 'ws'
import type { LocalBus } from './bus.ts'

const MAX_STAGED = 5
const TICK_MS = 20
/** Gateway close code: a newer connection took over this device id. */
const CLOSE_REPLACED = 4005

export interface DeviceFaults {
  /** Flip a byte of every download (exercises hash verification). */
  corruptDownloads?: boolean
  /** Pretend the controller runs a different definition (exercises compatibility checks). */
  characterRef?: DocRef
}

export interface SimDeviceOptions {
  apiUrl: string
  environmentId: string
  device: ProvisionedDevice
  /** Limits held by the controller itself (from provisioning), independent of any bundle. */
  localLimits: JointLimits[] | null
  publicKeyPem: string
  bus: LocalBus
  dataDir?: string
  firmware?: string
  faults?: DeviceFaults
  log?: (msg: string) => void
}

interface Staged {
  info: StagedShow
  bundle?: ShowBundle
}

interface Active {
  sha256: string
  bundle: ShowBundle
  startAtLocal: number
  started: StartedBehavior[]
  lastAudioT: number
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

class Rejected extends Error {}

/**
 * Reference device implementation. A real controller (or the engine simulator)
 * implements the same protocol: hello -> status heartbeats; deploy = download,
 * verify hash + signature + schema + local limits, stage atomically; launch at a
 * shared start time; play from the local copy even if the cloud disappears.
 */
export class SimDevice {
  readonly id: string
  private ws: WebSocket | null = null
  private stopped = false
  private backoffMs = 500
  private offsetMs = 0
  private estopped = false
  private fault: string | null = null
  private active: Active | null = null
  private readonly staged = new Map<string, Staged>()
  private readonly seenOps: string[] = []
  private readonly publicKey: KeyObject
  private heartbeat: NodeJS.Timeout | null = null
  private ticker: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  /** Latest sampled output, for logs and tests. */
  pose: Record<string, number> = {}
  light: LightSample | null = null
  readonly playedCues: { id: string; at: number }[] = []

  constructor(private readonly opts: SimDeviceOptions) {
    this.id = opts.device.deviceId
    this.publicKey = createPublicKey(opts.publicKeyPem)
    opts.bus.on('behaviorStart', ({ sha256: sha, id, startAt }) => {
      if (this.active?.sha256 === sha && this.involved(id)) this.active.started.push({ id, startAt })
    })
    if (opts.device.kind === 'doll' && opts.localLimits) {
      this.pose = Object.fromEntries(opts.localLimits.map((j) => [j.name, j.home]))
    }
  }

  get kind() {
    return this.opts.device.kind
  }

  private log(msg: string) {
    this.opts.log?.(`[${this.id}] ${msg}`)
  }

  private involved(behaviorId: string) {
    return this.active?.bundle.behaviors.find((b) => b.id === behaviorId)?.devices.includes(this.id) ?? false
  }

  get state(): DeviceState {
    if (this.estopped) return 'estopped'
    if (this.fault) return 'faulted'
    if (this.active) return Date.now() < this.active.startAtLocal ? 'armed' : 'running'
    return [...this.staged.values()].some((s) => s.info.status === 'staged') ? 'ready' : 'idle'
  }

  /** Sensor responses started during the current run (decided by the local show controller). */
  get startedBehaviors(): readonly StartedBehavior[] {
    return this.active?.started ?? []
  }

  get stagedShows(): StagedShow[] {
    return [...this.staged.values()].map((s) => s.info)
  }

  start(): void {
    this.loadFromDisk()
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.ticker) clearInterval(this.ticker)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }

  /** Drop the connection (simulates a network cut); playback continues locally. */
  disconnect(): void {
    this.ws?.terminate()
  }

  // ---- connection -------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return
    const url = `${this.opts.apiUrl.replace(/^http/, 'ws')}/api/v1/devices/ws`
    const ws = new WebSocket(url)
    this.ws = ws
    ws.on('open', () => {
      this.send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        deviceId: this.id,
        environmentId: this.opts.environmentId,
        kind: this.opts.device.kind,
        firmware: this.opts.firmware ?? 'sim-0.1.0',
        characterRef: this.opts.faults?.characterRef ?? this.opts.device.characterRef,
        token: this.opts.device.token,
      })
    })
    ws.on('message', (raw) => {
      const parsed = FleetToDeviceSchema.safeParse(JSON.parse(raw.toString()))
      if (!parsed.success) return this.log('ignored malformed message from fleet manager')
      void this.handle(parsed.data)
    })
    ws.on('close', (code) => {
      if (this.heartbeat) clearInterval(this.heartbeat)
      this.heartbeat = null
      if (this.stopped) return
      if (code === CLOSE_REPLACED) {
        // Another controller connected with this identity (e.g. the Godot simulator took over): don't fight it.
        this.log('replaced by another connection with the same device id; not reconnecting')
        return
      }
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs)
      this.backoffMs = Math.min(this.backoffMs * 2, 10_000)
    })
    ws.on('error', () => {
      /* close follows; reconnect with backoff */
    })
  }

  private send(msg: DeviceToFleet): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private sendStatus(): void {
    const a = this.active
    this.send({
      type: 'status',
      state: this.state,
      staged: this.stagedShows,
      active: a
        ? {
            sha256: a.sha256,
            startAt: a.startAtLocal + this.offsetMs,
            showTimeMs: Math.max(0, Date.now() - a.startAtLocal),
          }
        : null,
      fault: this.fault,
    })
  }

  private ack(opId: string, error: string | null = null): void {
    this.send({ type: 'ack', opId, ok: error === null, error })
  }

  private async handle(msg: FleetToDevice): Promise<void> {
    if ('opId' in msg) {
      if (this.seenOps.includes(msg.opId) && msg.type !== 'deploy') return this.ack(msg.opId)
      this.seenOps.push(msg.opId)
      if (this.seenOps.length > 200) this.seenOps.shift()
    }
    switch (msg.type) {
      case 'welcome':
        this.offsetMs = msg.serverTime - Date.now()
        this.backoffMs = 500
        this.sendStatus()
        this.heartbeat = setInterval(() => this.sendStatus(), msg.heartbeatMs)
        return
      case 'deploy':
        return this.deploy(msg)
      case 'remove':
        if (this.active?.sha256 !== msg.sha256) {
          this.staged.delete(msg.sha256)
          if (this.opts.dataDir) rmSync(join(this.storeDir(), `${msg.sha256}.json`), { force: true })
        }
        this.ack(msg.opId)
        return this.sendStatus()
      case 'launch':
        return this.launch(msg.opId, msg.sha256, msg.startAt)
      case 'stop':
        this.finish('stopped by operator')
        this.ack(msg.opId)
        return this.sendStatus()
      case 'estop':
        this.estopped = true
        this.finish(`E-STOP: ${msg.reason}`)
        this.ack(msg.opId)
        return this.sendStatus()
      case 'reset':
        this.estopped = false
        this.log('e-stop reset')
        this.ack(msg.opId)
        return this.sendStatus()
      case 'simulateSensor':
        if (this.kind !== 'sensor') return this.ack(msg.opId, 'not a sensor')
        this.log(`sensor fired: ${msg.event}`)
        this.opts.bus.emit('sensor', { sensorId: this.id, event: msg.event })
        this.send({ type: 'sensorEvent', sensorId: this.id, event: msg.event, at: Date.now() + this.offsetMs })
        return this.ack(msg.opId)
      case 'error':
        this.log(`fleet manager error: ${msg.code} ${msg.message}`)
        return
    }
  }

  // ---- staging --------------------------------------------------------------------------------

  private storeDir(): string {
    const dir = join(this.opts.dataDir ?? '.', this.opts.environmentId, this.id)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  private loadFromDisk(): void {
    if (!this.opts.dataDir) return
    const dir = this.storeDir()
    for (const file of readdirSync(dir).filter((f) => /^[a-f0-9]{64}\.json$/.test(f))) {
      const bytes = readFileSync(join(dir, file))
      const sha = file.slice(0, 64)
      if (sha256(bytes) !== sha) continue // corrupted on disk: let the fleet manager redeploy it
      const bundle = ShowBundle.parse(JSON.parse(bytes.toString('utf8')))
      this.staged.set(sha, {
        info: { sha256: sha, showId: bundle.show.id, revision: bundle.show.revision, status: 'staged', reason: null },
        bundle,
      })
    }
  }

  private async download(path: string): Promise<Buffer> {
    const res = await fetch(`${this.opts.apiUrl}${path}`, {
      headers: {
        'x-device-id': this.id,
        'x-environment-id': this.opts.environmentId,
        'x-device-token': this.opts.device.token,
      },
    })
    if (!res.ok) throw new Error(`download of ${path} failed: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  private async deploy(msg: Extract<FleetToDevice, { type: 'deploy' }>): Promise<void> {
    const existing = this.staged.get(msg.sha256)
    if (existing && existing.info.status !== 'rejected') return this.ack(msg.opId)
    const info: StagedShow = {
      sha256: msg.sha256,
      showId: msg.showId,
      revision: msg.revision,
      status: 'downloading',
      reason: null,
    }
    this.staged.set(msg.sha256, { info })
    this.sendStatus()
    try {
      let bytes = await this.download(msg.url)
      if (this.opts.faults?.corruptDownloads) {
        bytes = Buffer.from(bytes)
        bytes[10] = (bytes[10] ?? 0) ^ 0xff
      }
      if (sha256(bytes) !== msg.sha256) throw new Rejected('hash mismatch')
      if (!verify('sha256', bytes, this.publicKey, Buffer.from(msg.signature, 'base64')))
        throw new Rejected('invalid signature')
      const parsed = ShowBundle.safeParse(JSON.parse(bytes.toString('utf8')))
      if (!parsed.success) throw new Rejected('bundle does not match schema version 1')
      const bundle = parsed.data
      const payload = bundle.devices[this.id]
      if (!payload) throw new Rejected('bundle has no payload for this device')
      if (payload.kind !== this.kind) throw new Rejected(`bundle targets a ${payload.kind}, this is a ${this.kind}`)
      if (payload.kind === 'doll') {
        const mine = this.opts.faults?.characterRef ?? this.opts.device.characterRef
        if (!mine || refKey(mine) !== refKey(payload.character.ref))
          throw new Rejected(`definition mismatch: controller has ${mine ? refKey(mine) : 'none'}`)
        const errors = validateDollPayload(
          payload,
          this.opts.localLimits ?? [],
          bundle.durationMs,
          bundle.behaviors,
        ).filter((i) => i.severity === 'error')
        if (errors.length) throw new Rejected(`limit check failed: ${errors[0]?.message}`)
      }
      if (payload.kind === 'audio') {
        for (const [assetId, { path }] of Object.entries(payload.assets)) {
          if (sha256(await this.download(path)) !== assetId)
            throw new Rejected(`audio asset ${assetId.slice(0, 8)} corrupted`)
        }
      }
      if (this.opts.dataDir) {
        const file = join(this.storeDir(), `${msg.sha256}.json`)
        writeFileSync(`${file}.tmp`, bytes)
        renameSync(`${file}.tmp`, file) // atomic: a power cut never leaves a half-written show
      }
      this.staged.set(msg.sha256, { info: { ...info, status: 'staged' }, bundle })
      this.evict()
      this.log(`staged ${bundle.show.name} r${bundle.show.revision} (${msg.sha256.slice(0, 8)})`)
      this.ack(msg.opId)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.staged.set(msg.sha256, { info: { ...info, status: 'rejected', reason } })
      this.log(`REJECTED ${msg.sha256.slice(0, 8)}: ${reason}`)
      this.ack(msg.opId, reason)
    }
    this.sendStatus()
  }

  private evict(): void {
    const keep = [...this.staged.keys()].slice(-MAX_STAGED)
    for (const sha of this.staged.keys()) {
      if (!keep.includes(sha) && sha !== this.active?.sha256) this.staged.delete(sha)
    }
  }

  // ---- playback ----------------------------------------------------------------------------------

  private launch(opId: string, sha: string, startAt: number): void {
    const staged = this.staged.get(sha)
    const refusal = this.estopped
      ? 'e-stop latched'
      : staged?.info.status !== 'staged' || !staged.bundle
        ? 'show not staged'
        : this.active
          ? 'a show is already active'
          : null
    if (refusal || !staged?.bundle) {
      this.ack(opId, refusal ?? 'show not staged')
      return
    }
    const startAtLocal = startAt - this.offsetMs
    this.active = { sha256: sha, bundle: staged.bundle, startAtLocal, started: [], lastAudioT: -1 }
    this.opts.bus.emit('run', { sha256: sha, bundle: staged.bundle, startAtLocal })
    this.log(`armed: ${staged.bundle.show.name} starts in ${Math.round(startAtLocal - Date.now())} ms`)
    this.ticker = setInterval(() => this.tick(), TICK_MS)
    this.ack(opId)
    this.sendStatus()
  }

  private tick(): void {
    const a = this.active
    if (!a) return
    const t = Date.now() - a.startAtLocal
    if (t < 0) return
    if (t >= a.bundle.durationMs) {
      this.finish('completed')
      this.sendStatus()
      return
    }
    const payload = a.bundle.devices[this.id]
    const behavior = activeBehaviorFor(a.bundle, this.id, t, a.started)
    if (payload?.kind === 'doll') this.pose = sampleDollPose(payload, t, behavior)
    else if (payload?.kind === 'light') this.light = sampleLightState(payload, t, behavior)
    else if (payload?.kind === 'audio') {
      for (const e of audioEventsBetween(payload, a.bundle, a.lastAudioT, t, a.started)) {
        this.playedCues.push({ id: e.cue.id, at: e.at })
        this.log(`♪ ${e.cue.label} (${e.cue.volumeDb} dBFS) at ${e.at} ms`)
      }
      a.lastAudioT = t
    }
  }

  private finish(reason: string): void {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
    if (!this.active) return
    this.opts.bus.emit('runEnd', { sha256: this.active.sha256 })
    this.log(`${this.active.bundle.show.name}: ${reason}`)
    this.active = null
    // Real controllers home at reduced speed; the sim snaps to home.
    if (this.opts.localLimits) this.pose = Object.fromEntries(this.opts.localLimits.map((j) => [j.name, j.home]))
  }
}
