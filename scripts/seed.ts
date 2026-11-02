/**
 * Seeds a complete demo through the public API (so every check applies):
 * assets -> characters -> environment -> two shows -> safety approval.
 * Idempotent: existing documents and revisions are left alone.
 *
 *   bun run seed                      # against http://localhost:4000
 *   STUDIO_API_URL=http://host:4000 bun run seed
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  API_PREFIX,
  buildPath,
  contract,
  type EnvironmentDefinition,
  type Interp,
  type LightKey,
  type MotionKey,
  type Problem,
  type RouteInput,
  type RouteKey,
  type RouteOutput,
  type ShowDefinition,
} from '@studio/schema'
import { bot, definitionOf, dragon } from './samples.ts'

const base = process.env.STUDIO_API_URL ?? 'http://localhost:4000'
const samples = resolve(dirname(fileURLToPath(import.meta.url)), '../samples')
let token = ''

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(
      `${status} ${problem.title}: ${problem.detail ?? ''}\n${JSON.stringify(problem.issues ?? problem.reasons ?? '', null, 2)}`,
    )
  }
}

async function call<K extends RouteKey>(key: K, input?: RouteInput<K>): Promise<RouteOutput<K>> {
  const def = contract[key]
  const i = (input ?? {}) as { params?: Record<string, unknown>; body?: unknown }
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  let body: RequestInit['body']
  if (i.body instanceof FormData) body = i.body
  else if (i.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(i.body)
  }
  const res = await fetch(`${base}${API_PREFIX}${buildPath(def.path, i.params)}`, { method: def.method, headers, body })
  if (!res.ok) throw new ApiError(res.status, (await res.json()) as Problem)
  return (await res.json()) as RouteOutput<K>
}

const ignoreConflict = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return null
    throw err
  }
}

const login = async (name: string, roles: ('engineer' | 'safety' | 'operator' | 'admin')[]) => {
  token = (await call('devLogin', { body: { name, roles } })).token
}

async function upload(file: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([readFileSync(join(samples, file))]), file.split('/').pop())
  return (await call('uploadAsset', { body: form })).id
}

async function publish(id: string, note: string): Promise<number> {
  const doc = await call('getDocument', { params: { id } })
  const rev = await ignoreConflict(call('publish', { params: { id }, body: { draftVersion: doc.draftVersion, note } }))
  const latest = rev?.revision ?? (await call('getDocument', { params: { id } })).latestRevision
  if (!latest) throw new Error(`${id} has no revision`)
  return latest
}

const PROJECT = 'dragons-hoard'

async function upsertDoc(body: Omit<RouteInput<'createDocument'>['body'], 'projectId'>) {
  const created = await ignoreConflict(
    call('createDocument', { body: { ...body, projectId: PROJECT } as RouteInput<'createDocument'>['body'] }),
  )
  console.log(created ? `created ${body.kind} ${body.id}` : `kept ${body.kind} ${body.id}`)
}

async function ensureProject(
  id: string,
  name: string,
  description: string,
  members: [string, 'editor' | 'reviewer' | 'operator' | 'viewer'][],
) {
  const created = await ignoreConflict(call('createProject', { body: { id, name, description } }))
  for (const [user, role] of members)
    await call('setProjectMember', { params: { projectId: id, user }, body: { role } })
  console.log(created ? `created project ${id}` : `kept project ${id}`)
}

// ---- keyframe helpers --------------------------------------------------------------------
const k = (t: number, v: number, interp: Interp = 'ease'): MotionKey => ({ t, v, interp })
const l = (t: number, color: string, intensity: number, interp: Interp = 'linear'): LightKey => ({
  t,
  color,
  intensity,
  interp,
})

await login('alice', ['engineer'])
await ensureProject(PROJECT, "The Dragon's Hoard", 'Walk-through dark ride: a dragon wakes on its treasure as guests pass.', [
  ['priya', 'editor'],
  ['sam', 'reviewer'],
  ['olga', 'operator'],
  ['tom', 'viewer'],
])
await ensureProject('riverboat', 'Riverboat Expedition', 'Concept phase: figures for the river cruise. Operators are not on it yet.', [
  ['priya', 'editor'],
])
const assets = {
  dragon: await upload('dragon.glb'),
  bot: await upload('explorer-bot.glb'),
  roar: await upload('audio/roar.wav'),
  chime: await upload('audio/chime.wav'),
  theme: await upload('audio/theme.wav'),
}
console.log('uploaded assets')

await upsertDoc({ kind: 'character', id: dragon.id, draft: definitionOf(dragon, assets.dragon) })
await upsertDoc({ kind: 'character', id: bot.id, draft: definitionOf(bot, assets.bot) })
const dragonRev = await publish(dragon.id, 'Initial definition from URDF')
const botRev = await publish(bot.id, 'Initial definition from URDF')

const lair: EnvironmentDefinition = {
  schemaVersion: 1,
  name: "Dragon's Lair",
  description:
    'Indoor dark ride scene: a dragon on a rock, a guide robot, three fixtures, two speaker zones, a door sensor and a guest button.',
  stage: { min: [-6, 0, -4], max: [6, 4.5, 4] },
  keepOut: [{ name: 'guest-walkway', box: { min: [-6, 0, 4.3], max: [6, 2.6, 7] } }],
  ambient: { color: '#1e293b', intensity: 0.35 },
  palette: [
    { name: 'Ember', color: '#ff6b00' },
    { name: 'Fire', color: '#ff2200' },
    { name: 'Gold', color: '#ffb347' },
    { name: 'Night', color: '#1c3faa' },
    { name: 'Warm white', color: '#ffd8a8' },
  ],
  placements: [
    {
      deviceId: 'dragon-01',
      name: 'Ember',
      character: { id: dragon.id, revision: dragonRev },
      position: [-1.8, 0, -0.5],
      rotationY: 20,
    },
    {
      deviceId: 'bot-01',
      name: 'Guide bot',
      character: { id: bot.id, revision: botRev },
      position: [3, 0, 1],
      rotationY: -25,
    },
  ],
  lights: [
    {
      deviceId: 'light-01',
      name: 'Dragon key',
      position: [-3.5, 4.2, 3],
      target: [-1.8, 1.2, -0.5],
      dmx: { universe: 0, address: 1 },
    },
    {
      deviceId: 'light-02',
      name: 'Bot key',
      position: [4.5, 4, 3.5],
      target: [3, 1, 1],
      dmx: { universe: 0, address: 9 },
    },
    {
      deviceId: 'light-03',
      name: 'Back wash',
      position: [0, 4.3, -3.6],
      target: [0, 1, 0],
      dmx: { universe: 0, address: 17 },
    },
  ],
  audio: [
    { deviceId: 'audio-01', name: 'Main speakers', position: [0, 3, 3.6], maxVolumeDb: -3 },
    { deviceId: 'audio-02', name: 'Dragon throat', position: [-1.8, 1.5, 0], maxVolumeDb: -6 },
  ],
  sensors: [
    { deviceId: 'door', name: 'Entry door', type: 'presence', position: [0, 0.6, 5.6], range: 1.4 },
    { deviceId: 'button', name: 'Guest button', type: 'button', position: [3.8, 1, 4.8], range: 0.3 },
  ],
}
await upsertDoc({ kind: 'environment', id: 'dragons-lair', draft: lair })
const lairRev = await publish('dragons-lair', 'Initial layout')

const awakens: ShowDefinition = {
  schemaVersion: 1,
  name: 'The Dragon Awakens',
  description: 'Dragon wakes, roars, flaps and looks around; the guide bot waves goodbye.',
  environment: { id: 'dragons-lair', revision: lairRev },
  durationMs: 45_000,
  tracks: {
    motion: {
      'dragon-01': {
        neck_pitch: [k(4000, 0), k(6000, 30), k(38_000, 30), k(42_000, 0)],
        head_yaw: [k(6000, 0), k(8000, 45), k(11_000, -45), k(13_000, 0)],
        jaw_open: [k(13_500, 0, 'linear'), k(14_000, 30), k(16_000, 30), k(16_800, 0)],
        wing_l_flap: [k(17_000, 0), k(18_000, 45), k(19_200, -10), k(20_400, 45), k(21_600, -10), k(22_800, 0)],
        wing_r_flap: [k(17_000, 0), k(18_000, 45), k(19_200, -10), k(20_400, 45), k(21_600, -10), k(22_800, 0)],
        body_yaw: [k(24_000, 0), k(27_000, 40), k(32_000, -40), k(35_000, 0)],
        tail_yaw: [k(24_000, 0), k(26_000, 30), k(28_000, -30), k(30_000, 30), k(32_000, 0)],
      },
      'bot-01': {
        head_pan: [k(30_000, 0), k(32_000, 40), k(36_000, -40), k(39_000, 0)],
        head_tilt: [k(31_000, 0), k(32_500, 15), k(38_000, 15), k(39_500, 0)],
        shoulder_r: [k(30_000, 0), k(33_000, 120), k(37_000, 120), k(40_000, 0)],
        elbow_r: [
          k(33_000, 0, 'linear'),
          k(33_800, 60, 'linear'),
          k(34_600, 0, 'linear'),
          k(35_400, 60, 'linear'),
          k(36_200, 0),
        ],
      },
    },
    lights: {
      'light-01': [
        l(4000, '#ff6b00', 0),
        l(6000, '#ff6b00', 0.8, 'step'),
        l(14_000, '#ff2200', 1, 'step'),
        l(16_800, '#ffb347', 0.7),
        l(40_000, '#ffb347', 0.6),
        l(45_000, '#ffb347', 0),
      ],
      'light-02': [
        l(30_000, '#ffd8a8', 0),
        l(31_000, '#ffd8a8', 0.8),
        l(41_000, '#ffd8a8', 0.8),
        l(43_000, '#ffd8a8', 0),
      ],
      'light-03': [l(0, '#1c3faa', 0), l(4000, '#1c3faa', 0.6), l(44_000, '#1c3faa', 0.6), l(45_000, '#1c3faa', 0)],
    },
    audio: {
      'audio-01': [
        { id: 'theme', t: 0, assetId: assets.theme, volumeDb: -14, label: 'Theme' },
        { id: 'chime', t: 33_000, assetId: assets.chime, volumeDb: -10, label: 'Goodbye chime' },
      ],
      'audio-02': [{ id: 'roar', t: 14_000, assetId: assets.roar, volumeDb: -8, label: 'Roar' }],
    },
  },
  behaviors: [
    {
      id: 'notice-guest',
      name: 'Dragon notices a guest',
      enabled: true,
      trigger: { sensorId: 'door', event: 'enter' },
      window: null,
      blendMs: 2500,
      cooldownMs: 8000,
      durationMs: 2500,
      tracks: {
        motion: {
          'dragon-01': {
            head_yaw: [k(0, 25), k(2500, 25)],
            jaw_open: [k(0, 0, 'linear'), k(600, 28, 'linear'), k(1800, 28, 'linear'), k(2500, 0)],
          },
        },
        lights: { 'light-01': [l(0, '#ff2200', 1)] },
        audio: { 'audio-02': [{ id: 'snarl', t: 300, assetId: assets.roar, volumeDb: -6, label: 'Snarl' }] },
      },
    },
    {
      id: 'bot-waves',
      name: 'Bot waves back',
      enabled: true,
      trigger: { sensorId: 'button', event: 'press' },
      window: null,
      blendMs: 2400,
      cooldownMs: 4000,
      durationMs: 2400,
      tracks: {
        motion: {
          'bot-01': {
            shoulder_l: [k(0, 110), k(2400, 110)],
            elbow_l: [
              k(0, 20, 'linear'),
              k(600, 70, 'linear'),
              k(1200, 20, 'linear'),
              k(1800, 70, 'linear'),
              k(2400, 20),
            ],
          },
        },
        lights: {},
        audio: { 'audio-01': [{ id: 'hello', t: 0, assetId: assets.chime, volumeDb: -10, label: 'Hello' }] },
      },
    },
  ],
}

const nightWatch: ShowDefinition = {
  schemaVersion: 1,
  name: 'Night Watch',
  description: 'Quiet loop between rides: the dragon breathes, lights glow softly.',
  environment: { id: 'dragons-lair', revision: lairRev },
  durationMs: 20_000,
  tracks: {
    motion: {
      'dragon-01': {
        neck_pitch: [k(1000, 0), k(6000, 10), k(11_000, 0), k(16_000, 10), k(19_500, 0)],
        tail_yaw: [k(2000, 0), k(7000, 15), k(12_000, -15), k(17_000, 0)],
      },
      'bot-01': { head_pan: [k(3000, 0), k(8000, -30), k(14_000, 30), k(19_000, 0)] },
    },
    lights: {
      'light-03': [l(0, '#1c3faa', 0), l(2000, '#1c3faa', 0.5), l(18_000, '#1c3faa', 0.5), l(20_000, '#1c3faa', 0)],
      'light-01': [
        l(0, '#ff6b00', 0),
        l(5000, '#ff6b00', 0.25),
        l(10_000, '#ff6b00', 0.1),
        l(15_000, '#ff6b00', 0.25),
        l(20_000, '#ff6b00', 0),
      ],
    },
    audio: {},
  },
  behaviors: [],
}

await upsertDoc({ kind: 'show', id: 'dragon-awakens', draft: awakens })
await upsertDoc({ kind: 'show', id: 'night-watch', draft: nightWatch })
const awakensRev = await publish('dragon-awakens', 'First full choreography')
const nightRev = await publish('night-watch', 'Idle loop')

await login('sam', ['safety'])
for (const [id, revision] of [
  ['dragon-awakens', awakensRev],
  ['night-watch', nightRev],
] as const) {
  const r = await ignoreConflict(
    call('approveRevision', { params: { id, revision }, body: { note: 'Reviewed limits and sensor responses' } }),
  )
  console.log(
    r
      ? `approved ${id}@${revision} (bundle ${r.bundleSha256?.slice(0, 8)} signed)`
      : `${id}@${revision} already reviewed`,
  )
}

console.log(`
Seeded. Next:
  bun run fleet-sim --env dragons-lair         # bring the simulated attraction online
  open http://localhost:5173                  # sign in as Olga (operator) -> Fleet & deploy -> Deploy
`)
