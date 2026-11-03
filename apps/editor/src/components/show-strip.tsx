import { rgbToHex, sampleLight, sampleMotion } from '@studio/playback'
import type { ShowDefinition } from '@studio/schema'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

const BUCKETS = 120

/**
 * A show at a glance: motion activity per figure (cyan), what each fixture
 * outputs (its real colours), audio cues (violet) and sensor-response windows (green).
 */
export function ShowStrip({
  show,
  progress,
  className,
}: {
  show: Pick<ShowDefinition, 'durationMs' | 'tracks' | 'behaviors'>
  /** 0..1: draws a playhead and dims what has played. */
  progress?: number | null
  className?: string
}) {
  const data = useMemo(() => {
    const dt = show.durationMs / BUCKETS
    // Motion: summed joint speed per bucket, normalised across the whole show.
    const figures = Object.entries(show.tracks.motion).map(([deviceId, joints]) => {
      const activity = new Array<number>(BUCKETS).fill(0)
      for (const keys of Object.values(joints)) {
        if (!keys.length) continue
        const fallback = keys[0]?.v ?? 0
        let prev = sampleMotion(keys, 0, fallback)
        for (let i = 0; i < BUCKETS; i++) {
          const v = sampleMotion(keys, (i + 1) * dt, fallback)
          activity[i] = (activity[i] ?? 0) + Math.abs(v - prev)
          prev = v
        }
      }
      return { deviceId, activity }
    })
    const peak = Math.max(1e-6, ...figures.flatMap((f) => f.activity))
    const lights = Object.entries(show.tracks.lights)
      .filter(([, keys]) => keys.length)
      .slice(0, 3)
      .map(([deviceId, keys]) => ({
        deviceId,
        cells: Array.from({ length: BUCKETS }, (_, i) => {
          const s = sampleLight(keys, (i + 0.5) * dt)
          return { color: rgbToHex(s.r, s.g, s.b), a: s.intensity }
        }),
      }))
    const cues = Object.values(show.tracks.audio).flat()
    return { figures: figures.map((f) => ({ ...f, activity: f.activity.map((a) => a / peak) })), lights, cues }
  }, [show])

  const lanes = Math.max(1, data.figures.length) + data.lights.length + 1
  const H = lanes * 10 + 6
  const at = (t: number) => (t / show.durationMs) * BUCKETS

  return (
    <svg
      viewBox={`0 0 ${BUCKETS} ${H}`}
      preserveAspectRatio="none"
      className={cn('block h-14 w-full', className)}
      role="img"
      aria-label="Show overview"
    >
      {data.figures.map((f, row) => {
        const y0 = row * 10 + 9
        const d = `M 0 ${y0} ${f.activity.map((a, i) => `L ${i + 0.5} ${y0 - Math.sqrt(a) * 8}`).join(' ')} L ${BUCKETS} ${y0} Z`
        return (
          <g key={f.deviceId}>
            <line
              x1={0}
              x2={BUCKETS}
              y1={y0}
              y2={y0}
              className="stroke-motion/20"
              strokeWidth={0.3}
              vectorEffect="non-scaling-stroke"
            />
            <path d={d} className="fill-motion/45 stroke-motion" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
      {data.lights.map((l, i) => {
        const y = (Math.max(1, data.figures.length) + i) * 10 + 1.5
        return (
          <g key={l.deviceId}>
            {l.cells.map((c, x) => (
              <rect key={x} x={x} y={y} width={1.05} height={7} fill={c.color} opacity={Math.max(0.05, c.a)} />
            ))}
          </g>
        )
      })}
      {(() => {
        const y = (lanes - 1) * 10 + 1.5
        return (
          <g>
            {show.behaviors
              .filter((b) => b.enabled)
              .map((b) =>
                b.window ? (
                  <rect
                    key={b.id}
                    x={at(b.window.fromMs)}
                    y={y + 5.5}
                    width={Math.max(0.6, at(b.window.toMs - b.window.fromMs))}
                    height={1.6}
                    rx={0.8}
                    className="fill-sensor/70"
                  />
                ) : (
                  <rect key={b.id} x={0} y={y + 5.5} width={BUCKETS} height={1.6} rx={0.8} className="fill-sensor/25" />
                ),
              )}
            {data.cues.map((c) => (
              <rect key={`${c.id}-${c.t}`} x={at(c.t)} y={y} width={1.6} height={4.5} rx={0.5} className="fill-audio" />
            ))}
          </g>
        )
      })()}
      {progress != null && (
        <>
          <rect x={0} y={0} width={progress * BUCKETS} height={H} className="fill-background/45" />
          <line
            x1={progress * BUCKETS}
            x2={progress * BUCKETS}
            y1={0}
            y2={H}
            className="stroke-primary"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}
