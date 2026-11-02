import type { CharacterDefinition, EnvironmentDefinition, ShowDefinition } from '@studio/schema'

/** Small, hand-checkable documents shared by tests and the conformance vector generator. */

export const robot: CharacterDefinition = {
  schemaVersion: 1,
  name: 'Robot',
  description: '',
  model: null,
  footprint: { size: [1, 2, 1] },
  joints: [
    { name: 'head_yaw', node: 'head', type: 'revolute', axis: [0, 1, 0], min: -90, max: 90, home: 0, maxVelocity: 90 },
    { name: 'arm_pitch', node: 'arm', type: 'revolute', axis: [1, 0, 0], min: 0, max: 120, home: 0, maxVelocity: 60 },
  ],
}

export const characters = new Map<string, CharacterDefinition>([['robot@1', robot]])

export const lab: EnvironmentDefinition = {
  schemaVersion: 1,
  name: 'Lab',
  description: '',
  stage: { min: [-5, 0, -5], max: [5, 4, 5] },
  keepOut: [{ name: 'walkway', box: { min: [-5, 0, 4], max: [5, 3, 5] } }],
  ambient: { color: '#ffffff', intensity: 0.3 },
  palette: [],
  placements: [
    { deviceId: 'robot-01', name: 'Robot', character: { id: 'robot', revision: 1 }, position: [0, 0, 0], rotationY: 0 },
  ],
  lights: [
    { deviceId: 'light-01', name: 'Key', position: [2, 3, 2], target: [0, 1, 0], dmx: { universe: 0, address: 1 } },
  ],
  audio: [{ deviceId: 'audio-01', name: 'Main', position: [0, 2, 3], maxVolumeDb: -6 }],
  sensors: [{ deviceId: 'door', name: 'Door', type: 'presence', position: [0, 0, 4.5], range: 1.5 }],
}

export const AUDIO_ID = 'a'.repeat(64)

export function makeShow(overrides: Partial<ShowDefinition> = {}): ShowDefinition {
  return {
    schemaVersion: 1,
    name: 'Demo',
    description: '',
    environment: { id: 'lab', revision: 1 },
    durationMs: 10_000,
    tracks: {
      motion: {
        'robot-01': {
          head_yaw: [
            { t: 1000, v: 45, interp: 'ease' },
            { t: 3000, v: -45, interp: 'linear' },
            { t: 5000, v: 0, interp: 'linear' },
          ],
          arm_pitch: [
            { t: 2000, v: 90, interp: 'linear' },
            { t: 6000, v: 0, interp: 'linear' },
          ],
        },
      },
      lights: {
        'light-01': [
          { t: 0, color: '#000000', intensity: 0, interp: 'linear' },
          { t: 1000, color: '#ff8800', intensity: 1, interp: 'ease' },
          { t: 9000, color: '#0000ff', intensity: 0.5, interp: 'step' },
        ],
      },
      audio: {
        'audio-01': [{ id: 'music', t: 0, assetId: AUDIO_ID, volumeDb: -12, label: 'Music' }],
      },
    },
    behaviors: [
      {
        id: 'wave',
        name: 'Wave at guest',
        enabled: true,
        trigger: { sensorId: 'door', event: 'enter' },
        window: null,
        blendMs: 3000,
        cooldownMs: 2000,
        durationMs: 2000,
        tracks: {
          motion: {
            'robot-01': {
              arm_pitch: [
                { t: 0, v: 100, interp: 'linear' },
                { t: 1000, v: 60, interp: 'linear' },
                { t: 2000, v: 100, interp: 'linear' },
              ],
            },
          },
          lights: { 'light-01': [{ t: 0, color: '#ffffff', intensity: 1, interp: 'linear' }] },
          audio: { 'audio-01': [{ id: 'hello', t: 500, assetId: AUDIO_ID, volumeDb: -10, label: 'Hello' }] },
        },
      },
    ],
    ...overrides,
  }
}
