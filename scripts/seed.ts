/**
 * Seeds a complete demo through the public API (so every check applies):
 * location -> library (assets, characters) -> environments -> projects (one show each,
 * with its team) -> safety approval. Idempotent: existing documents and revisions are
 * left alone.
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
  type SceneryItem,
  type ShowDefinition,
  type Vec3,
} from '@studio/schema'
import { burglar, chest, definitionOf, dragon, FIGURES, type Figure, wizard } from './samples.ts'

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

const LOCATION = 'hollow-hills'

async function upsertDoc(body: RouteInput<'createDocument'>['body']) {
  const created = await ignoreConflict(call('createDocument', { body }))
  console.log(created ? `created ${body.kind} ${body.id}` : `kept ${body.kind} ${body.id}`)
}

type Team = [string, 'editor' | 'reviewer' | 'operator' | 'viewer'][]

/** A project is one show: create it with its first draft, then give it a team. */
async function ensureProject(id: string, draft: ShowDefinition, team: Team) {
  const created = await ignoreConflict(call('createProject', { body: { id, draft } }))
  for (const [user, role] of team) await call('setProjectMember', { params: { projectId: id, user }, body: { role } })
  console.log(created ? `created project ${id}` : `kept project ${id}`)
}

// Show engineers author, Sam signs off, Olga runs it in the park.
const TEAM: Team = [
  ['priya', 'editor'],
  ['sam', 'reviewer'],
  ['olga', 'operator'],
]

// ---- keyframe helpers --------------------------------------------------------------------
const k = (t: number, v: number, interp: Interp = 'ease'): MotionKey => ({ t, v, interp })
const l = (t: number, color: string, intensity: number, interp: Interp = 'linear'): LightKey => ({
  t,
  color,
  intensity,
  interp,
})

await login('admin', ['admin'])
const location = await ignoreConflict(
  call('createLocation', {
    body: {
      id: LOCATION,
      name: 'Hollow Hills',
      region: 'Lumen Parks Orlando · Florida',
      description: "Fantasy land with two attractions side by side: The Dragon's Hoard and Burrow Hollow.",
    },
  }),
)
console.log(location ? `created location ${LOCATION}` : `kept location ${LOCATION}`)

await login('alice', ['engineer'])
const assets = {
  roar: await upload('audio/roar.mp3'),
  snarl: await upload('audio/snarl.mp3'),
  coins: await upload('audio/coins.mp3'),
  magic: await upload('audio/magic.mp3'),
  chime: await upload('audio/chime.mp3'),
  doorbell: await upload('audio/doorbell.mp3'),
  knock: await upload('audio/knock.mp3'),
  themeLair: await upload('audio/theme-lair.mp3'),
  themeBurrow: await upload('audio/theme-burrow.mp3'),
}
const models: Record<string, string> = {}
for (const f of FIGURES) models[f.id] = await upload(f.model)
const props: Record<string, string> = {}
for (const name of [
  'cliff',
  'cave-mouth',
  'rock-tall',
  'rock-large',
  'stones',
  'pillar',
  'column-ruin',
  'round-door',
  'mushrooms',
  'coin-piles',
  'gold-rocks',
  'coin-stack',
  'sword-shield',
  'chest-wood',
  'torch',
  'barrel',
  'rubble',
])
  props[name] = await upload(`scenery/${name}.glb`)
console.log('uploaded assets')

const rev: Record<string, number> = {}
for (const f of FIGURES) {
  await upsertDoc({ kind: 'character', id: f.id, draft: definitionOf(f, models[f.id] ?? null) })
  rev[f.id] = await publish(f.id, 'Initial definition (joints bound to the rig)')
}
const pin = (f: Figure) => ({ id: f.id, revision: rev[f.id] ?? 1 })

let n = 0
const prop = (name: string, position: Vec3, rotationY = 0, scale = 1): SceneryItem => ({
  id: `${name}-${++n}`,
  name,
  model: { assetId: props[name] ?? '' },
  position,
  rotationY,
  scale,
})

