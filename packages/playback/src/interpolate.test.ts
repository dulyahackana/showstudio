import { describe, expect, it } from 'bun:test'
import type { MotionKey } from '@studio/schema'
import {
  hexToRgb,
  LIGHT_OFF,
  rgbToHex,
  sampleJoint,
  sampleLight,
  sampleMotion,
  segmentIndex,
  segmentPeakVelocity,
  withHome,
} from './interpolate.ts'

const k = (t: number, v: number, interp: MotionKey['interp'] = 'linear'): MotionKey => ({ t, v, interp })

describe('sampleMotion', () => {
  it('interpolates linearly, holds outside the keys', () => {
    const keys = [k(1000, 0), k(2000, 10)]
    expect(sampleMotion(keys, 0, 99)).toBe(0)
    expect(sampleMotion(keys, 1500, 99)).toBe(5)
    expect(sampleMotion(keys, 5000, 99)).toBe(10)
    expect(sampleMotion([], 5000, 99)).toBe(99)
  })

  it('eases with smoothstep', () => {
    const keys = [k(0, 0, 'ease'), k(1000, 1)]
    expect(sampleMotion(keys, 250, 0)).toBeCloseTo(0.15625, 10)
    expect(sampleMotion(keys, 500, 0)).toBeCloseTo(0.5, 10)
  })

  it('steps at the next key', () => {
    const keys = [k(0, 0, 'step'), k(1000, 1)]
    expect(sampleMotion(keys, 999, 0)).toBe(0)
    expect(sampleMotion(keys, 1000, 0)).toBe(1)
  })

  it('finds segments with binary search', () => {
    const keys = Array.from({ length: 1000 }, (_, i) => k(i * 10, i))
    expect(segmentIndex(keys, -1)).toBe(-1)
    expect(segmentIndex(keys, 5)).toBe(0)
    expect(segmentIndex(keys, 5555)).toBe(555)
    expect(sampleMotion(keys, 5555, 0)).toBeCloseTo(555.5, 10)
  })
})

describe('home handling', () => {
  it('starts from home when the first key is later than t=0', () => {
    expect(withHome([k(1000, 10)], 0)).toEqual([k(0, 0), k(1000, 10)])
    expect(sampleJoint([k(1000, 10)], 0, 500)).toBe(5)
    expect(withHome([k(0, 10)], 0)).toHaveLength(1)
  })
})

describe('segmentPeakVelocity', () => {
  it('accounts for the interpolation shape', () => {
    expect(segmentPeakVelocity(k(0, 0), k(1000, 90))).toBe(90)
    expect(segmentPeakVelocity(k(0, 0, 'ease'), k(1000, 90))).toBe(135)
    expect(segmentPeakVelocity(k(0, 0, 'step'), k(1000, 90))).toBe(Number.POSITIVE_INFINITY)
    expect(segmentPeakVelocity(k(0, 5, 'step'), k(1000, 5))).toBe(0)
    expect(segmentPeakVelocity(k(1000, 0), k(1000, 1))).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('lights', () => {
  it('is off before the first key and mixes colors', () => {
    const keys = [
      { t: 1000, color: '#000000', intensity: 0, interp: 'linear' as const },
      { t: 2000, color: '#ff0000', intensity: 1, interp: 'linear' as const },
    ]
    expect(sampleLight(keys, 0)).toEqual(LIGHT_OFF)
    const mid = sampleLight(keys, 1500)
    expect(mid.r).toBeCloseTo(0.5, 10)
    expect(mid.intensity).toBeCloseTo(0.5, 10)
  })

  it('round-trips hex colors', () => {
    expect(rgbToHex(...hexToRgb('#12abef'))).toBe('#12abef')
  })
})
