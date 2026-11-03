import type { LightSample } from '@studio/playback'
import { type CharacterDefinition, type EnvironmentDefinition, refKey, type Vec3 } from '@studio/schema'
import { useId } from 'react'
import type { STATE_STYLE } from '@/components/kind'
import { cn } from '@/lib/utils'

type DeviceStatus = keyof typeof STATE_STYLE

const RING: Record<DeviceStatus, string> = {
  idle: 'stroke-muted-foreground/50',
  ready: 'stroke-ok',
  armed: 'stroke-warn',
  running: 'stroke-motion',
  estopped: 'stroke-danger',
  faulted: 'stroke-danger',
  offline: 'stroke-muted-foreground/40',
}

export interface FloorPlanProps {
  env: EnvironmentDefinition
  characters?: ReadonlyMap<string, CharacterDefinition>
  /** Live fixture output: colours the fixtures and the light pools on the floor. */
  lights?: Record<string, LightSample>
  /** Device status rings (fleet, operator). */
  states?: Record<string, DeviceStatus>
  activeSensors?: ReadonlySet<string>
  /** Names on the plan: everything, figures (and keep-out zones) only, or none. */
  labels?: boolean | 'figures'
  selected?: string | null
  onSelect?: (deviceId: string) => void
  className?: string
}

const xz = (v: Vec3) => [v[0], v[2]] as const

/**
 * Top-down plan of an attraction, in meters (x right, z toward the guests). Used for
 * thumbnails, the fleet map and the operator's live view.
 */