const lair: EnvironmentDefinition = {
  schemaVersion: 1,
  name: "The Dragon's Hoard",
  description:
    'Walk-through cavern: a dragon asleep on its treasure, a wizard at the ledge, a halfling burglar by the burrow door. Four fixtures, two speaker zones, a door sensor and a guest bell.',
  stage: { min: [-6.5, 0, -4.5], max: [6.5, 5, 4] },
  keepOut: [{ name: 'guest-walkway', box: { min: [-6.5, 0, 4.3], max: [6.5, 2.6, 6.6] } }],
  ambient: { color: '#1b2440', intensity: 0.3 },
  palette: [
    { name: 'Dragonfire', color: '#ff3300' },
    { name: 'Ember', color: '#ff7a1a' },
    { name: 'Hoard gold', color: '#ffc861' },
    { name: 'Moonlight', color: '#2a4fd6' },
    { name: 'Wizard white', color: '#e8f0ff' },
  ],
  placements: [
    { deviceId: 'dragon-01', name: 'Ember', character: pin(dragon), position: [-1.2, 0, -1.4], rotationY: 25 },
    { deviceId: 'chest-01', name: 'Hoard chest', character: pin(chest), position: [1.9, 0, 1.6], rotationY: -20 },
    { deviceId: 'wizard-01', name: 'Wizard', character: pin(wizard), position: [3.7, 0, -0.5], rotationY: -35 },
    { deviceId: 'burglar-01', name: 'Burglar', character: pin(burglar), position: [-4.3, 0, 1.7], rotationY: 30 },
  ],
  lights: [
    {
      deviceId: 'light-01',
      name: 'Dragon key',
      position: [-3.8, 4.6, 2.8],
      target: [-1.2, 1.4, -1.4],
      dmx: { universe: 0, address: 1 },
    },
    {
      deviceId: 'light-02',
      name: 'Hoard glow',
      position: [1.6, 4.4, 3.2],
      target: [1.7, 0.4, 1.3],
      dmx: { universe: 0, address: 9 },
    },
    {
      deviceId: 'light-03',
      name: 'Wizard rim',
      position: [5.8, 4.4, 2.4],
      target: [3.7, 1.4, -0.5],
      dmx: { universe: 0, address: 17 },
    },
    {
      deviceId: 'light-04',
      name: 'Moon wash',
      position: [0, 4.8, -4.2],
      target: [0, 0.6, 0.8],
      dmx: { universe: 0, address: 25 },
    },
  ],
  audio: [
    { deviceId: 'audio-01', name: 'Cavern speakers', position: [0, 3.4, 3.8], maxVolumeDb: -3 },
    { deviceId: 'audio-02', name: 'Dragon throat', position: [-1.2, 1.8, -0.6], maxVolumeDb: -6 },
  ],
  sensors: [
    { deviceId: 'door', name: 'Entry door', type: 'presence', position: [-3.5, 0.6, 5.4], range: 1.3 },
    { deviceId: 'button', name: 'Guest bell', type: 'button', position: [3.8, 1, 4.6], range: 0.3 },
  ],
  consoles: [{ deviceId: 'console-01', name: 'Operator console', position: [5.7, 0, 5.3], rotationY: -25 }],
  scenery: [
    // cavern walls
    prop('cliff', [-4.9, 0, -4.7]),
    prop('cave-mouth', [-1.6, 0, -4.8]),
    prop('cliff', [1.6, 0, -4.7], 0, 1.1),
    prop('cliff', [4.9, 0, -4.6], 0, 0.95),
    prop('rock-tall', [-6.3, 0, -2.2], 40, 1.2),
    prop('rock-tall', [6.3, 0, -1.6], -30, 1.1),
    prop('rock-large', [5.6, 0, 0.6], 70),
    prop('stones', [-2.8, 0, 3.1], 20, 0.8),
    // the hoard: low, so the dragon reads above it
    prop('gold-rocks', [-0.6, 0, -0.1], 10, 1.3),
    prop('coin-piles', [0.7, 0, -0.7], 0, 0.55),
    prop('coin-piles', [-3.1, 0, 0.1], 40, 0.65),
    prop('coin-piles', [-2.4, 0, -3.2], 75, 0.75),
    prop('gold-rocks', [0.9, 0, -2.3], 20),
    prop('coin-stack', [3.0, 0, 0.9], 15),
    prop('coin-stack', [0.2, 0, 2.0], -30, 0.8),
    prop('sword-shield', [2.1, 0, -1.4], -35),
    prop('chest-wood', [-3.2, 0, 1.1], 35),
    // ruins and the wizard's corner
    prop('pillar', [-5.3, 0, 0.2], 0, 0.85),
    prop('pillar', [5.5, 0, -2.8], 0, 0.85),
    prop('column-ruin', [2.9, 0, 2.5], 15),
    prop('rubble', [3.0, 0, -3.5], 10),
    prop('torch', [-3.3, 0, -3.4]),
    prop('torch', [2.5, 0, -3.5]),
    prop('torch', [5.0, 0, 1.6]),
    prop('barrel', [5.2, 0, 2.6], 20),
    prop('barrel', [6.0, 0, 2.0], -15, 0.85),
    // the burrow
    prop('round-door', [-5.9, 0, 2.6], 70),
    prop('mushrooms', [-5.0, 0, 3.4]),
    prop('mushrooms', [-6.0, 0, 3.7], 40, 0.8),
  ],
}
await upsertDoc({ kind: 'environment', id: 'dragons-lair', locationId: LOCATION, draft: lair })
const lairRev = await publish('dragons-lair', 'Initial layout')

