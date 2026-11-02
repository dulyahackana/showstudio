import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { API_PREFIX, buildPath, contract, type RouteDef } from './contract.ts'
import {
  CharacterDefinition,
  DeviceToFleet,
  EnvironmentDefinition,
  FleetToDevice,
  Id,
  ShowDefinition,
} from './index.ts'
import { buildAsyncApi, buildOpenApi } from './openapi.ts'

const contractsDir = resolve(import.meta.dirname, '../../../contracts')

describe('data model', () => {
  it('accepts a minimal valid document of each kind', () => {
    expect(
      CharacterDefinition.safeParse({
        schemaVersion: 1,
        name: 'Dragon',
        description: '',
        model: null,
        footprint: { size: [1, 1, 1] },
        joints: [
          { name: 'jaw', node: 'jaw', type: 'revolute', axis: [1, 0, 0], min: 0, max: 30, home: 0, maxVelocity: 60 },
        ],
      }).success,
    ).toBe(true)
    expect(
      EnvironmentDefinition.safeParse({
        schemaVersion: 1,
        name: 'Lair',
        description: '',
        stage: { min: [0, 0, 0], max: [1, 1, 1] },
        keepOut: [],
        ambient: { color: '#000000', intensity: 0 },
        palette: [],
        placements: [],
        lights: [],
        audio: [],
        sensors: [],
      }).success,
    ).toBe(true)
    expect(
      ShowDefinition.safeParse({
        schemaVersion: 1,
        name: 'Show',
        description: '',
        environment: { id: 'lair', revision: 1 },
        durationMs: 1000,
        tracks: { motion: {}, lights: {}, audio: {} },
        behaviors: [],
      }).success,
    ).toBe(true)
  })

  it('rejects unknown schema versions and malformed ids', () => {
    expect(ShowDefinition.safeParse({ schemaVersion: 2 }).success).toBe(false)
    expect(Id.safeParse('Has Spaces').success).toBe(false)
    expect(Id.safeParse('dragon-01').success).toBe(true)
  })

  it('discriminates protocol messages by type', () => {
    expect(DeviceToFleet.safeParse({ type: 'ack', opId: 'x', ok: true, error: null }).success).toBe(true)
    expect(FleetToDevice.safeParse({ type: 'launch', opId: 'x', sha256: 'nope', startAt: 1 }).success).toBe(false)
  })
})

describe('REST contract', () => {
  it('declares a params schema for every path placeholder', () => {
    for (const [key, route] of Object.entries(contract) as [string, RouteDef][]) {
      const placeholders = [...route.path.matchAll(/:([A-Za-z0-9]+)/g)].map((m) => m[1] ?? '')
      expect(Object.keys(route.params?.shape ?? {}).sort(), key).toEqual(placeholders.sort())
    }
  })

  it('builds paths', () => {
    expect(buildPath('/docs/:id/revisions/:revision', { id: 'a b', revision: 2 })).toBe('/docs/a%20b/revisions/2')
    expect(() => buildPath('/docs/:id')).toThrow()
  })

  it('has unique method + path pairs', () => {
    const seen = Object.values(contract).map((r) => `${r.method} ${API_PREFIX}${r.path}`)
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('published contract artifacts', () => {
  // Fails when a schema changed without `bun run gen:contracts`, so contract changes show up in review.
  it('openapi.json is up to date', () => {
    const committed = JSON.parse(readFileSync(resolve(contractsDir, 'openapi.json'), 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi())))
  })

  it('asyncapi.json is up to date', () => {
    const committed = JSON.parse(readFileSync(resolve(contractsDir, 'asyncapi.json'), 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildAsyncApi())))
  })
})
