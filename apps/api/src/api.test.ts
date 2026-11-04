import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type SimFleet, startFleet } from '@studio/fleet-sim'
import { characters, lab, makeShow, robot } from '@studio/playback/src/fixtures.ts'
import {
  API_PREFIX,
  buildPath,
  contract,
  PackageManifest,
  type Problem,
  type RouteInput,
  type RouteKey,
  type RouteOutput,
  type ShowDefinition,
} from '@studio/schema'
import { type App, buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { unzip } from './zip.ts'

/*
 * End-to-end through the real HTTP + WebSocket stack with simulated devices:
 * author -> publish -> four-eyes approval -> deploy -> good to go -> launch ->
 * local sensor response -> network cut -> e-stop, plus the failure paths.
 */

let app: App
let url: string
let dataDir: string
const fleets: SimFleet[] = []
const tokens: Record<string, string> = {}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(`${status} ${problem.title}: ${problem.detail ?? ''}`)
  }
}

async function call<K extends RouteKey>(who: string | null, key: K, input?: RouteInput<K>): Promise<RouteOutput<K>> {
  const def = contract[key]
  const i = (input ?? {}) as { params?: Record<string, unknown>; query?: Record<string, string>; body?: unknown }
  const qs = i.query ? `?${new URLSearchParams(i.query)}` : ''
  const headers: Record<string, string> = {}
  if (who) headers.authorization = `Bearer ${tokens[who]}`
  let body: RequestInit['body']
  if (i.body instanceof FormData) body = i.body
  else if (i.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(i.body)
  }
  const res = await fetch(`${url}${API_PREFIX}${buildPath(def.path, i.params)}${qs}`, {
    method: def.method,
    headers,
    body,
  })
  if (!res.ok) throw new ApiError(res.status, (await res.json()) as Problem)
  return (def.response === 'binary' ? await res.blob() : await res.json()) as RouteOutput<K>
}

const fails = async (p: Promise<unknown>, status: number): Promise<Problem> => {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) {
      expect(err.status, JSON.stringify(err.problem)).toBe(status)
      return err.problem
    }
    throw err
  }
  throw new Error(`expected HTTP ${status}`)
}

async function waitFor<T>(fn: () => Promise<T> | T, ok: (v: T) => boolean, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (ok(v)) return v
    if (Date.now() - start > timeoutMs)
      throw new Error(`condition not met in ${timeoutMs} ms: ${JSON.stringify(v)?.slice(0, 500)}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

function wav(seconds = 0.2): Blob {
  const rate = 8000
  const n = Math.floor(rate * seconds)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 4) * 8000), 44 + i * 2)
  return new Blob([buf], { type: 'audio/wav' })
}

const boot = (faults?: Parameters<typeof startFleet>[0]['faults']) =>
  startFleet({
    apiUrl: url,
    environmentId: 'lab',
    provisioningToken: 'dev-provisioning-token',
    ...(faults ? { faults } : {}),
  }).then((f) => {
    fleets.push(f)
    return f
  })

const allOffline = () =>
  waitFor(
    () => call('alice', 'listDevices', { query: { environmentId: 'lab' } }),
    (ds) => ds.every((d) => !d.online),
  )

const allOnline = () =>
  waitFor(
    () => call('alice', 'listDevices', { query: { environmentId: 'lab' } }),
    (ds) => ds.length === 5 && ds.every((d) => d.online),
  )

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'studio-api-'))
  app = await buildApp(loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, LAUNCH_LEAD_MS: '500' }), {
    memoryDb: true,
    ephemeralKeys: true,
  })
  await app.app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.app.server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  url = `http://127.0.0.1:${address.port}`
  for (const [name, roles] of [
    ['alice', ['engineer']],
    ['tom', ['engineer']],
    ['priya', ['engineer']],
    ['sam', ['safety']],
    ['olga', ['operator']],
    ['admin', ['admin']],
  ] as const) {
    tokens[name] = (await call(null, 'devLogin', { body: { name, roles: [...roles] } })).token
  }
  await call('admin', 'createLocation', { body: { id: 'hq', name: 'Headquarters', region: 'Burbank' } })
})