const cue = (id: string, t: number, assetId: string, volumeDb: number, label: string) => ({
  id,
  t,
  assetId,
  volumeDb,
  label,
})

const awakens: ShowDefinition = {
  schemaVersion: 1,
  name: 'The Dragon Awakens',
  description:
    'The burglar sneaks in, the chest creaks open, the dragon wakes and roars; the wizard raises his staff and the burglar waves goodbye.',
  environment: { id: 'dragons-lair', revision: lairRev },
  durationMs: 45_000,
  tracks: {
    motion: {
      'burglar-01': {
        head_turn: [
          k(3000, 0),
          k(5000, -50),
          k(7000, 40),
          k(9000, 0),
          k(36_000, 0),
          k(37_000, 30),
          k(42_000, 30),
          k(44_000, 0),
        ],
        lean: [k(3000, 0), k(5000, 25), k(10_000, 25), k(12_000, 0), k(22_000, 0), k(23_500, -12), k(26_000, 0)],
        torso_turn: [k(21_800, 0), k(23_000, -35), k(35_000, -35), k(37_000, 0)],
        wave_arm: [k(36_000, -70), k(38_000, 60), k(41_000, 60), k(43_000, -70)],
        wave_elbow: [
          k(38_000, 15, 'linear'),
          k(38_600, 80, 'linear'),
          k(39_200, 15, 'linear'),
          k(39_800, 80, 'linear'),
          k(40_400, 15),
          k(41_000, 15),
        ],
      },
      'chest-01': {
        lid_open: [k(8000, 0), k(11_000, 70), k(39_000, 70), k(43_000, 0)],
      },
      'dragon-01': {
        neck_raise: [k(12_000, 0), k(15_000, 30), k(30_000, 30), k(34_000, 10), k(38_000, 10), k(43_000, 0)],
        head_pitch: [k(14_000, 0), k(16_000, 15), k(30_000, 15), k(33_000, -10), k(38_000, -10), k(43_000, 0)],
        neck_turn: [k(15_000, 0), k(17_000, 35), k(19_500, -30), k(21_500, 0)],
        jaw_open: [k(21_500, 0, 'linear'), k(22_000, 32), k(24_000, 32), k(24_800, 0)],
        wing_l: [k(21_500, 0), k(22_800, 40), k(24_200, -5), k(25_600, 40), k(27_000, 0)],
        wing_r: [k(21_500, 0), k(22_800, 40), k(24_200, -5), k(25_600, 40), k(27_000, 0)],
        tail_sway: [k(12_000, 0), k(14_000, 20), k(16_000, -20), k(18_000, 20), k(20_000, 0)],
        tail_curl: [k(21_500, 0), k(23_000, 25), k(26_000, -20), k(29_000, 0)],
      },
      'wizard-01': {
        torso_turn: [k(25_000, 0), k(27_000, -25), k(36_000, -25), k(38_000, 0)],
        head_nod: [k(28_000, 0), k(29_000, -15), k(34_000, -15), k(36_000, 0)],
        head_turn: [k(14_000, 0), k(16_000, 30), k(24_000, 30), k(26_000, 0)],
        staff_raise: [k(26_000, -70), k(29_000, 45), k(34_000, 45), k(38_000, -70)],
        staff_elbow: [k(26_000, 15), k(29_000, 60), k(34_000, 60), k(38_000, 15)],
        free_arm: [k(28_000, -70), k(30_000, -20), k(34_000, -20), k(36_000, -70)],
      },
    },
    lights: {
      'light-04': [l(0, '#2a4fd6', 0), l(3000, '#2a4fd6', 0.55), l(42_000, '#2a4fd6', 0.55), l(45_000, '#2a4fd6', 0)],
      'light-02': [
        l(8000, '#ffb347', 0),
        l(11_000, '#ffc861', 0.9),
        l(40_000, '#ffc861', 0.9),
        l(43_000, '#ffb347', 0),
      ],
      'light-01': [
        l(12_000, '#ff7a1a', 0),
        l(15_000, '#ff7a1a', 0.7, 'step'),
        l(21_500, '#ff3300', 1),
        l(25_000, '#ff7a1a', 0.8),
        l(40_000, '#ff7a1a', 0.6),
        l(44_000, '#ff7a1a', 0),
      ],
      'light-03': [
        l(25_000, '#9ec5ff', 0),
        l(27_000, '#9ec5ff', 0.6, 'step'),
        l(29_000, '#e8f0ff', 1),
        l(31_000, '#9ec5ff', 0.7),
        l(38_000, '#9ec5ff', 0.6),
        l(40_000, '#9ec5ff', 0),
      ],
    },
    audio: {
      'audio-01': [
        cue('theme', 0, assets.themeLair, -14, 'Theme'),
        cue('coins', 9500, assets.coins, -12, 'Coins spill'),
        cue('magic', 29_000, assets.magic, -10, 'Staff magic'),
        cue('chime', 40_000, assets.chime, -12, 'Goodbye chime'),
      ],
      'audio-02': [cue('roar', 21_500, assets.roar, -6, 'Roar')],
    },
  },
  behaviors: [
    {
      id: 'notice-guest',
      name: 'Dragon notices a guest',
      enabled: true,
      trigger: { sensorId: 'door', event: 'enter' },
      window: null,
      standby: true,
      blendMs: 2500,
      cooldownMs: 8000,
      durationMs: 2500,
      tracks: {
        motion: {
          'dragon-01': {
            neck_turn: [k(0, 30), k(2500, 30)],
            jaw_open: [k(0, 0, 'linear'), k(600, 25, 'linear'), k(1800, 25, 'linear'), k(2500, 0)],
          },
        },
        lights: { 'light-01': [l(0, '#ff3300', 1)] },
        audio: { 'audio-02': [cue('snarl', 300, assets.snarl, -6, 'Snarl')] },
      },
    },
    {
      id: 'burglar-waves',
      name: 'Burglar waves back',
      enabled: true,
      trigger: { sensorId: 'button', event: 'press' },
      window: null,
      standby: true,
      blendMs: 2400,
      cooldownMs: 4000,
      durationMs: 2400,
      tracks: {
        motion: {
          'burglar-01': {
            wave_arm: [k(0, 50), k(2400, 50)],
            wave_elbow: [
              k(0, 20, 'linear'),
              k(600, 80, 'linear'),
              k(1200, 20, 'linear'),
              k(1800, 80, 'linear'),
              k(2400, 20),
            ],
          },
        },
        lights: {},
        audio: { 'audio-01': [cue('hello', 0, assets.chime, -10, 'Hello')] },
      },
    },
  ],
}

