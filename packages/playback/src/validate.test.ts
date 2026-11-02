import { describe, expect, it } from 'bun:test'
import { compileBundle } from './compile.ts'
import { AUDIO_ID, characters, lab, makeShow, robot } from './fixtures.ts'
import { validateCharacter, validateDollPayload, validateEnvironment, validateShow } from './validate.ts'

const ctx = { environment: lab, characters, assets: new Set([AUDIO_ID]) }
const codes = (issues: { code: string; severity: string }[], severity = 'error') =>
  issues.filter((i) => i.severity === severity).map((i) => i.code)

describe('validateShow', () => {
  it('accepts the fixture show', () => {
    expect(codes(validateShow(makeShow(), ctx))).toEqual([])
  })

  it('rejects positions outside joint limits with a precise location', () => {
    const show = makeShow()
    show.tracks.motion['robot-01'] = { arm_pitch: [{ t: 4000, v: 150, interp: 'linear' }] }
    const issue = validateShow(show, ctx).find((i) => i.code === 'motion-out-of-range')
    expect(issue).toMatchObject({ deviceId: 'robot-01', joint: 'arm_pitch', index: 0, t: 4000 })
  })

  it('rejects moves faster than the joint allows, including the move from home', () => {
    const show = makeShow()
    show.tracks.motion['robot-01'] = { arm_pitch: [{ t: 500, v: 60, interp: 'linear' }] }
    expect(codes(validateShow(show, ctx))).toContain('motion-velocity-exceeded')
  })

  it('treats a step on a joint as an instantaneous jump', () => {
    const show = makeShow()
    show.tracks.motion['robot-01'] = {
      head_yaw: [
        { t: 1000, v: 0, interp: 'step' },
        { t: 9000, v: 10, interp: 'linear' },
      ],
    }
    expect(codes(validateShow(show, ctx))).toContain('motion-velocity-exceeded')
  })

  it('enforces the audio zone volume ceiling and asset existence', () => {
    const show = makeShow()
    show.tracks.audio['audio-01'] = [{ id: 'x', t: 0, assetId: 'b'.repeat(64), volumeDb: -1, label: 'Loud' }]
    expect(codes(validateShow(show, ctx))).toEqual(expect.arrayContaining(['audio-too-loud', 'audio-asset-missing']))
  })

  it('rejects tracks for devices or joints that do not exist', () => {
    const show = makeShow()
    show.tracks.motion.ghost = { a: [] }
    show.tracks.motion['robot-01'] = { tail: [{ t: 0, v: 0, interp: 'linear' }] }
    expect(codes(validateShow(show, ctx))).toEqual(
      expect.arrayContaining(['track-device-unknown', 'track-joint-unknown']),
    )
  })

  it('checks sensor responses: sensor, event, window and blend speed', () => {
    const base = makeShow()
    const wave = base.behaviors[0]
    if (!wave) throw new Error('fixture')
    const show = makeShow({
      behaviors: [
        { ...wave, id: 'a', trigger: { sensorId: 'nope', event: 'enter' } },
        { ...wave, id: 'b', trigger: { sensorId: 'door', event: 'press' } },
        { ...wave, id: 'c', window: { fromMs: 5000, toMs: 4000 } },
        { ...wave, id: 'd', blendMs: 100 },
      ],
    })
    expect(codes(validateShow(show, ctx))).toEqual(
      expect.arrayContaining([
        'behavior-sensor-unknown',
        'behavior-event-invalid',
        'behavior-window-invalid',
        'behavior-blend-too-fast',
      ]),
    )
  })

  it('reports the minimum safe blend duration', () => {
    const wave = makeShow().behaviors[0]
    if (!wave) throw new Error('fixture')
    const issue = validateShow(makeShow({ behaviors: [{ ...wave, blendMs: 1000 }] }), ctx).find(
      (i) => i.code === 'behavior-blend-too-fast',
    )
    // arm_pitch: worst case 100° from 0°, 1.5 * 100 / 60 °/s = 2.5 s
    expect(issue?.message).toContain('blendMs >= 2500')
  })
})

describe('validateEnvironment', () => {
  it('accepts the fixture lab', () => {
    expect(codes(validateEnvironment(lab, { characters }))).toEqual([])
  })

  it('catches boundary, keep-out, duplicate and reference problems', () => {
    const env = structuredClone(lab)
    const first = env.placements[0]
    if (!first) throw new Error('fixture')
    env.placements.push({ ...first, deviceId: 'robot-02', position: [0, 0, 4.2] })
    env.placements.push({ ...first, deviceId: 'robot-03', position: [4.8, 0, 0] })
    env.placements.push({ ...first, deviceId: 'light-01', character: { id: 'robot', revision: 9 } })
    expect(codes(validateEnvironment(env, { characters }))).toEqual(
      expect.arrayContaining([
        'placement-in-keep-out',
        'placement-outside-stage',
        'device-duplicate',
        'character-unresolved',
      ]),
    )
  })
})

describe('validateCharacter', () => {
  it('checks joint definitions against the model', () => {
    const def = structuredClone(robot)
    def.joints.push({ ...(def.joints[0] as (typeof def.joints)[number]), home: 200 })
    expect(codes(validateCharacter(def, { modelNodes: ['arm'] }))).toEqual(
      expect.arrayContaining(['joint-duplicate', 'joint-home-out-of-range', 'joint-node-missing']),
    )
  })
})

describe('validateDollPayload (device side)', () => {
  it('rejects a bundle that exceeds the limits the controller holds', () => {
    const bundle = compileBundle({
      show: { id: 'demo', revision: 1 },
      definition: makeShow(),
      environment: lab,
      characters,
      assetPath: (id) => `/assets/${id}`,
    })
    const payload = bundle.devices['robot-01']
    if (payload?.kind !== 'doll') throw new Error('expected doll payload')
    const cloudLimits = payload.character.joints
    expect(validateDollPayload(payload, cloudLimits, bundle.durationMs, bundle.behaviors)).toEqual([])
    const tighter = cloudLimits.map((j) => (j.name === 'arm_pitch' ? { ...j, max: 80 } : j))
    expect(codes(validateDollPayload(payload, tighter, bundle.durationMs, bundle.behaviors))).toContain(
      'motion-out-of-range',
    )
  })
})
