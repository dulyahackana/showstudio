import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { Vec3 } from '@studio/schema'
import { type ReactNode, Suspense } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

const BG = '#0b111d'

/** A 3/4 camera that frames an axis-aligned box. */
export function framing(
  min: Vec3,
  max: Vec3,
  zoom = 1,
  fov = 40,
): { camera: [number, number, number]; target: [number, number, number] } {
  const c: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
  const d = (r / Math.sin(((fov / 2) * Math.PI) / 180)) * 0.9 * zoom
  const dir = [0.55, 0.62, 1]
  const n = Math.hypot(dir[0] ?? 0, dir[1] ?? 0, dir[2] ?? 0)
  return {
    camera: [c[0] + ((dir[0] ?? 0) / n) * d, c[1] + ((dir[1] ?? 0) / n) * d, c[2] + ((dir[2] ?? 0) / n) * d],
    target: [c[0], Math.max(0.4, c[1] * 0.7), c[2]],
  }
}

export function Viewport({
  children,
  camera = [5, 4, 7],
  target = [0, 1, 0],
  overlay,
  className,
  shadowScale = 14,
}: {
  children: ReactNode
  camera?: [number, number, number]
  target?: [number, number, number]
  overlay?: ReactNode
  className?: string
  shadowScale?: number
}) {
  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)} style={{ background: BG }} data-testid="viewport">
      <Canvas
        camera={{ position: camera, fov: 40, near: 0.05, far: 300 }}
        dpr={[1, 2]}
        shadows
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 22, 60]} />
        <hemisphereLight intensity={0.5} color="#cfe3ff" groundColor="#0f172a" />
        <directionalLight position={[6, 10, 6]} intensity={1.15} color="#fff3e0" castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-6, 4, -6]} intensity={0.55} color="#5cc8ea" />
        <Grid
          infiniteGrid
          cellSize={0.5}
          sectionSize={2}
          fadeDistance={40}
          fadeStrength={1.4}
          cellColor="#16203a"
          sectionColor="#24365a"
          cellThickness={0.6}
          sectionThickness={1}
          position={[0, -0.002, 0]}
        />
        <ContactShadows position={[0, 0.001, 0]} scale={shadowScale} blur={2.4} opacity={0.55} far={4} resolution={512} frames={Number.POSITIVE_INFINITY} />
        {/* Image-based lighting from virtual light panels: real reflections without an HDRI download. */}
        <Environment resolution={256} frames={1} environmentIntensity={0.55}>
          <Lightformer form="rect" intensity={2.4} color="#ffd9a8" position={[5, 6, 4]} scale={[6, 3, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.6} color="#5cc8ea" position={[-6, 3, -4]} scale={[5, 2, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[0, 8, 0]} scale={4} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.6} color="#7c5cff" position={[0, 1, -8]} scale={[10, 2, 1]} target={[0, 0, 0]} />
        </Environment>
        <Suspense fallback={null}>{children}</Suspense>
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.85} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.28} darkness={0.55} />
          <SMAA />
        </EffectComposer>
        <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI * 0.49} enableDamping dampingFactor={0.12} />
      </Canvas>
      {overlay && <div className="pointer-events-none absolute inset-0 p-3 [&>*]:pointer-events-auto">{overlay}</div>}
    </div>
  )
}

/** Frosted panel floating over a viewport. */
export function Glass({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-white/10 bg-[#0b111d]/75 shadow-2xl backdrop-blur-md', className)}>{children}</div>
  )
}