const nightWatch: ShowDefinition = {
  schemaVersion: 1,
  name: 'Night Watch',
  description: 'Quiet loop between rides: the dragon breathes in its sleep, the wizard keeps watch.',
  environment: { id: 'dragons-lair', revision: lairRev },
  durationMs: 20_000,
  tracks: {
    motion: {
      'dragon-01': {
        neck_raise: [k(1000, 0), k(6000, 8), k(11_000, 0), k(16_000, 8), k(19_500, 0)],
        tail_sway: [k(2000, 0), k(7000, 12), k(12_000, -12), k(17_000, 0)],
      },
      'wizard-01': { head_turn: [k(3000, 0), k(8000, -30), k(14_000, 30), k(19_000, 0)] },
    },
    lights: {
      'light-04': [l(0, '#2a4fd6', 0), l(2000, '#2a4fd6', 0.5), l(18_000, '#2a4fd6', 0.5), l(20_000, '#2a4fd6', 0)],
      'light-02': [l(0, '#ffb347', 0), l(4000, '#ffb347', 0.35), l(16_000, '#ffb347', 0.35), l(20_000, '#ffb347', 0)],
      'light-01': [
        l(0, '#ff7a1a', 0),
        l(5000, '#ff7a1a', 0.25),
        l(10_000, '#ff7a1a', 0.1),
        l(15_000, '#ff7a1a', 0.25),
        l(20_000, '#ff7a1a', 0),
      ],
    },
    audio: {},
  },
  behaviors: [],
}

