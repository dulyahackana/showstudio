import { describe, expect, it } from 'bun:test'
import { clampKeyTime, draftKeys, issueKey, rowKey, snap, tickSteps, upsertKey } from './timeline-math'

describe('timeline math', () => {
  it('snaps to the grid and never below zero', () => {
    expect(snap(1234)).toBe(1250)
    expect(snap(-30)).toBe(0)
    expect(snap(1234, 10)).toBe(1230)
  })

  it('inserts keys in order and replaces near-duplicates', () => {
    const keys = [
      { t: 0, v: 0 },
      { t: 1000, v: 1 },
    ]
    expect(upsertKey(keys, { t: 500, v: 9 })).toBe(1)
    expect(keys.map((k) => k.t)).toEqual([0, 500, 1000])
    expect(upsertKey(keys, { t: 1010, v: 5 })).toBe(2)
    expect(keys[2]).toEqual({ t: 1000, v: 5 })
    expect(upsertKey(keys, { t: 5000, v: 1 })).toBe(3)
  })

  it('keeps dragged keys between their neighbours', () => {
    const keys = [{ t: 0 }, { t: 1000 }, { t: 2000 }]
    expect(clampKeyTime(keys, 1, 50, 3000)).toBe(50)
    expect(clampKeyTime(keys, 1, -500, 3000)).toBe(1)
    expect(clampKeyTime(keys, 1, 2500, 3000)).toBe(1999)
    expect(clampKeyTime(keys, 2, 9000, 3000)).toBe(3000)
  })

  it('creates track paths on demand', () => {
    const tracks = { motion: {}, lights: {}, audio: {} }
    draftKeys(tracks, { kind: 'motion', deviceId: 'd', joint: 'j' }).push({ t: 0, v: 1, interp: 'linear' })
    expect(tracks).toEqual({ motion: { d: { j: [{ t: 0, v: 1, interp: 'linear' }] } }, lights: {}, audio: {} })
  })

  it('builds stable keys', () => {
    expect(rowKey({ kind: 'light', deviceId: 'l1' })).toBe('l:l1')
    expect(issueKey('d', 'j', 2)).toBe('d|j|2')
    expect(tickSteps(200).minor).toBe(100)
    expect(tickSteps(10).major).toBe(10_000)
  })
})
