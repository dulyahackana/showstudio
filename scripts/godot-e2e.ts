/**
 * End to end with the Godot simulator as the attraction: fresh API + seed, Godot
 * headless provisions and connects nine controllers, then the operator flow runs
 * through the public API: deploy -> good to go -> launch -> guest at the door ->
 * local sensor response -> e-stop -> reset. Exits non-zero on any failure.
 *
 *   bun run e2e:godot
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  API_PREFIX,
  buildPath,
  contract,
  type EnvironmentStatus,
  type Problem,
  type RouteInput,
  type RouteKey,
  type RouteOutput,
} from '@studio/schema'
import { findGodot, godotArgs } from './godot.ts'

const root = resolve(import.meta.dirname, '..')
const port = Number(process.env.E2E_PORT ?? 4310)
const base = `http://localhost:${port}`
const environmentId = 'dragons-lair'
const show = { showId: 'dragon-awakens', revision: 1 }
const dataDir = mkdtempSync(join(tmpdir(), 'studio-godot-e2e-'))
const children: ChildProcess[] = []
const godotLines: string[] = []
let token = ''

const stamp = () => new Date().toISOString().slice(11, 23)
const step = (msg: string) => console.log(`${stamp()} ✓ ${msg}`)

function cleanup() {
  for (const c of children) c.kill('SIGTERM')
  rmSync(dataDir, { recursive: true, force: true })
}

async function call<K extends RouteKey>(key: K, input?: RouteInput<K>): Promise<RouteOutput<K>> {
  const def = contract[key]
  const i = (input ?? {}) as { params?: Record<string, unknown>; body?: unknown }
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  if (i.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${base}${API_PREFIX}${buildPath(def.path, i.params)}`, {
    method: def.method,
    headers,
    body: i.body === undefined ? undefined : JSON.stringify(i.body),
  })
  if (!res.ok) {
    const p = (await res.json()) as Problem
    throw new Error(`${key}: ${res.status} ${p.title} ${p.detail ?? ''} ${JSON.stringify(p.reasons ?? '')}`)
  }
  return (await res.json()) as RouteOutput<K>
}

async function waitFor<T>(what: string, fn: () => Promise<T> | T, ok: (v: T) => boolean, timeoutMs = 30_000) {
  const start = Date.now()
  let last: T | undefined
  while (Date.now() - start < timeoutMs) {
    const scriptError = godotLines.find((l) => l.includes('SCRIPT ERROR'))
    if (scriptError) throw new Error(`Godot reported: ${scriptError}`)
    try {
      last = await fn()
      if (ok(last)) return last
    } catch {
      /* not ready yet */
    }
    await Bun.sleep(250)
  }
  throw new Error(`timed out waiting for ${what}; last: ${JSON.stringify(last)?.slice(0, 800)}`)
}

const status = () => call('environmentStatus', { params: { environmentId } })
const godotSaid = (pattern: RegExp) => godotLines.some((l) => pattern.test(l))

function poses(device: string): string[] {
  return godotLines.filter((l) => l.includes(`▶ ${device} `)).map((l) => l.slice(l.indexOf('▶')))
}

try {
  const api = spawn(process.execPath, ['src/server.ts'], {
    cwd: join(root, 'apps/api'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, LOG_LEVEL: 'warn', LAUNCH_LEAD_MS: '1500' },
    stdio: 'inherit',
  })
  children.push(api)
  await waitFor(
    'the API',
    () => fetch(`${base}${API_PREFIX}/health`),
    (r) => r.ok,
  )
  const seed = spawn(process.execPath, ['scripts/seed.ts'], {
    cwd: root,
    env: { ...process.env, STUDIO_API_URL: base },
    stdio: 'ignore',
  })
  const seeded = await new Promise<number | null>((done) => seed.on('exit', done))
  if (seeded !== 0) throw new Error(`seed exited ${seeded}`)
  step('API up and seeded')

  const godot = spawn(
    findGodot(),
    godotArgs('run', ['--headless', '--api', base, '--env', environmentId, '--data', join(dataDir, 'godot')]),
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  children.push(godot)
  for (const stream of [godot.stdout, godot.stderr]) {
    let buffer = ''
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        godotLines.push(line)
        if (process.env.VERBOSE) console.log(`  [godot] ${line}`)
      }
    })
  }
  godot.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`godot exited ${code}`)
  })

  token = (await call('devLogin', { body: { name: 'olga', roles: ['operator', 'engineer'] } })).token
  await waitFor(
    'nine Godot controllers online',
    () => call('listDevices', { query: { environmentId } }),
    (ds) => ds.length === 9 && ds.every((d) => d.online && d.firmware.startsWith('godot-sim')),
  )
  step('Godot provisioned and connected 9 controllers (dolls, lights, audio, sensors)')

  await call('createDeployment', { body: show })
  const ready = await waitFor('good to go', status, (s: EnvironmentStatus) =>
    s.prepared.some((p) => p.showId === show.showId && p.goodToGo),
  )
  const prepared = ready.prepared.find((p) => p.showId === show.showId)
  step(
    `deployed: every controller verified hash, signature, schema and limits (${prepared?.stagedOn}/${prepared?.targets})`,
  )

  await call('launch', { body: { ...show, zoneClearConfirmed: true } })
  await waitFor(
    'all controllers running',
    status,
    (s) => s.run?.status === 'running' && s.devices.every((d) => d.state === 'running'),
  )
  step('launched: all controllers running from their local copies')

  await waitFor(
    'figures moving',
    () => poses('dragon-01'),
    (p) => new Set(p).size >= 2,
    15_000,
  )
  step(`figure motion sampled in Godot: ${poses('dragon-01').at(-1)}`)
  await waitFor('the theme cue', () => godotSaid(/♪ Theme/), Boolean)
  step('audio controller reached its first cue (Theme)')

  await call('simulateSensor', { params: { deviceId: 'door' }, body: { environmentId, event: 'enter' } })
  await waitFor('the sensor response', () => godotSaid(/-> behavior "notice-guest"/), Boolean, 10_000)
  await waitFor('the snarl cue', () => godotSaid(/♪ Snarl/), Boolean, 10_000)
  step('guest at the door: local show controller started "notice-guest" (snarl cue played)')

  await call('estop', { body: { environmentId, reason: 'e2e' } })
  await waitFor('every controller e-stopped', status, (s) => s.devices.every((d) => d.state === 'estopped'), 10_000)
  step('e-stop latched on every controller')
  await call('resetEstop', { body: { environmentId } })
  await waitFor('reset', status, (s) => s.devices.every((d) => d.state === 'ready'), 10_000)
  step('reset by the operator: controllers ready, shows still staged')

  console.log('\nGodot end-to-end passed')
  cleanup()
  process.exit(0)
} catch (err) {
  console.error(`\nGodot end-to-end FAILED: ${err instanceof Error ? err.message : err}`)
  console.error('--- last Godot output ---')
  console.error(godotLines.slice(-40).join('\n'))
  cleanup()
  process.exit(1)
}