await ensureProject('dragon-awakens', awakens, [...TEAM, ['tom', 'viewer']])
await ensureProject('night-watch', nightWatch, TEAM)
const awakensRev = await publish('dragon-awakens', 'First full choreography')
const nightRev = await publish('night-watch', 'Idle loop')

// ---- second attraction: runs at the same time as the Hoard, launched on its own ----------------
n = 100
const burrow: EnvironmentDefinition = {
  schemaVersion: 1,
  name: 'Burrow Hollow',
  description:
    'A cosy halfling burrow under the hill. The wizard comes knocking, the halfling peeks out and the treasure chest opens. Its own fixtures, speaker and doorbell.',
  stage: { min: [-5, 0, -3.5], max: [5, 4, 3] },
  keepOut: [{ name: 'garden-path', box: { min: [-5, 0, 3.3], max: [5, 2.4, 5.4] } }],
  ambient: { color: '#2a2418', intensity: 0.35 },
  palette: [
    { name: 'Hearth', color: '#ff9a45' },
    { name: 'Lantern', color: '#ffd28a' },
    { name: 'Dusk', color: '#6d5bd0' },
    { name: 'Magic', color: '#9ec5ff' },
  ],
  placements: [
    { deviceId: 'halfling-01', name: 'Halfling', character: pin(burglar), position: [-1.3, 0, 0.6], rotationY: 15 },
    { deviceId: 'wizard-01', name: 'Visiting wizard', character: pin(wizard), position: [2.6, 0, 0.9], rotationY: -50 },
    { deviceId: 'chest-01', name: 'Hearth chest', character: pin(chest), position: [-3.4, 0, -0.9], rotationY: 40 },
  ],
  lights: [
    {
      deviceId: 'light-01',
      name: 'Hearth glow',
      position: [-3.2, 3.6, 2.4],
      target: [-2, 0.6, -0.2],
      dmx: { universe: 1, address: 1 },
    },
    {
      deviceId: 'light-02',
      name: 'Lantern',
      position: [3.2, 3.6, 2.6],
      target: [1.6, 1, 0.6],
      dmx: { universe: 1, address: 9 },
    },
    {
      deviceId: 'light-03',
      name: 'Dusk sky',
      position: [0, 3.9, -3.3],
      target: [0, 0.5, 0.8],
      dmx: { universe: 1, address: 17 },
    },
  ],
  audio: [{ deviceId: 'audio-01', name: 'Burrow speakers', position: [0, 3, 2.8], maxVolumeDb: -6 }],
  sensors: [{ deviceId: 'doorbell', name: 'Doorbell', type: 'button', position: [2.6, 1, 3.6], range: 0.3 }],
  consoles: [{ deviceId: 'console-01', name: 'Operator console', position: [4.3, 0, 4.4], rotationY: -25 }],
  scenery: [
    prop('round-door', [0, 0, -3.1], 0, 1.2),
    prop('cliff', [-3.4, 0, -3.5], 0, 0.9),
    prop('cliff', [3.4, 0, -3.5], 0, 0.9),
    prop('mushrooms', [-0.9, 0, -2.4]),
    prop('mushrooms', [1.2, 0, -2.2], 60, 0.8),
    prop('mushrooms', [4.2, 0, 1.6], 20, 1.1),
    prop('stones', [-1.8, 0, 2.2], 30, 0.6),
    prop('barrel', [3.9, 0, -1.4], 10, 0.8),
    prop('chest-wood', [-2.2, 0, -2.4], 25),
    prop('coin-stack', [-4.2, 0, 0.6], 0, 0.6),
    prop('torch', [-1.2, 0, -2.9]),
    prop('torch', [1.4, 0, -2.9]),
    prop('rock-large', [-4.4, 0, -2.0], 50, 0.8),
    prop('column-ruin', [4.3, 0, -2.6], 10, 0.8),
  ],
}
await upsertDoc({ kind: 'environment', id: 'burrow-hollow', locationId: LOCATION, draft: burrow })
const burrowRev = await publish('burrow-hollow', 'Initial layout')