afterAll(async () => {
  for (const f of fleets) f.stop()
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('studio + fleet end to end', () => {
  let audioId = ''
  let show: ShowDefinition
  let fleet: SimFleet

  it('serves health and the generated contract', async () => {
    expect((await call(null, 'health')).status).toBe('ok')
    const openapi = (await (await fetch(`${url}${API_PREFIX}/openapi.json`)).json()) as { paths: object }
    expect(Object.keys(openapi.paths).length).toBeGreaterThan(20)
    const missing = await fetch(`${url}${API_PREFIX}/no-such-endpoint`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toStartWith('application/problem+json')
  })

  it('enforces authentication and roles from the contract', async () => {
    await fails(call(null, 'listDocuments'), 401)
    await fails(call('olga', 'createDocument', { body: { kind: 'character', id: 'robot', draft: robot } }), 403)
    await fails(call('alice', 'getDocument', { params: { id: 'Not An Id' } }), 400)
  })

  it('publishes characters and environments as immutable revisions', async () => {
    await call('alice', 'createDocument', { body: { kind: 'character', id: 'robot', draft: robot } })
    expect(
      (await call('alice', 'publish', { params: { id: 'robot' }, body: { draftVersion: 1, note: 'v1' } })).revision,
    ).toBe(1)
    const again = await fails(
      call('alice', 'publish', { params: { id: 'robot' }, body: { draftVersion: 1, note: '' } }),
      409,
    )
    expect(again.detail).toContain('No changes')
    await fails(
      call('alice', 'createDocument', { body: { kind: 'environment', locationId: 'nowhere', id: 'lab', draft: lab } }),
      404,
    )
    await call('alice', 'createDocument', { body: { kind: 'environment', locationId: 'hq', id: 'lab', draft: lab } })
    await call('alice', 'publish', { params: { id: 'lab' }, body: { draftVersion: 1, note: '' } })
  })

  it('accepts only real GLB/audio uploads, content-addressed', async () => {
    const form = new FormData()
    form.append('file', wav(), 'hello.wav')
    const asset = await call('alice', 'uploadAsset', { body: form })
    expect(asset).toMatchObject({ kind: 'audio', mime: 'audio/wav' })
    audioId = asset.id
    const bad = new FormData()
    bad.append('file', new Blob(['#!/bin/sh']), 'model.glb')
    await fails(call('alice', 'uploadAsset', { body: bad }), 415)
  })

  it('detects concurrent edits and blocks invalid shows from publishing', async () => {
    show = JSON.parse(JSON.stringify(makeShow()).replaceAll('a'.repeat(64), audioId)) as ShowDefinition
    const broken = structuredClone(show)
    broken.tracks.motion['robot-01'] = { arm_pitch: [{ t: 3000, v: 500, interp: 'linear' }] }
    // A project is one show: creating it creates the show, and its team is set per project.
    const project = await call('alice', 'createProject', { body: { id: 'demo', draft: broken } })
    expect(project).toMatchObject({ id: 'demo', name: broken.name, environmentId: 'lab', myRole: 'owner' })
    expect(project.show).toMatchObject({ kind: 'show', projectId: 'demo', draftVersion: 1, latestRevision: null })
    for (const [user, role] of [
      ['tom', 'editor'],
      ['sam', 'reviewer'],
      ['olga', 'operator'],
    ] as const) {
      await call('alice', 'setProjectMember', { params: { projectId: 'demo', user }, body: { role } })
    }
    const invalid = await fails(
      call('alice', 'publish', { params: { id: 'demo' }, body: { draftVersion: 1, note: '' } }),
      422,
    )
    expect(invalid.issues?.map((i) => i.code)).toContain('motion-out-of-range')

    await call('alice', 'saveDraft', { params: { id: 'demo' }, body: { kind: 'show', draftVersion: 1, draft: show } })
    await fails(
      call('tom', 'saveDraft', { params: { id: 'demo' }, body: { kind: 'show', draftVersion: 1, draft: show } }),
      409,
    )
    const rev = await call('alice', 'publish', { params: { id: 'demo' }, body: { draftVersion: 2, note: 'first cut' } })
    expect(rev).toMatchObject({ revision: 1, status: 'published', signed: false })
    expect(rev.bundleSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('requires an independent safety approval, which signs the bundle', async () => {
    const target = { params: { id: 'demo', revision: 1 }, body: { note: 'ok' } }
    await fails(call('olga', 'approveRevision', target), 403)
    const reviewed = await call('sam', 'approveRevision', target)
    expect(reviewed).toMatchObject({ status: 'approved', signed: true, reviewedBy: 'sam' })

    const bytes = Buffer.from(
      await (await call('alice', 'getBundle', { params: { sha256: reviewed.bundleSha256 ?? '' } })).arrayBuffer(),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reviewed.bundleSha256 ?? '')
    const { publicKeyPem } = await call(null, 'signingKey')
    const res = await fetch(`${url}${API_PREFIX}/bundles/${reviewed.bundleSha256}`, {
      headers: { authorization: `Bearer ${tokens.alice}` },
    })
    const signature = res.headers.get('x-signature') ?? ''
    expect(verify('sha256', bytes, createPublicKey(publicKeyPem), Buffer.from(signature, 'base64'))).toBe(true)
  })

  it('packages approved revisions for offline install, for the people who may deploy them', async () => {
    const download = async (user: string) =>
      Buffer.from(await (await call(user, 'downloadPackage', { params: { id: 'demo', revision: 1 } })).arrayBuffer())
    const zipped = await download('olga')
    const files = unzip(zipped)
    expect([...files.keys()].sort()).toEqual([
      'README.txt',
      `audio/${audioId}.wav`,
      'bundle.json',
      'bundle.sig',
      'manifest.json',
      'show.json',
    ])
    const file = (name: string) => files.get(name) ?? Buffer.alloc(0)
    const manifest = PackageManifest.parse(JSON.parse(file('manifest.json').toString('utf8')))
    const rev = await call('olga', 'getRevision', { params: { id: 'demo', revision: 1 } })
    expect(manifest).toMatchObject({ show: { id: 'demo', revision: 1 }, approved: { by: 'sam' } })
    expect(createHash('sha256').update(file('bundle.json')).digest('hex')).toBe(rev.bundleSha256 ?? '')
    expect(manifest.bundle.sha256).toBe(rev.bundleSha256 ?? '')
    const { publicKeyPem } = await call(null, 'signingKey')
    const signature = Buffer.from(file('bundle.sig').toString('utf8'), 'base64')
    expect(verify('sha256', file('bundle.json'), createPublicKey(publicKeyPem), signature)).toBe(true)
    for (const a of manifest.assets) expect(createHash('sha256').update(file(a.path)).digest('hex')).toBe(a.id)
    expect(JSON.parse(file('show.json').toString('utf8'))).toEqual(rev.content)

    expect((await download('alice')).equals(zipped)).toBe(true) // deterministic
    await fails(call('tom', 'downloadPackage', { params: { id: 'demo', revision: 1 } }), 403) // editor, not operator
  })

  it('refuses to deploy while devices are offline (all-or-nothing)', async () => {
    const p = await fails(call('alice', 'createDeployment', { body: { showId: 'demo', revision: 1 } }), 409)
    expect(p.reasons).toEqual(expect.arrayContaining(['robot-01: offline']))
  })

  it('stages on every device, then reports good to go', async () => {
    fleet = await boot()
    await allOnline()
    const dep = await call('alice', 'createDeployment', { body: { showId: 'demo', revision: 1 } })
    expect(dep.targets).toHaveLength(4)
    const ready = await waitFor(
      () => call('olga', 'listDeployments', { query: { environmentId: 'lab' } }),
      (ds) => ds[0]?.goodToGo === true,
    )
    expect(ready[0]?.targets.every((t) => t.status === 'staged')).toBe(true)
    const status = await call('olga', 'environmentStatus', { params: { environmentId: 'lab' } })
    expect(status.prepared).toEqual([expect.objectContaining({ showId: 'demo', goodToGo: true, stagedOn: 4 })])
  })

  it('launches in sync, reacts to sensors locally and survives a network cut', async () => {
    await fails(
      call('olga', 'launch', { body: { showId: 'demo', revision: 1, zoneClearConfirmed: false as true } }),
      400,
    )
    await fails(call('alice', 'launch', { body: { showId: 'demo', revision: 1, zoneClearConfirmed: true } }), 403)
    const run = await call('olga', 'launch', { body: { showId: 'demo', revision: 1, zoneClearConfirmed: true } })
    expect(run.status).toBe('scheduled')
    await fails(call('olga', 'launch', { body: { showId: 'demo', revision: 1, zoneClearConfirmed: true } }), 409)

    const robotSim = fleet.device('robot-01')
    await waitFor(
      () => robotSim.state,
      (s) => s === 'running',
    )
    await call('olga', 'simulateSensor', {
      params: { deviceId: 'door' },
      body: { environmentId: 'lab', event: 'enter' },
    })
    await waitFor(
      () => robotSim.startedBehaviors.map((b) => b.id),
      (ids) => ids.includes('wave'),
    )

    robotSim.disconnect()
    await new Promise((r) => setTimeout(r, 300))
    expect(robotSim.state).toBe('running') // playback continues from the local copy
  })

  it('latches the e-stop until an operator resets it', async () => {
    await call('alice', 'estop', { body: { environmentId: 'lab', reason: 'test' } }) // any signed-in user may e-stop
    await waitFor(
      () => fleet.devices.map((d) => d.state),
      (s) => s.every((x) => x === 'estopped'),
    )
    const status = await call('olga', 'environmentStatus', { params: { environmentId: 'lab' } })
    expect(status.estop).toMatchObject({ active: true, by: 'alice' })
    expect(status.run?.status).toBe('stopped')
    await fails(call('olga', 'launch', { body: { showId: 'demo', revision: 1, zoneClearConfirmed: true } }), 409)
    await fails(call('alice', 'resetEstop', { body: { environmentId: 'lab' } }), 403)
    await call('olga', 'resetEstop', { body: { environmentId: 'lab' } })
    await waitFor(
      () => fleet.devices.map((d) => d.state),
      (s) => s.every((x) => x === 'ready'),
    )
    fleet.stop()
    await allOffline()
  })

  it('runs and e-stops from the operator console on site', async () => {
    const f = await boot()
    await allOnline()
    const panel = f.device('console-01')
    const status = () => call('olga', 'environmentStatus', { params: { environmentId: 'lab' } })
    await waitFor(status, (s) => s.prepared.some((p) => p.goodToGo))
    // The display lists the prepared shows; RUN goes through the same checks as the studio.
    await waitFor(
      () => panel.console.panel?.prepared.find((p) => p.goodToGo)?.sha256,
      (sha) => sha !== undefined && panel.console.selected === sha,
    )
    panel.press('run')
    const launched = await waitFor(status, (s) => ['scheduled', 'running'].includes(s.run?.status ?? ''))
    expect(launched.run?.launchedBy).toBe('console-01')
    await waitFor(
      () => panel.console.panel?.run?.sha256,
      (sha) => sha === launched.run?.sha256,
    )

    // E-STOP latches every controller over the park network, even one cut off from the cloud.
    f.device('robot-01').disconnect()
    panel.press('estop')
    expect(f.device('robot-01').state).toBe('estopped')
    const latched = await waitFor(status, (s) => s.estop.active)
    expect(latched.estop.by).toBe('console-01')
    expect(latched.run?.status).toBe('stopped')

    // Nobody resets while the mushroom is still pushed in: not the studio, not the console.
    expect((await fails(call('olga', 'resetEstop', { body: { environmentId: 'lab' } }), 409)).detail).toMatch(
      /console-01 is still pushed in/,
    )
    panel.press('reset')
    expect(panel.console.notice).toMatch(/twist/i)
    panel.press('release')
    await new Promise((r) => setTimeout(r, 200))
    panel.press('reset')
    await waitFor(
      () => f.devices.map((d) => d.state),
      (states) => !states.includes('estopped'),
    )
    expect((await status()).estop.active).toBe(false)

    // Engine simulators and tests press the same buttons through the API.
    await call('olga', 'simulateConsole', {
      params: { deviceId: 'console-01' },
      body: { environmentId: 'lab', button: 'estop' },
    })
    await waitFor(status, (s) => s.estop.active && s.estop.by === 'console-01')
    await fails(
      call('olga', 'simulateConsole', { params: { deviceId: 'door' }, body: { environmentId: 'lab', button: 'run' } }),
      400,
    )
    panel.press('release')
    await new Promise((r) => setTimeout(r, 200))
    await call('olga', 'resetEstop', { body: { environmentId: 'lab' } })
    f.stop()
    await allOffline()
  })

  it('blocks deploys to controllers running a different definition', async () => {
    await call('alice', 'saveDraft', {
      params: { id: 'demo' },
      body: { kind: 'show', draftVersion: 2, draft: { ...show, name: 'Demo v2' } },
    })
    await call('alice', 'publish', { params: { id: 'demo' }, body: { draftVersion: 3, note: 'rename' } })
    await call('sam', 'approveRevision', { params: { id: 'demo', revision: 2 }, body: { note: '' } })
    const outdated = await boot({ 'robot-01': { characterRef: { id: 'robot', revision: 9 } } })
    await waitFor(
      () => call('alice', 'listDevices', { query: { environmentId: 'lab' } }),
      (ds) => ds.every((d) => d.online) && ds.find((d) => d.id === 'robot-01')?.characterRef?.revision === 9,
    )
    const p = await fails(call('alice', 'createDeployment', { body: { showId: 'demo', revision: 2 } }), 409)
    expect(p.reasons).toEqual(['robot-01: controller runs robot@9, the show requires robot@1'])
    outdated.stop()
    await allOffline()
  })

  it('reports devices that reject a corrupted download', async () => {
    const corrupt = await boot({ 'light-01': { corruptDownloads: true } })
    await allOnline()
    await call('alice', 'createDeployment', { body: { showId: 'demo', revision: 2 } })
    const deps = await waitFor(
      () => call('alice', 'listDeployments', { query: { environmentId: 'lab' } }),
      (ds) =>
        ds[0]?.targets.some((t) => t.status === 'rejected') === true &&
        ds[0].targets.filter((t) => t.status === 'staged').length === 3,
    )
    expect(deps[0]?.goodToGo).toBe(false)
    expect(deps[0]?.targets.find((t) => t.deviceId === 'light-01')).toMatchObject({
      status: 'rejected',
      reason: 'hash mismatch',
    })
    const p = await fails(
      call('olga', 'launch', { body: { showId: 'demo', revision: 2, zoneClearConfirmed: true } }),
      409,
    )
    expect(p.reasons).toEqual(['light-01: show not staged (rejected)'])
    corrupt.stop()
  })

  it('reverts by restoring an earlier revision as the draft, which goes through review again', async () => {
    const doc = await call('alice', 'getDocument', { params: { id: 'demo' } })
    const restore = (user: string, draftVersion: number) =>
      call(user, 'restoreRevision', { params: { id: 'demo', revision: 1 }, body: { draftVersion } })
    await fails(restore('olga', doc.draftVersion), 403)
    await fails(restore('alice', doc.draftVersion - 1), 409) // someone saved in between
    const restored = await restore('alice', doc.draftVersion)
    expect(restored.name).toBe(show.name)
    const rev = await call('alice', 'publish', {
      params: { id: 'demo' },
      body: { draftVersion: restored.draftVersion, note: 'back to r1' },
    })
    expect(rev).toMatchObject({ revision: 3, status: 'published', signed: false })
    const content = async (revision: number) =>
      (await call('alice', 'getRevision', { params: { id: 'demo', revision } })).content
    expect(await content(3)).toEqual(await content(1))
    await fails(call('olga', 'downloadPackage', { params: { id: 'demo', revision: 3 } }), 409) // not approved yet
  })

  it('keeps a tamper-evident audit trail', async () => {
    const entries = await call('sam', 'listAudit', { query: { limit: 100 } })
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'revision.publish',
        'revision.approve',
        'show.deploy',
        'show.launch',
        'estop.trigger',
        'estop.reset',
        'show.package',
        'draft.restore',
      ]),
    )
    expect((await call('sam', 'verifyAudit')).ok).toBe(true)
    await app.db.query(`update audit_log set actor = 'mallory' where action = 'show.launch'`)
    const broken = await call('sam', 'verifyAudit')
    expect(broken.ok).toBe(false)
    expect(broken.brokenAtSeq).toBeTypeOf('number')
  })
})

describe('several attractions at once', () => {
  let annex: SimFleet
  const status = (environmentId: string) => call('olga', 'environmentStatus', { params: { environmentId } })

  it('runs, launches and e-stops each attraction on its own', async () => {
    const audio = (await call('alice', 'listAssets')).find((a) => a.kind === 'audio')
    await call('alice', 'createDocument', {
      body: { kind: 'environment', locationId: 'hq', id: 'annex', draft: { ...lab, name: 'Annex' } },
    })
    const envRev = await call('alice', 'publish', { params: { id: 'annex' }, body: { draftVersion: 1, note: 'annex' } })
    const draft = JSON.parse(JSON.stringify(makeShow()).replaceAll('a'.repeat(64), audio?.id ?? '')) as ShowDefinition
    draft.environment = { id: 'annex', revision: envRev.revision }
    await call('alice', 'createProject', { body: { id: 'annex-show', draft } })
    for (const [user, role] of [
      ['sam', 'reviewer'],
      ['olga', 'operator'],
    ] as const) {
      await call('alice', 'setProjectMember', { params: { projectId: 'annex-show', user }, body: { role } })
    }
    await call('alice', 'publish', { params: { id: 'annex-show' }, body: { draftVersion: 1, note: '' } })
    await call('sam', 'approveRevision', { params: { id: 'annex-show', revision: 1 }, body: { note: 'ok' } })

    // Same device ids as the lab, different attraction: the gateway keys devices by (attraction, id).
    annex = await startFleet({ apiUrl: url, environmentId: 'annex', provisioningToken: 'dev-provisioning-token' })
    fleets.push(annex)
    await waitFor(
      () => call('olga', 'listDevices', { query: { environmentId: 'annex' } }),
      (ds) => ds.length === 5 && ds.every((d) => d.online),
    )
    await call('olga', 'createDeployment', { body: { showId: 'annex-show', revision: 1 } })
    await waitFor(
      () => status('annex'),
      (s) => s.prepared.some((p) => p.goodToGo),
    )

    const labBefore = await status('lab')
    await call('olga', 'launch', { body: { showId: 'annex-show', revision: 1, zoneClearConfirmed: true } })
    await waitFor(
      () => status('annex'),
      // Consoles stay ready for the operator while the show runs.
      (s) => s.run !== null && s.devices.every((d) => d.kind === 'console' || d.state !== 'ready'),
    )
    expect((await status('lab')).run?.id ?? null).toBe(labBefore.run?.id ?? null)

    await call('olga', 'estop', { body: { environmentId: 'annex', reason: 'test' } })
    await waitFor(
      () => status('annex'),
      (s) => s.devices.every((d) => d.state === 'estopped'),
    )
    const labNow = await status('lab')
    expect(labNow.estop.active).toBe(false)
    expect(labNow.devices.some((d) => d.state === 'estopped')).toBe(false)
    await call('olga', 'resetEstop', { body: { environmentId: 'annex' } })
  })

  it('keeps answering guests between shows until an operator ends standby', async () => {
    const base = (await call('alice', 'getDocument', { params: { id: 'annex-show' } })).draft as ShowDefinition
    const draft: ShowDefinition = {
      ...base,
      name: 'Short',
      durationMs: 800,
      tracks: { motion: {}, lights: {}, audio: {} },
      behaviors: base.behaviors.map((b) => ({ ...b, standby: true })),
    }
    await call('alice', 'createProject', { body: { id: 'annex-short', draft } })
    for (const [user, role] of [
      ['sam', 'reviewer'],
      ['olga', 'operator'],
    ] as const) {
      await call('alice', 'setProjectMember', { params: { projectId: 'annex-short', user }, body: { role } })
    }
    await call('alice', 'publish', { params: { id: 'annex-short' }, body: { draftVersion: 1, note: '' } })
    await call('sam', 'approveRevision', { params: { id: 'annex-short', revision: 1 }, body: { note: 'ok' } })
    await call('olga', 'createDeployment', { body: { showId: 'annex-short', revision: 1 } })
    await waitFor(
      () => status('annex'),
      (s) => s.prepared.some((p) => p.showId === 'annex-short' && p.goodToGo),
    )

    await call('olga', 'launch', { body: { showId: 'annex-short', revision: 1, zoneClearConfirmed: true } })
    await waitFor(
      () => status('annex'),
      (s) => s.run?.status === 'completed' && s.devices.every((d) => d.kind === 'console' || d.state === 'standby'),
    )
    await call('olga', 'simulateSensor', {
      params: { deviceId: 'door' },
      body: { environmentId: 'annex', event: 'enter' },
    })
    const robot = annex.device('robot-01')
    await waitFor(
      () => robot.startedBehaviors.map((b) => b.id),
      (ids) => ids.includes('wave'),
    )
    // Blending from home towards the clip
    await waitFor(
      () => robot.pose.arm_pitch ?? 0,
      (v) => v > 1,
    )

    await call('olga', 'stop', { body: { environmentId: 'annex' } })
    await waitFor(
      () => status('annex'),
      (s) => s.devices.every((d) => d.state === 'ready'),
    )
    expect(robot.pose.arm_pitch).toBe(0)
  })

  it('deletes a project softly: hidden, read-only, off the controllers, recoverable', async () => {
    const id = { params: { projectId: 'annex-short' } }
    const sha = (await call('alice', 'getRevision', { params: { id: 'annex-short', revision: 1 } })).bundleSha256
    const robot = annex.device('robot-01')
    expect(robot.stagedShows.some((s) => s.sha256 === sha)).toBe(true)

    await fails(call('tom', 'deleteProject', id), 404) // not on the team
    await fails(call('olga', 'deleteProject', id), 403) // operator, not owner
    await call('olga', 'launch', { body: { showId: 'annex-short', revision: 1, zoneClearConfirmed: true } })
    await fails(call('alice', 'deleteProject', id), 409) // live
    await call('olga', 'stop', { body: { environmentId: 'annex' } })

    const deleted = await call('alice', 'deleteProject', id)
    expect(deleted).toMatchObject({ deletedBy: 'alice', deletedAt: expect.any(String) })
    expect((await call('alice', 'listProjects')).map((p) => p.id)).not.toContain('annex-short')
    expect((await call('alice', 'listProjects', { query: { status: 'deleted' } })).map((p) => p.id)).toEqual([
      'annex-short',
    ])
    expect((await call('alice', 'listDocuments', { query: { kind: 'show' } })).map((d) => d.id)).not.toContain(
      'annex-short',
    )
    expect((await call('olga', 'getProject', id)).deletedBy).toBe('alice') // members can still read it
    const doc = await call('alice', 'getDocument', { params: { id: 'annex-short' } })
    await fails(
      call('alice', 'saveDraft', {
        params: { id: 'annex-short' },
        body: { kind: 'show', draftVersion: doc.draftVersion, draft: doc.draft as ShowDefinition },
      }),
      409,
    )
    await fails(call('olga', 'createDeployment', { body: { showId: 'annex-short', revision: 1 } }), 409)
    await waitFor(
      () => robot.stagedShows.map((s) => s.sha256),
      (shas) => !shas.includes(sha ?? ''),
    )
    const taken = await fails(
      call('alice', 'createProject', { body: { id: 'annex-short', draft: doc.draft as ShowDefinition } }),
      409,
    )
    expect(taken.detail).toContain('recover it')

    await fails(call('olga', 'restoreProject', id), 403)
    const restored = await call('alice', 'restoreProject', id)
    expect(restored).toMatchObject({ deletedAt: null, deletedBy: null })
    expect((await call('alice', 'listProjects')).map((p) => p.id)).toContain('annex-short')
    await fails(call('alice', 'restoreProject', id), 409) // not deleted
    const actions = (await call('sam', 'listAudit', { query: { limit: 50 } })).map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['project.delete', 'project.restore']))
  })
})

describe('projects and access control', () => {
  it('shares locations and the library with the whole workspace', async () => {
    expect((await call('priya', 'listLocations')).map((l) => l.id)).toEqual(['hq'])
    const docs = await call('priya', 'listDocuments')
    expect(docs.filter((d) => d.kind === 'character').map((d) => d.id)).toContain('robot')
    expect(docs.find((d) => d.id === 'lab')).toMatchObject({ kind: 'environment', locationId: 'hq', projectId: null })
    expect((await call('priya', 'listDevices', { query: { environmentId: 'lab' } })).length).toBeGreaterThan(0)
    // Workspace roles still apply: an operator cannot edit the library, and only admins add locations.
    const robotDoc = await call('olga', 'getDocument', { params: { id: 'robot' } })
    await fails(
      call('olga', 'saveDraft', {
        params: { id: 'robot' },
        body: { kind: 'character', draftVersion: robotDoc.draftVersion, draft: robot },
      }),
      403,
    )
    await fails(call('alice', 'createLocation', { body: { id: 'tokyo', name: 'Tokyo' } }), 403)
  })

  it('hides projects and their shows from non-members', async () => {
    expect(await call('priya', 'listProjects')).toEqual([])
    expect((await call('priya', 'listDocuments', { query: { kind: 'show' } })).length).toBe(0)
    await fails(call('priya', 'getDocument', { params: { id: 'demo' } }), 404)
    await fails(call('priya', 'getProject', { params: { projectId: 'demo' } }), 404)
    await fails(call('priya', 'listRevisions', { params: { id: 'demo' } }), 404)
  })

  it('creates shows only through a project, one show per project', async () => {
    const draft = (await call('alice', 'getDocument', { params: { id: 'demo' } })).draft as ShowDefinition
    await fails(call('alice', 'createProject', { body: { id: 'demo', draft } }), 409)
    await fails(
      call('alice', 'createProject', {
        body: { id: 'ghost', draft: { ...draft, environment: { id: 'lab', revision: 99 } } },
      }),
      400,
    )
    await fails(call('alice', 'createDocument', { body: { kind: 'show', id: 'loose', draft } as never }), 400)
  })

  it('grants exactly what the project role allows', async () => {
    await call('alice', 'setProjectMember', { params: { projectId: 'demo', user: 'priya' }, body: { role: 'viewer' } })
    const doc = await call('priya', 'getDocument', { params: { id: 'demo' } })
    expect(doc.projectId).toBe('demo')
    await fails(
      call('priya', 'saveDraft', {
        params: { id: 'demo' },
        body: { kind: 'show', draftVersion: doc.draftVersion, draft: doc.draft as ShowDefinition },
      }),
      403,
    )
    // tom is an engineer (may deploy in general) but only an editor here: no fleet operations.
    await fails(call('tom', 'createDeployment', { body: { showId: 'demo', revision: 1 } }), 403)
    await fails(
      call('tom', 'setProjectMember', { params: { projectId: 'demo', user: 'priya' }, body: { role: 'owner' } }),
      403,
    )
    const project = await call('olga', 'getProject', { params: { projectId: 'demo' } })
    expect(project.myRole).toBe('operator')
    expect(project.members.map((m) => [m.user, m.role])).toContainEqual(['priya', 'viewer'])
  })

  it('keeps at least one owner and audits membership changes', async () => {
    await fails(call('alice', 'removeProjectMember', { params: { projectId: 'demo', user: 'alice' } }), 409)
    await call('alice', 'removeProjectMember', { params: { projectId: 'demo', user: 'priya' } })
    await fails(call('priya', 'getDocument', { params: { id: 'demo' } }), 404)
    const audit = await call('sam', 'listAudit', { query: { limit: 300 } })
    expect(audit.map((e) => e.action)).toEqual(
      expect.arrayContaining(['location.create', 'project.create', 'project.member.set', 'project.member.remove']),
    )
  })
})

describe('characters fixture sanity', () => {
  it('uses the shared playback fixtures', () => {
    expect(characters.get('robot@1')).toBe(robot)
  })
})
