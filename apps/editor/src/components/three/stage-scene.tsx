import { Html, Line, TransformControls } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import type { ShowFrame } from '@studio/playback'
import { type CharacterDefinition, type EnvironmentDefinition, refKey, type Vec3 } from '@studio/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { KIND } from '@/components/kind'
import { BoxEdges, CharacterModel } from './character-model'

export type StageSelection = { kind: 'placement' | 'light' | 'audio' | 'sensor' | 'keepOut'; id: string } | null

/** A layout edit made with the gizmo (positions in meters, yaw in degrees). */
export type StageChange =
  | { kind: 'placement'; id: string; position?: Vec3; rotationY?: number }
  | { kind: 'light'; id: string; position?: Vec3; target?: Vec3 }
  | { kind: 'audio'; id: string; position: Vec3 }
  | { kind: 'sensor'; id: string; position?: Vec3; range?: number }
  | { kind: 'keepOut'; id: string; box: { min: Vec3; max: Vec3 } }

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface StageEditing {
  mode: GizmoMode
  snap: boolean
  /** Lights: move the aim point instead of the fixture. */
  aim: boolean
  /** final: the drag ended (one undo step per drag). */
  onChange: (change: StageChange, final: boolean) => void
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Clicking a gizmo handle must not count as clicking empty space (which deselects). */
let lastGizmoUse = 0

const center = (min: Vec3, max: Vec3): [number, number, number] => [
  (min[0] + max[0]) / 2,
  (min[1] + max[1]) / 2,
  (min[2] + max[2]) / 2,
]
const size = (min: Vec3, max: Vec3): [number, number, number] => [
  Math.max(0.01, max[0] - min[0]),
  Math.max(0.01, max[1] - min[1]),
  Math.max(0.01, max[2] - min[2]),
]

function Label({ children, color, highlight }: { children: string; color?: string; highlight?: boolean }) {
  return (
    <Html center distanceFactor={10} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
      <span
        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] whitespace-nowrap shadow-lg backdrop-blur ${highlight ? 'border-amber-300 bg-primary text-black' : 'border-white/10 bg-[#0b111d]/80 text-white/85'}`}
        style={!highlight && color ? { borderColor: `${color}66`, color } : undefined}
      >
        {children}
      </span>
    </Html>
  )
}

const WARM = new THREE.Color('#fff1d6')

/** Fixture can, spot light and a visible beam in the fixture's current colour. */
function Fixture({
  id,
  position,
  target,
  frame,
  selected,
  onSelect,
  register,
}: {
  id: string
  position: Vec3
  target: Vec3
  frame: React.RefObject<ShowFrame | null>
  selected: boolean
  onSelect: (e: ThreeEvent<MouseEvent>) => void
  register?: (o: THREE.Object3D | null) => void
}) {
  const light = useRef<THREE.SpotLight>(null)
  const head = useRef<THREE.Group | null>(null)
  const setHead = useCallback(
    (o: THREE.Group | null) => {
      head.current = o
      register?.(o)
    },
    [register],
  )
  const lens = useRef<THREE.MeshStandardMaterial>(null)
  const beam = useRef<THREE.MeshBasicMaterial>(null)
  const targetObj = useRef<THREE.Object3D>(null)
  const length = Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2])
  const angle = 0.42
  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(Math.tan(angle) * length, length, 40, 1, true)
    g.translate(0, -length / 2, 0)
    g.rotateX(-Math.PI / 2)
    return g
  }, [length])
  useEffect(() => {
    if (light.current && targetObj.current) light.current.target = targetObj.current
    head.current?.lookAt(new THREE.Vector3(...target))
  }, [target, position])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const sample = frame.current?.lights[id]
    const intensity = sample ? sample.intensity : frame.current ? 0 : 0.12
    if (sample) color.setRGB(sample.r, sample.g, sample.b)
    else color.copy(WARM)
    if (light.current) {
      light.current.color.copy(color)
      light.current.intensity = intensity * 60
    }
    if (lens.current) {
      lens.current.emissive.copy(color)
      lens.current.emissiveIntensity = 0.15 + intensity * 3
    }
    if (beam.current) {
      beam.current.color.copy(color)
      // Idle (no show) beams only hint at the aim; live beams carry the show's colour.
      beam.current.opacity = frame.current ? intensity * 0.11 : 0.025
    }
  })
  return (
    <group>
      <group ref={setHead} position={position} onClick={onSelect}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.13, 0.26, 20]} />
          <meshStandardMaterial color={selected ? '#f5a524' : '#1f2937'} metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.135]}>
          <circleGeometry args={[0.11, 24]} />
          <meshStandardMaterial ref={lens} color="#111" emissive="#000" />
        </mesh>
        <mesh geometry={geometry} raycast={() => null}>
          <meshBasicMaterial
            ref={beam}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            opacity={0}
          />
        </mesh>
      </group>
      <spotLight
        ref={light}
        position={position}
        angle={angle}
        penumbra={0.55}
        distance={24}
        decay={1.5}
        castShadow
        shadow-mapSize={[512, 512]}
      />
      <object3D ref={targetObj} position={target} />
      {selected && (
        <group position={position}>
          <group position={[0, 0.35, 0]}>
            <Label highlight>{id}</Label>
          </group>
        </group>
      )}
    </group>
  )
}

let stripes: THREE.CanvasTexture | null = null
/** Diagonal caution stripes, shared by every keep-out floor. */
function stripeTexture(): THREE.CanvasTexture {
  if (stripes) return stripes
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (g) {
    g.strokeStyle = 'rgba(245,165,36,0.9)'
    g.lineWidth = 6
    for (let i = -64; i < 128; i += 32) {
      g.beginPath()
      g.moveTo(i, 64)
      g.lineTo(i + 64, 0)
      g.stroke()
    }
  }
  stripes = new THREE.CanvasTexture(c)
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping
  stripes.colorSpace = THREE.SRGBColorSpace
  return stripes
}

/** Guest area: brass stanchions with a rope and a faint striped floor, like a real queue line. */
function KeepOutBarrier({
  name,
  min,
  max,
  selected,
  onSelect,
  register,
}: {
  name: string
  min: Vec3
  max: Vec3
  selected: boolean
  onSelect: (e: ThreeEvent<MouseEvent>) => void
  register?: (o: THREE.Object3D | null) => void
}) {
  const s = size(min, max)
  const c = center(min, max)
  const texture = useMemo(() => {
    const t = stripeTexture().clone()
    t.repeat.set(s[0] / 0.8, s[2] / 0.8)
    t.needsUpdate = true
    return t
  }, [s[0], s[2]])
  const posts = useMemo(() => {
    // Relative to the zone centre, so the gizmo can move and resize the whole barrier.
    const hx = (max[0] - min[0]) / 2
    const hz = (max[2] - min[2]) / 2
    const corners: [number, number][] = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ]
    const out: [number, number][] = []
    corners.forEach(([x0, z0], i) => {
      const [x1, z1] = corners[(i + 1) % 4] as [number, number]
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.4))
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n])
    })
    return out
  }, [min, max])
  const floorY = min[1] - c[1]
  const ropeY = floorY + 0.82
  return (
    <group ref={register} position={c} onClick={onSelect}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.006, 0]}>
        <planeGeometry args={[s[0], s[2]]} />
        <meshBasicMaterial map={texture} transparent opacity={selected ? 0.22 : 0.06} depthWrite={false} />
      </mesh>
      {posts.map(([x, z], i) => {
        const [nx, nz] = posts[(i + 1) % posts.length] as [number, number]
        const len = Math.hypot(nx - x, nz - z)
        return (
          <group key={`${x}-${z}`}>
            <mesh position={[x, floorY + 0.45, z]} castShadow>
              <cylinderGeometry args={[0.025, 0.03, 0.9, 12]} />
              <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
            </mesh>
            <mesh position={[x, floorY + 0.91, z]}>
              <sphereGeometry args={[0.045, 16, 12]} />
              <meshStandardMaterial color="#e2bd4a" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[x, floorY + 0.012, z]} receiveShadow>
              <cylinderGeometry args={[0.12, 0.13, 0.025, 20]} />
              <meshStandardMaterial color="#8a6d1a" metalness={0.85} roughness={0.35} />
            </mesh>
            <mesh position={[(x + nx) / 2, ropeY - 0.06, (z + nz) / 2]} rotation={[0, -Math.atan2(nz - z, nx - x), Math.PI / 2]}>
              <cylinderGeometry args={[0.018, 0.018, len, 8]} />
              <meshStandardMaterial color={selected ? '#f5a524' : '#2a3550'} roughness={0.8} />
            </mesh>
          </group>
        )
      })}
      {selected && (
        <>
          <BoxEdges size={s} position={[0, 0, 0]} color="#f5a524" />
          <group position={[0, max[1] - c[1] + 0.2, 0]}>
            <Label highlight>{name}</Label>
          </group>
        </>
      )}
    </group>
  )
}

/** Detection zone on the floor; pulses while a guest is detected. */
function SensorZone({
  position,
  range,
  active,
  selected,
  label,
  register,
}: {
  position: Vec3
  range: number
  active: boolean
  selected: boolean
  label: string
  register?: (o: THREE.Object3D | null) => void
}) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ring.current) return
    const s = active ? 1 + ((clock.elapsedTime * 1.2) % 1) * 0.25 : 1
    ring.current.scale.set(s, s, 1)
    const m = ring.current.material as THREE.MeshBasicMaterial
    m.opacity = active ? 0.9 - ((clock.elapsedTime * 1.2) % 1) * 0.8 : selected ? 0.9 : 0.55
  })
  const color = active ? '#f5a524' : KIND.sensor.hex
  return (
    <group ref={register} position={[position[0], 0.012, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[range, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.22 : 0.07} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[range - 0.03, range, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh position={[0, Math.max(0.05, position[1]), 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {(selected || active) && (
        <group position={[0, Math.max(0.05, position[1]) + 0.3, 0]}>
          <Label highlight={active} color={KIND.sensor.hex}>
            {label}
          </Label>
        </group>
      )}
    </group>
  )
}

/** Renders an environment and (optionally) a live show frame: figures posed, fixtures lit, sensors armed. */
export function StageScene({
  env,
  characters,
  frame,
  selected,
  onSelect,
  showFootprints = false,
  activeSensors,
  highlightNode,
  editing,
}: {
  env: EnvironmentDefinition
  characters: ReadonlyMap<string, CharacterDefinition>
  frame?: () => ShowFrame | null
  selected?: StageSelection
  onSelect?: (s: StageSelection) => void
  showFootprints?: boolean
  activeSensors?: ReadonlySet<string>
  highlightNode?: { deviceId: string; node: string } | null
  /** Layout editing with a transform gizmo on the selected object. */
  editing?: StageEditing
}) {
  const frameRef = useRef<ShowFrame | null>(null)
  const objects = useRef(new Map<string, THREE.Object3D>())
  const [, setVersion] = useState(0)
  // One stable ref callback per object, so React only calls it on mount/unmount.
  const callbacks = useRef(new Map<string, (o: THREE.Object3D | null) => void>())
  const register = (key: string) => {
    let cb = callbacks.current.get(key)
    if (!cb) {
      cb = (o) => {
        if (o) objects.current.set(key, o)
        else objects.current.delete(key)
        setVersion((v) => v + 1)
      }
      callbacks.current.set(key, cb)
    }
    return cb
  }
  // Sample once per rendered frame, before children read it (negative priority keeps auto-rendering on).
  useFrame(() => {
    frameRef.current = frame?.() ?? null
  }, -1)

  const pick = (s: StageSelection) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect?.(s)
  }
  const is = (kind: NonNullable<StageSelection>['kind'], id: string) => selected?.kind === kind && selected.id === id
  const stageSize = size(env.stage.min, env.stage.max)
  const stageCenter = center(env.stage.min, env.stage.max)

  return (
    <group onPointerMissed={() => performance.now() - lastGizmoUse > 400 && onSelect?.(null)}>
      <ambientLight color={env.ambient.color} intensity={env.ambient.intensity * 0.6} />
      {/* stage floor and boundary */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[stageCenter[0], env.stage.min[1] + 0.003, stageCenter[2]]} receiveShadow>
        <planeGeometry args={[stageSize[0], stageSize[2]]} />
        <meshStandardMaterial color="#121b2e" roughness={0.92} metalness={0.05} transparent opacity={0.92} />
      </mesh>
      <BoxEdges size={stageSize} position={stageCenter} color="#3b82c4" />

      {env.keepOut.map((z) => (
        <KeepOutBarrier
          key={z.name}
          name={z.name}
          min={z.box.min}
          max={z.box.max}
          selected={is('keepOut', z.name)}
          onSelect={pick({ kind: 'keepOut', id: z.name })}
          register={register(`keepOut:${z.name}`)}
        />
      ))}

      {env.placements.map((p) => {
        const character = characters.get(refKey(p.character))
        const sel = is('placement', p.deviceId)
        return (
          <group
            key={p.deviceId}
            ref={register(`placement:${p.deviceId}`)}
            position={p.position}
            rotation={[0, THREE.MathUtils.degToRad(p.rotationY), 0]}
            onClick={pick({ kind: 'placement', id: p.deviceId })}
          >
            {character ? (
              <>
                <CharacterModel
                  character={character}
                  pose={() => frameRef.current?.poses[p.deviceId]}
                  highlightNode={highlightNode?.deviceId === p.deviceId ? highlightNode.node : null}
                />
                {(showFootprints || sel) && (
                  <BoxEdges
                    size={character.footprint.size}
                    position={[0, character.footprint.size[1] / 2, 0]}
                    color={sel ? '#f5a524' : '#3a5a7a'}
                  />
                )}
              </>
            ) : (
              <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[0.6, 1, 0.6]} />
                <meshStandardMaterial color="#ef4444" wireframe />
              </mesh>
            )}
            {sel && (
              <group position={[0, (character?.footprint.size[1] ?? 1) + 0.3, 0]}>
                <Label highlight>{p.name}</Label>
              </group>
            )}
          </group>
        )
      })}

      {env.lights.map((l) => (
        <Fixture
          key={l.deviceId}
          id={l.deviceId}
          position={l.position}
          target={l.target}
          frame={frameRef}
          selected={is('light', l.deviceId)}
          onSelect={pick({ kind: 'light', id: l.deviceId })}
          register={register(`light:${l.deviceId}`)}
        />
      ))}

      {env.audio.map((a) => (
        <group
          key={a.deviceId}
          ref={register(`audio:${a.deviceId}`)}
          position={a.position}
          onClick={pick({ kind: 'audio', id: a.deviceId })}
        >
          <mesh castShadow>
            <boxGeometry args={[0.32, 0.42, 0.26]} />
            <meshStandardMaterial color={is('audio', a.deviceId) ? '#f5a524' : '#1e1b2e'} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.05, 0.131]}>
            <circleGeometry args={[0.1, 24]} />
            <meshStandardMaterial color={KIND.audio.hex} emissive={KIND.audio.hex} emissiveIntensity={0.35} />
          </mesh>
          {is('audio', a.deviceId) && (
            <group position={[0, 0.45, 0]}>
              <Label highlight>{a.deviceId}</Label>
            </group>
          )}
        </group>
      ))}

      {env.sensors.map((s) => (
        <group key={s.deviceId} onClick={pick({ kind: 'sensor', id: s.deviceId })}>
          <SensorZone
            position={s.position}
            range={s.range}
            active={activeSensors?.has(s.deviceId) ?? false}
            selected={is('sensor', s.deviceId)}
            label={s.name}
            register={register(`sensor:${s.deviceId}`)}
          />
        </group>
      ))}

      {editing && selected && <Gizmo env={env} selected={selected} editing={editing} objects={objects.current} register={register} />}
    </group>
  )
}

/** Transform gizmo bound to the selected object; writes the layout back as it moves. */
function Gizmo({
  env,
  selected,
  editing,
  objects,
  register,
}: {
  env: EnvironmentDefinition
  selected: NonNullable<StageSelection>
  editing: StageEditing
  objects: Map<string, THREE.Object3D>
  register: (key: string) => (o: THREE.Object3D | null) => void
}) {
  const light = selected.kind === 'light' ? env.lights.find((l) => l.deviceId === selected.id) : undefined
  const aiming = !!light && editing.aim
  const object = aiming ? objects.get(`target:${selected.id}`) : objects.get(`${selected.kind}:${selected.id}`)
  const kind = selected.kind
  // What each kind may do: figures turn about Y, zones and sensors resize, lights aim.
  const mode: GizmoMode | null =
    editing.mode === 'rotate'
      ? kind === 'placement'
        ? 'rotate'
        : null
      : editing.mode === 'scale'
        ? kind === 'keepOut' || kind === 'sensor'
          ? 'scale'
          : null
        : 'translate'
  const flat = kind === 'sensor' || kind === 'keepOut'

  const emit = (final: boolean) => {
    if (!object) return
    const p: Vec3 = [r2(object.position.x), r2(object.position.y), r2(object.position.z)]
    if (aiming && light) return editing.onChange({ kind: 'light', id: light.deviceId, target: p }, final)
    switch (kind) {
      case 'placement':
        return editing.onChange(
          {
            kind,
            id: selected.id,
            position: p,
            rotationY: Math.round(THREE.MathUtils.radToDeg(object.rotation.y) * 10) / 10,
          },
          final,
        )
      case 'light':
        return editing.onChange({ kind, id: selected.id, position: p }, final)
      case 'audio':
        return editing.onChange({ kind, id: selected.id, position: p }, final)
      case 'sensor': {
        const sensor = env.sensors.find((x) => x.deviceId === selected.id)
        if (!sensor) return
        const scale = object.scale.x
        if (final && scale !== 1) object.scale.set(1, 1, 1)
        return editing.onChange(
          {
            kind,
            id: selected.id,
            position: [p[0], sensor.position[1], p[2]],
            ...(final && scale !== 1 ? { range: r2(Math.max(0.1, sensor.range * scale)) } : {}),
          },
          final,
        )
      }
      case 'keepOut': {
        const zone = env.keepOut.find((z) => z.name === selected.id)
        if (!zone) return
        const half = size(zone.box.min, zone.box.max).map((n, i) => (n / 2) * (final ? object.scale.getComponent(i) : 1))
        if (final) object.scale.set(1, 1, 1)
        const c = [object.position.x, object.position.y, object.position.z]
        return editing.onChange(
          {
          kind,
          id: selected.id,
          box: {
            min: [r2((c[0] ?? 0) - (half[0] ?? 0)), r2((c[1] ?? 0) - (half[1] ?? 0)), r2((c[2] ?? 0) - (half[2] ?? 0))],
            max: [r2((c[0] ?? 0) + (half[0] ?? 0)), r2((c[1] ?? 0) + (half[1] ?? 0)), r2((c[2] ?? 0) + (half[2] ?? 0))],
          },
          },
          final,
        )
      }
    }
  }

  return (
    <>
      {light && (
        <>
          <mesh ref={register(`target:${light.deviceId}`)} position={light.target}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color={editing.aim ? '#f5a524' : '#f4c74f'} transparent opacity={editing.aim ? 1 : 0.6} />
          </mesh>
          <Line points={[light.position, light.target]} color="#f4c74f" dashed dashSize={0.15} gapSize={0.1} lineWidth={1} transparent opacity={0.7} />
        </>
      )}
      {object && mode && (
        <TransformControls
          object={object}
          mode={mode}
          size={0.8}
          showY={mode === 'rotate' ? true : !(flat && mode === 'translate')}
          showX={mode !== 'rotate'}
          showZ={mode !== 'rotate'}
          translationSnap={editing.snap ? 0.1 : null}
          rotationSnap={editing.snap ? Math.PI / 24 : null}
          scaleSnap={editing.snap ? 0.05 : null}
          onObjectChange={() => mode !== 'scale' && emit(false)}
          onMouseDown={() => {
            lastGizmoUse = performance.now()
          }}
          onMouseUp={() => {
            lastGizmoUse = performance.now()
            emit(true)
          }}
        />
      )}
    </>
  )
}