const guest: ShowDefinition = {
  schemaVersion: 1,
  name: 'An Unexpected Guest',
  description: 'The wizard knocks with his staff, the halfling turns to look, opens the chest and waves him in.',
  environment: { id: 'burrow-hollow', revision: burrowRev },
  durationMs: 30_000,
  tracks: {
    motion: {
      'wizard-01': {
        staff_raise: [k(2000, -70), k(4500, 10), k(5500, -20), k(6500, 10), k(7500, -20), k(10_000, -70)],
        staff_elbow: [k(2000, 15), k(4500, 50), k(10_000, 15)],
        head_turn: [k(11_000, 0), k(13_000, -35), k(24_000, -35), k(26_000, 0)],
        head_nod: [k(20_000, 0), k(21_000, 15), k(22_000, 0)],
      },
      'halfling-01': {
        head_turn: [k(6000, 0), k(7500, -55), k(12_000, -55), k(14_000, 0), k(22_000, 0), k(23_500, -40), k(27_000, 0)],
        torso_turn: [k(7000, 0), k(9000, -30), k(13_000, -30), k(15_000, 0)],
        lean: [k(14_000, 0), k(16_000, 25), k(19_000, 25), k(21_000, 0)],
        wave_arm: [k(22_000, -70), k(24_000, 60), k(26_000, 60), k(28_000, -70)],
        wave_elbow: [
          k(24_000, 15, 'linear'),
          k(24_600, 80, 'linear'),
          k(25_200, 15, 'linear'),
          k(25_800, 80, 'linear'),
          k(26_400, 15),
          k(27_000, 15),
        ],
      },
      'chest-01': { lid_open: [k(15_000, 0), k(18_000, 75), k(25_000, 75), k(29_000, 0)] },
    },
    lights: {
      'light-03': [l(0, '#6d5bd0', 0), l(2000, '#6d5bd0', 0.5), l(27_000, '#6d5bd0', 0.5), l(30_000, '#6d5bd0', 0)],
      'light-01': [
        l(0, '#ff9a45', 0),
        l(3000, '#ff9a45', 0.6),
        l(15_000, '#ffb347', 0.9),
        l(28_000, '#ff9a45', 0.6),
        l(30_000, '#ff9a45', 0),
      ],
      'light-02': [
        l(2000, '#ffd28a', 0),
        l(4000, '#ffd28a', 0.7, 'step'),
        l(5000, '#9ec5ff', 1),
        l(8000, '#ffd28a', 0.7),
        l(28_000, '#ffd28a', 0.7),
        l(30_000, '#ffd28a', 0),
      ],
    },
    audio: {
      'audio-01': [
        cue('theme', 0, assets.themeBurrow, -16, 'Theme'),
        cue('knock', 4500, assets.knock, -12, 'Staff knock'),
        cue('coins', 17_000, assets.coins, -12, 'Coins'),
        cue('chime', 24_000, assets.chime, -12, 'Welcome chime'),
      ],
    },
  },
  behaviors: [
    {
      id: 'doorbell-wave',
      name: 'Halfling answers the bell',
      enabled: true,
      trigger: { sensorId: 'doorbell', event: 'press' },
      window: null,
      standby: true,
      blendMs: 2400,
      cooldownMs: 4000,
      durationMs: 2400,
      tracks: {
        motion: {
          'halfling-01': {
            wave_arm: [k(0, 50), k(2400, 50)],
            wave_elbow: [
              k(0, 20, 'linear'),
              k(600, 80, 'linear'),
              k(1200, 20, 'linear'),
              k(1800, 80, 'linear'),
              k(2400, 20),
            ],
          },
        },
        lights: {},
        audio: { 'audio-01': [cue('bell', 0, assets.doorbell, -10, 'Doorbell')] },
      },
    },
  ],
}
await ensureProject('unexpected-guest', guest, TEAM)
const guestRev = await publish('unexpected-guest', 'First choreography')