export function FloorPlan({
  env,
  characters,
  lights,
  states,
  activeSensors,
  labels = false,
  selected,
  onSelect,
  className,
}: FloorPlanProps) {
  const id = useId().replace(/:/g, '')
  const xs: number[] = [env.stage.min[0], env.stage.max[0]]
  const zs: number[] = [env.stage.min[2], env.stage.max[2]]
  for (const k of env.keepOut) {
    xs.push(k.box.min[0], k.box.max[0])
    zs.push(k.box.min[2], k.box.max[2])
  }
  for (const s of env.sensors) {
    xs.push(s.position[0] - s.range, s.position[0] + s.range)
    zs.push(s.position[2] - s.range, s.position[2] + s.range)
  }
  for (const d of [...env.lights, ...env.audio, ...env.placements]) {
    xs.push(d.position[0])
    zs.push(d.position[2])
  }
  const pad = 0.8
  const minX = Math.min(...xs) - pad
  const minZ = Math.min(...zs) - pad
  const w = Math.max(...xs) + pad - minX
  const h = Math.max(...zs) + pad - minZ
  const font = Math.max(w, h) * 0.026
  const ring = (deviceId: string) => (states?.[deviceId] ? RING[states[deviceId]] : undefined)
  const allLabels = labels === true
  const click = (deviceId: string) => (onSelect ? () => onSelect(deviceId) : undefined)
  const interactive = onSelect ? 'cursor-pointer' : undefined

  return (
    <svg
      viewBox={`${minX} ${minZ} ${w} ${h}`}
      className={cn('block h-full w-full', className)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Floor plan of ${env.name}`}
    >
      <defs>
        <pattern
          id={`hatch-${id}`}
          width={0.35}
          height={0.35}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={0.35} className="stroke-foreground/20" strokeWidth={0.05} />
        </pattern>
        <pattern id={`grid-${id}`} width={1} height={1} patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" className="stroke-foreground/[0.06]" strokeWidth={0.02} />
        </pattern>
        <radialGradient id={`pool-${id}`}>
          <stop offset="0%" stopColor="white" stopOpacity={0.9} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* stage */}
      <rect
        x={env.stage.min[0]}
        y={env.stage.min[2]}
        width={env.stage.max[0] - env.stage.min[0]}
        height={env.stage.max[2] - env.stage.min[2]}
        className="fill-motion/[0.04]"
      />
      <rect
        x={env.stage.min[0]}
        y={env.stage.min[2]}
        width={env.stage.max[0] - env.stage.min[0]}
        height={env.stage.max[2] - env.stage.min[2]}
        fill={`url(#grid-${id})`}
      />

      {/* light pools on the floor */}
      {lights &&
        env.lights.map((l) => {
          const s = lights[l.deviceId]
          if (!s || s.intensity <= 0.01) return null
          const [tx, tz] = xz(l.target)
          const color = `rgb(${Math.round(s.r * 255)} ${Math.round(s.g * 255)} ${Math.round(s.b * 255)})`
          return (
            <g key={`pool-${l.deviceId}`} style={{ mixBlendMode: 'screen' }}>
              <circle
                cx={tx}
                cy={tz}
                r={1.1 + 0.9 * s.intensity}
                fill={`url(#pool-${id})`}
                opacity={0.55 * s.intensity}
              />
              <circle cx={tx} cy={tz} r={1.1 + 0.9 * s.intensity} fill={color} opacity={0.32 * s.intensity} />
            </g>
          )
        })}

      <rect
        x={env.stage.min[0]}
        y={env.stage.min[2]}
        width={env.stage.max[0] - env.stage.min[0]}
        height={env.stage.max[2] - env.stage.min[2]}
        fill="none"
        className="stroke-motion/60"
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />

      {/* keep-out zones */}
      {env.keepOut.map((k) => (
        <g key={k.name}>
          <rect
            x={k.box.min[0]}
            y={k.box.min[2]}
            width={k.box.max[0] - k.box.min[0]}
            height={k.box.max[2] - k.box.min[2]}
            fill={`url(#hatch-${id})`}
            className="stroke-foreground/30"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
          {labels && (
            <text
              x={(k.box.min[0] + k.box.max[0]) / 2}
              y={(k.box.min[2] + k.box.max[2]) / 2 + font * 0.35}
              textAnchor="middle"
              fontSize={font * 0.85}
              className="fill-muted-foreground font-medium"
            >
              {k.name}
            </text>
          )}
        </g>
      ))}

      {/* sensors */}
      {env.sensors.map((s) => {
        const [x, z] = xz(s.position)
        const active = activeSensors?.has(s.deviceId)
        return (
          <g key={s.deviceId} onClick={click(s.deviceId)} className={interactive}>
            <circle
              cx={x}
              cy={z}
              r={s.range}
              className={cn(active ? 'fill-sensor/30' : 'fill-sensor/[0.07]', 'stroke-sensor/70')}
              strokeWidth={1}
              strokeDasharray={active ? undefined : '3 3'}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x} cy={z} r={0.11} className="fill-sensor" />
            {ring(s.deviceId) && (
              <circle
                cx={x}
                cy={z}
                r={0.24}
                fill="none"
                className={ring(s.deviceId)}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {allLabels && (
              <text x={x} y={z + 0.5} textAnchor="middle" fontSize={font * 0.8} className="fill-sensor">
                {s.name}
              </text>
            )}
          </g>
        )
      })}

      {/* figures: footprint, facing +z */}
      {env.placements.map((p) => {
        const c = characters?.get(refKey(p.character))
        const [sx, , sz] = c?.footprint.size ?? [0.8, 1, 0.8]
        const [x, z] = xz(p.position)
        const isSel = selected === p.deviceId
        return (
          <g key={p.deviceId} onClick={click(p.deviceId)} className={interactive}>
            <g transform={`translate(${x} ${z}) rotate(${-p.rotationY})`}>
              <rect
                x={-sx / 2}
                y={-sz / 2}
                width={sx}
                height={sz}
                rx={0.08}
                className={cn('fill-motion/20', isSel ? 'stroke-primary' : (ring(p.deviceId) ?? 'stroke-motion'))}
                strokeWidth={isSel || ring(p.deviceId) ? 2 : 1.3}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={c || !characters ? undefined : '3 2'}
              />
              <path
                d={`M ${-0.16} ${sz / 2 - 0.05} L 0 ${sz / 2 + 0.18} L 0.16 ${sz / 2 - 0.05} Z`}
                className="fill-motion"
              />
            </g>
            {labels && (
              <text
                x={x}
                y={z + font * 0.35}
                textAnchor="middle"
                fontSize={font}
                className="fill-foreground font-medium"
              >
                {p.name}
              </text>
            )}
          </g>
        )
      })}

      {/* speakers */}
      {env.audio.map((a) => {
        const [x, z] = xz(a.position)
        return (
          <g key={a.deviceId} onClick={click(a.deviceId)} className={interactive}>
            <rect
              x={x - 0.16}
              y={z - 0.16}
              width={0.32}
              height={0.32}
              rx={0.06}
              className="fill-audio/25 stroke-audio"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x} cy={z} r={0.07} className="fill-audio" />
            {ring(a.deviceId) && (
              <circle
                cx={x}
                cy={z}
                r={0.28}
                fill="none"
                className={ring(a.deviceId)}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {allLabels && (
              <text x={x} y={z + 0.55} textAnchor="middle" fontSize={font * 0.8} className="fill-audio">
                {a.name}
              </text>
            )}
          </g>
        )
      })}

      {/* fixtures, aimed at their targets */}
      {env.lights.map((l) => {
        const [x, z] = xz(l.position)
        const [tx, tz] = xz(l.target)
        const s = lights?.[l.deviceId]
        const lit = s && s.intensity > 0.01
        const color = lit
          ? `rgb(${Math.round(s.r * 255)} ${Math.round(s.g * 255)} ${Math.round(s.b * 255)})`
          : undefined
        return (
          <g key={l.deviceId} onClick={click(l.deviceId)} className={interactive}>
            <line
              x1={x}
              y1={z}
              x2={tx}
              y2={tz}
              className="stroke-light/40"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x}
              cy={z}
              r={0.17}
              className={lit ? undefined : 'fill-light/25'}
              style={lit ? { fill: color } : undefined}
              stroke={lit ? 'white' : undefined}
              strokeOpacity={0.6}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {!lit && (
              <circle
                cx={x}
                cy={z}
                r={0.17}
                fill="none"
                className="stroke-light"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {ring(l.deviceId) && (
              <circle
                cx={x}
                cy={z}
                r={0.28}
                fill="none"
                className={ring(l.deviceId)}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {allLabels && (
              <text x={x} y={z - 0.32} textAnchor="middle" fontSize={font * 0.8} className="fill-light">
                {l.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
