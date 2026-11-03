import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { CharacterDefinition, Joint } from '@studio/schema'
import { Component, type ReactNode, Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { assetUrl } from '@/lib/api'

export type Pose = Record<string, number>
export type PoseSource = Pose | (() => Pose | undefined) | undefined

interface Rig {
  joints: { joint: Joint; node: THREE.Object3D; axis: THREE.Vector3 }[]
  bases: Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>
}

/** GLTFLoader sanitizes node names but keeps the original in userData.name. */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined
  root.traverse((o) => {
    if (!found && (o.userData.name === name || o.name === name)) found = o
  })
  return found
}

export function nodeNames(root: THREE.Object3D): string[] {
  const names: string[] = []
  root.traverse((o) => {
    const n = (o.userData.name as string | undefined) ?? o.name
    if (n && o !== root) names.push(n)
  })
  return names
}

export function buildRig(root: THREE.Object3D, joints: readonly Joint[]): Rig {
  const rig: Rig = { joints: [], bases: new Map() }
  for (const joint of joints) {
    const node = findNode(root, joint.node)
    if (!node) continue
    if (!rig.bases.has(node)) rig.bases.set(node, { q: node.quaternion.clone(), p: node.position.clone() })
    const axis = new THREE.Vector3(...joint.axis)
    if (axis.lengthSq() === 0) continue
    rig.joints.push({ joint, node, axis: axis.normalize() })
  }
  return rig
}

const tmpQ = new THREE.Quaternion()
const tmpV = new THREE.Vector3()

/** Same convention as every playback target: rotate/translate about the joint axis in the node's local frame. */
export function applyPose(rig: Rig, pose: Pose | undefined): void {
  for (const [node, base] of rig.bases) {
    node.quaternion.copy(base.q)
    node.position.copy(base.p)
  }
  for (const { joint, node, axis } of rig.joints) {
    const v = pose?.[joint.name] ?? joint.home
    if (joint.type === 'revolute') {
      node.quaternion.multiply(tmpQ.setFromAxisAngle(axis, THREE.MathUtils.degToRad(v)))
    } else {
      const base = rig.bases.get(node)
      if (base) node.position.add(tmpV.copy(axis).applyQuaternion(base.q).multiplyScalar(v))
    }
  }
}

const resolve = (pose: PoseSource) => (typeof pose === 'function' ? pose() : pose)

function GlbModel({
  assetId,
  joints,
  pose,
  highlightNode,
}: {
  assetId: string
  joints: readonly Joint[]
  pose: PoseSource
  highlightNode?: string | null
}) {
  const gltf = useGLTF(assetUrl(assetId))
  const scene = useMemo(() => {
    // SkeletonUtils.clone re-binds skinned meshes to the cloned bones (Object3D.clone does not).
    const clone = cloneSkinned(gltf.scene)
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return clone
  }, [gltf.scene])
  const rig = useMemo(() => buildRig(scene, joints), [scene, joints])
  useFrame(() => applyPose(rig, resolve(pose)))
  useEffect(() => {
    if (!highlightNode) return
    const node = findNode(scene, highlightNode)
    if (!node) return
    const helper = new THREE.AxesHelper(0.3)
    helper.renderOrder = 10
    ;(helper.material as THREE.Material).depthTest = false
    node.add(helper)
    return () => {
      node.remove(helper)
      helper.dispose()
    }
  }, [scene, highlightNode])
  return <primitive object={scene} />
}

function Placeholder({ size, color = '#64748b' }: { size: [number, number, number]; color?: string }) {
  return (
    <mesh position={[0, size[1] / 2, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.45} />
    </mesh>
  )
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function CharacterModel({
  character,
  pose,
  highlightNode,
}: {
  character: CharacterDefinition
  pose?: PoseSource
  highlightNode?: string | null
}) {
  const size = character.footprint.size
  const fallback = <Placeholder size={size} />
  if (!character.model) return fallback
  return (
    <ModelBoundary fallback={<Placeholder size={size} color="#ef4444" />}>
      <Suspense fallback={fallback}>
        <GlbModel
          assetId={character.model.assetId}
          joints={character.joints}
          pose={pose}
          highlightNode={highlightNode ?? null}
        />
      </Suspense>
    </ModelBoundary>
  )
}

export function BoxEdges({
  size,
  position = [0, 0, 0],
  color = '#94a3b8',
}: {
  size: [number, number, number]
  position?: [number, number, number]
  color?: string
}) {
  const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size[0], size[1], size[2]])
  return (
    <lineSegments geometry={geometry} position={position}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}