// Still in animation: a draft nobody outside the creative team can see yet (Olga cannot).
const lanterns: ShowDefinition = {
  schemaVersion: 1,
  name: 'Lantern Night',
  description: 'Work in progress: lanterns glow one by one while the halfling looks up at them.',
  environment: { id: 'burrow-hollow', revision: burrowRev },
  durationMs: 24_000,
  tracks: {
    motion: {
      'halfling-01': { head_turn: [k(3000, 0), k(6000, -30), k(12_000, 30), k(18_000, 0)] },
    },
    lights: {
      'light-01': [l(0, '#ffcf7a', 0), l(3000, '#ffcf7a', 0.6), l(21_000, '#ffcf7a', 0.6), l(24_000, '#ffcf7a', 0)],
      'light-02': [l(4000, '#ffcf7a', 0), l(7000, '#ffcf7a', 0.6), l(21_000, '#ffcf7a', 0.6), l(24_000, '#ffcf7a', 0)],
    },
    audio: {},
  },
  behaviors: [],
}
await ensureProject('lantern-night', lanterns, [['priya', 'editor']])

await login('sam', ['safety'])
for (const [id, revision] of [
  ['dragon-awakens', awakensRev],
  ['night-watch', nightRev],
  ['unexpected-guest', guestRev],
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
  bun run fleet-sim --env dragons-lair --env burrow-hollow   # both attractions, headless
  bun run sim:godot --env dragons-lair                      # or one Godot twin per attraction
  bun run sim:godot --env burrow-hollow
  open http://localhost:5173    # sign in as Olga -> Projects -> The Dragon Awakens -> 3 Deploy -> 4 Launch
`)
