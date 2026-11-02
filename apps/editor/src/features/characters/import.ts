import { CharacterDefinition, type Joint, Joint as JointSchema, type Vec3 } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { z } from 'zod'
import { nodeNames } from '@/components/three/character-model'
import { assetUrl } from '@/lib/api'

const round = (n: number, d = 3) => Number(n.toFixed(d))

const jointName = (raw: string) => {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64)
  return s || 'joint'
}

/**
 * Import joint definitions from URDF (the robotics standard) or our own JSON.
 * Assumption: each URDF child link maps to a glTF node with the same name, and
 * the URDF joint axis is expressed in that node's local frame.
 */
export function parseDefinitionFile(text: string, filename: string): { joints: Joint[]; name?: string } {
  if (filename.toLowerCase().endsWith('.urdf') || text.trimStart().startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('Not a valid URDF/XML file')
    const joints: Joint[] = []
    for (const el of Array.from(doc.querySelectorAll('joint'))) {
      const type = el.getAttribute('type') ?? 'fixed'
      if (!['revolute', 'continuous', 'prismatic'].includes(type)) continue
      const revolute = type !== 'prismatic'
      const toUnit = (v: number) => (revolute ? round(THREE.MathUtils.radToDeg(v), 2) : round(v, 4))
      const limit = el.querySelector('limit')
      const lower = Number(limit?.getAttribute('lower') ?? (type === 'continuous' ? -Math.PI : 0))
      const upper = Number(limit?.getAttribute('upper') ?? (type === 'continuous' ? Math.PI : 0))
      const velocity = Number(limit?.getAttribute('velocity') ?? (revolute ? 1 : 0.2))
      const axis = (el.querySelector('axis')?.getAttribute('xyz') ?? '1 0 0').trim().split(/\s+/).map(Number) as Vec3
      const min = toUnit(lower)
      const max = toUnit(upper)
      joints.push({
        name: jointName(el.getAttribute('name') ?? 'joint'),
        node: el.querySelector('child')?.getAttribute('link') ?? '',
        type: revolute ? 'revolute' : 'prismatic',
        axis,
        min,
        max,
        home: Math.min(max, Math.max(min, 0)),
        maxVelocity: Math.max(toUnit(velocity), 0.001),
      })
    }
    const name = doc.querySelector('robot')?.getAttribute('name') ?? undefined
    return { joints, ...(name ? { name } : {}) }
  }
  const json: unknown = JSON.parse(text)
  const full = CharacterDefinition.safeParse(json)
  if (full.success) return { joints: full.data.joints, name: full.data.name }
  const partial = z.object({ joints: z.array(JointSchema) }).safeParse(json)
  if (partial.success) return { joints: partial.data.joints }
  throw new Error('JSON must be a CharacterDefinition or { "joints": [...] }')
}

export interface GlbInfo {
  nodes: string[]
  size: Vec3
}

export async function inspectGlb(data: ArrayBuffer): Promise<GlbInfo> {
  const gltf = await new GLTFLoader().parseAsync(data, '')
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const v = box.getSize(new THREE.Vector3())
  return { nodes: nodeNames(gltf.scene), size: [round(v.x, 2), round(v.y, 2), round(v.z, 2)] }
}

export function useGlbInfo(assetId: string | null | undefined) {
  return useQuery({
    queryKey: ['glb-info', assetId],
    enabled: !!assetId,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const res = await fetch(assetUrl(assetId ?? ''))
      if (!res.ok) throw new Error(`Model download failed (${res.status})`)
      return inspectGlb(await res.arrayBuffer())
    },
  })
}
