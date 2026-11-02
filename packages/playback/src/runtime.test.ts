import { describe, expect, it } from 'bun:test'
import type { BehaviorSchedule } from '@studio/schema'
import { canonicalJson } from './canonical.ts'
import { compileBundle } from './compile.ts'
import { characters, lab, makeShow } from './fixtures.ts'
import { activeBehaviorFor, audioEventsBetween, BehaviorScheduler, sampleDollPose, sampleFrame } from './runtime.ts'

const compile = (show = makeShow()) =>
  compileBundle({
    show: { id: 'demo', revision: 1 },
    definition: show,
    environment: lab,
    characters,
    assetPath: (id) => `/api/v1/assets/${id}`,
  })

const schedule = (over: Partial<BehaviorSchedule>): BehaviorSchedule => ({
  id: 'b',
  trigger: { sensorId: 's', event: 'enter' },
  window: null,
  blendMs: 100,
  cooldownMs: 1000,
  durationMs: 500,
  devices: ['d1'],
  ...over,
})

describe('compileBundle', () => {
  it('is deterministic regardless of input key order', () => {
    const show = makeShow()
    const reordered = JSON.parse(JSON.stringify(show, Object.keys(show).reverse())) as typeof show
    expect(canonicalJson(compile(show))).toBe(canonicalJson(compile({ ...reordered, ...show })))
    expect(canonicalJson(compile())).toBe(canonicalJson(compile()))
  })

  it('produces a payload for every device and a schedule per enabled behavior', () => {
    const bundle = compile()
    expect(Object.keys(bundle.devices).sort()).toEqual(['audio-01', 'door', 'light-01', 'robot-01'])
    expect(bundle.behaviors).toEqual([
      expect.objectContaining({ id: 'wave', devices: ['audio-01', 'light-01', 'robot-01'] }),
    ])
    const show = makeShow()
    const first = show.behaviors[0]
    if (first) first.enabled = false
    expect(compile(show).behaviors).toEqual([])
  })
})

describe('BehaviorScheduler', () => {
  it('honours windows and cooldowns', () => {
    const s = new BehaviorScheduler([schedule({ window: { fromMs: 1000, toMs: 5000 } })])
    expect(s.trigger('s', 'enter', 500)).toEqual([])
    expect(s.trigger('s', 'enter', 1000)).toEqual([{ id: 'b', startAt: 1000 }])
    // ends at 1000 + 2*100 + 500 = 1700, cooldown until 2700
    expect(s.trigger('s', 'enter', 2600)).toEqual([])
    expect(s.trigger('s', 'enter', 2700)).toHaveLength(1)
    expect(s.trigger('s', 'exit', 4000)).toEqual([])
  })

  it('never overlaps behaviors that share a device', () => {
    const s = new BehaviorScheduler([
      schedule({ id: 'a', devices: ['d1'] }),
      schedule({ id: 'b', devices: ['d1', 'd2'] }),
      schedule({ id: 'c', devices: ['d3'] }),
    ])
    expect(s.trigger('s', 'enter', 0).map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('forgets starts after a seek backwards', () => {
    const s = new BehaviorScheduler([schedule({})])
    s.trigger('s', 'enter', 5000)
    s.truncate(1000)
    expect(s.history).toEqual([])
  })
})

describe('sampleDollPose with a sensor response', () => {
  const bundle = compile()
  const payload = bundle.devices['robot-01']
  if (payload?.kind !== 'doll') throw new Error('expected doll')
  const started = [{ id: 'wave', startAt: 4000 }]
  const at = (t: number) =>
    sampleDollPose(payload, t, activeBehaviorFor(bundle, 'robot-01', t, started)).arm_pitch ?? NaN
  const timeline = (t: number) => sampleDollPose(payload, t, null).arm_pitch ?? NaN

  it('starts from the timeline pose, plays the clip, returns to the timeline', () => {
    expect(at(4000)).toBeCloseTo(timeline(4000), 9)
    expect(at(4000 + 3000)).toBeCloseTo(100, 9) // clip start after blend
    expect(at(4000 + 3000 + 1000)).toBeCloseTo(60, 9) // clip middle
    const end = 4000 + 3000 + 2000 + 3000
    expect(at(end)).toBeCloseTo(timeline(end), 9)
    expect(at(end - 1)).toBeCloseTo(timeline(end), 0)
  })

  it('leaves joints without clip data on the timeline', () => {
    const head = (t: number, s = started) =>
      sampleDollPose(payload, t, activeBehaviorFor(bundle, 'robot-01', t, s)).head_yaw
    expect(head(5000)).toBe(head(5000, []))
  })
})

describe('audioEventsBetween', () => {
  it('fires timeline cues and behavior cues offset by the blend', () => {
    const bundle = compile()
    const payload = bundle.devices['audio-01']
    if (payload?.kind !== 'audio') throw new Error('expected audio')
    const events = audioEventsBetween(payload, bundle, -1, 10_000, [{ id: 'wave', startAt: 1000 }])
    expect(events.map((e) => [e.cue.id, e.at])).toEqual([
      ['music', 0],
      ['hello', 1000 + 3000 + 500],
    ])
  })
})

describe('sampleFrame', () => {
  it('reports active behaviors and samples every device', () => {
    const frame = sampleFrame(compile(), 5000, [{ id: 'wave', startAt: 4000 }])
    expect(frame.activeBehaviors).toEqual(['wave'])
    expect(Object.keys(frame.poses)).toEqual(['robot-01'])
    expect(frame.lights['light-01']?.intensity).toBeGreaterThan(0)
  })
})
