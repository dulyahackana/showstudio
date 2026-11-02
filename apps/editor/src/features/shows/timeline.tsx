import { rgbToHex, sampleJoint, sampleLight } from '@studio/playback'
import {
  type AudioCue,
  type Behavior,
  type CharacterDefinition,
  type EnvironmentDefinition,
  type JointLimits,
  type LightKey,
  type MotionKey,
  refKey,
  type Tracks,
} from '@studio/schema'
import { useSelector } from '@tanstack/react-store'
import type { Draft } from 'immer'
import { Bot, ChevronDown, ChevronRight, Lightbulb, Radar, Volume2 } from 'lucide-react'
import { memo, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Playback } from './playback'
import {
  clamp,
  clampKeyTime,
  draftKeys,
  issueKey,
  keysOf,
  type RowRef,
  round,
  rowKey,
  type Selection,
  sameRow,
  snap,
  tickSteps,
  upsertKey,
} from './timeline-math'

const HEADER_W = 220
const RULER_H = 26
const PAD = 6
const RESPONSE_H = 18

type GroupKind = 'doll' | 'light' | 'audio'
const GROUP_STYLE: Record<GroupKind, { icon: typeof Bot; text: string; bar: string }> = {
  doll: { icon: Bot, text: 'text-motion', bar: 'bg-motion' },
  light: { icon: Lightbulb, text: 'text-light', bar: 'bg-light' },
  audio: { icon: Volume2, text: 'text-audio', bar: 'bg-audio' },
}

type Row =
  | { type: 'responses'; height: number }
  | { type: 'group'; id: string; label: string; sub: string; kind: GroupKind }
  | { type: 'motion'; ref: Extract<RowRef, { kind: 'motion' }>; joint: JointLimits; height: number }
  | { type: 'light'; ref: Extract<RowRef, { kind: 'light' }>; label: string; height: number }
  | { type: 'audio'; ref: Extract<RowRef, { kind: 'audio' }>; label: string; maxDb: number; height: number }

type TrackRow = Extract<Row, { ref: unknown }>

export interface TimelineProps {
  tracks: Tracks
  durationMs: number
  environment: EnvironmentDefinition
  characters: ReadonlyMap<string, CharacterDefinition>
  playback: Playback
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  edit: (fn: (t: Draft<Tracks>) => void, coalesceKey?: string) => void
  issueKeys: ReadonlySet<string>
  audioDurations: Record<string, number>
  onAddAudioCue: (deviceId: string, t: number) => void
  pxPerSecond: number
  /** Sensor responses of the main timeline: windows and preview runs get their own lane. */
  behaviors?: readonly Behavior[]
}

function buildRows(
  env: EnvironmentDefinition,
  characters: ReadonlyMap<string, CharacterDefinition>,
  collapsed: Set<string>,
  behaviors: readonly Behavior[],
): Row[] {
  const rows: Row[] = []
  if (behaviors.length) rows.push({ type: 'responses', height: 8 + behaviors.length * RESPONSE_H })
  for (const p of env.placements) {
    const c = characters.get(refKey(p.character))
    rows.push({
      type: 'group',
      id: p.deviceId,
      label: p.name,
      sub: `${p.deviceId} · ${c?.joints.length ?? 0} joints`,
      kind: 'doll',
    })
    if (!c || collapsed.has(p.deviceId)) continue
    for (const j of c.joints)
      rows.push({ type: 'motion', ref: { kind: 'motion', deviceId: p.deviceId, joint: j.name }, joint: j, height: 38 })
  }
  if (env.lights.length) {
    rows.push({ type: 'group', id: '__lights', label: 'Lighting', sub: `${env.lights.length} fixtures`, kind: 'light' })
    if (!collapsed.has('__lights'))
      for (const l of env.lights)
        rows.push({ type: 'light', ref: { kind: 'light', deviceId: l.deviceId }, label: l.name, height: 30 })
  }
  if (env.audio.length) {
    rows.push({ type: 'group', id: '__audio', label: 'Audio', sub: `${env.audio.length} zones`, kind: 'audio' })
    if (!collapsed.has('__audio'))
      for (const a of env.audio)
        rows.push({
          type: 'audio',
          ref: { kind: 'audio', deviceId: a.deviceId },
          label: a.name,
          maxDb: a.maxVolumeDb,
          height: 32,
        })
  }
  return rows
}

const Diamond = ({
  x,
  y,
  selected,
  bad,
  onPointerDown,
}: {
  x: number
  y: number
  selected: boolean
  bad: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) => (
  <rect
    x={x - 4.5}
    y={y - 4.5}
    width={9}
    height={9}
    transform={`rotate(45 ${x} ${y})`}
    className={cn(
      'cursor-grab stroke-background',
      bad ? 'fill-danger' : selected ? 'fill-primary' : 'fill-motion',
      selected && 'stroke-primary',
    )}
    strokeWidth={1.5}
    onPointerDown={onPointerDown}
    data-testid="key"
  />
)

const MotionLane = memo(function MotionLane({
  keys,
  joint,
  width,
  height,
  pxPerSecond,
  selectedIndex,
  badIndexes,
  onKeyDown,
}: {
  keys: readonly MotionKey[]
  joint: JointLimits
  width: number
  height: number
  pxPerSecond: number
  selectedIndex: number | null
  badIndexes: ReadonlySet<number>
  onKeyDown: (e: ReactPointerEvent, index: number) => void
}) {
  const span = joint.max - joint.min || 1
  const y = (v: number) => PAD + (1 - (v - joint.min) / span) * (height - 2 * PAD)
  const points = useMemo(() => {
    const yy = (v: number) => PAD + (1 - (v - joint.min) / (joint.max - joint.min || 1)) * (height - 2 * PAD)
    const pts: string[] = []
    for (let x = 0; x <= width; x += 3)
      pts.push(`${x},${yy(sampleJoint(keys, joint.home, (x / pxPerSecond) * 1000)).toFixed(1)}`)
    return pts.join(' ')
  }, [keys, joint, width, height, pxPerSecond])
  const homeY = y(joint.home)
  return (
    <>
      <line
        x1={0}
        x2={width}
        y1={y(joint.home)}
        y2={y(joint.home)}
        className="stroke-muted-foreground/30"
        strokeDasharray="3 4"
      />
      <polygon points={`0,${homeY} ${points} ${width},${homeY}`} className="fill-motion/10" />
      <polyline points={points} fill="none" className="stroke-motion" strokeWidth={1.5} strokeLinejoin="round" />
      {keys.map((k, i) => (
        <Diamond
          key={`${i}-${k.t}`}
          x={(k.t / 1000) * pxPerSecond}
          y={y(k.v)}
          selected={selectedIndex === i}
          bad={badIndexes.has(i)}
          onPointerDown={(e) => onKeyDown(e, i)}
        />
      ))}
    </>
  )
})

const LightLane = memo(function LightLane({
  keys,
  width,
  height,
  pxPerSecond,
  selectedIndex,
  badIndexes,
  onKeyDown,
}: {
  keys: readonly LightKey[]
  width: number
  height: number
  pxPerSecond: number
  selectedIndex: number | null
  badIndexes: ReadonlySet<number>
  onKeyDown: (e: ReactPointerEvent, index: number) => void
}) {
  const segments = useMemo(() => {
    const out: { x: number; fill: string; opacity: number }[] = []
    for (let x = 0; x < width; x += 4) {
      const s = sampleLight(keys, (x / pxPerSecond) * 1000)
      out.push({ x, fill: rgbToHex(s.r, s.g, s.b), opacity: s.intensity })
    }
    return out
  }, [keys, width, pxPerSecond])
  return (
    <>
      {segments.map((s) => (
        <rect
          key={s.x}
          x={s.x}
          y={5}
          width={4.5}
          height={height - 10}
          fill={s.fill}
          opacity={Math.max(0.05, s.opacity)}
        />
      ))}
      {keys.map((k, i) => (
        <Diamond
          key={`${i}-${k.t}`}
          x={(k.t / 1000) * pxPerSecond}
          y={height / 2}
          selected={selectedIndex === i}
          bad={badIndexes.has(i)}
          onPointerDown={(e) => onKeyDown(e, i)}
        />
      ))}
    </>
  )
})

const AudioLane = memo(function AudioLane({
  cues,
  height,
  pxPerSecond,
  durations,
  selectedIndex,
  badIndexes,
  onKeyDown,
}: {
  cues: readonly AudioCue[]
  height: number
  pxPerSecond: number
  durations: Record<string, number>
  selectedIndex: number | null
  badIndexes: ReadonlySet<number>
  onKeyDown: (e: ReactPointerEvent, index: number) => void
}) {
  return (
    <>
      {cues.map((c, i) => {
        const x = (c.t / 1000) * pxPerSecond
        const w = Math.max(10, ((durations[c.assetId] ?? 2000) / 1000) * pxPerSecond)
        return (
          <g key={c.id} onPointerDown={(e) => onKeyDown(e, i)} className="cursor-grab" data-testid="cue">
            <rect
              x={x}
              y={4}
              width={w}
              height={height - 8}
              rx={3}
              className={cn(
                badIndexes.has(i)
                  ? 'fill-danger/40 stroke-danger'
                  : selectedIndex === i
                    ? 'fill-primary/40 stroke-primary'
                    : 'fill-audio/25 stroke-audio',
              )}
            />
            <text x={x + 4} y={height / 2 + 4} className="pointer-events-none fill-foreground text-[10px]">
              {c.label}
            </text>
          </g>
        )
      })}
    </>
  )
})

function Playhead({
  playback,
  pxPerSecond,
  height,
  scroller,
}: {
  playback: Playback
  pxPerSecond: number
  height: number
  scroller: React.RefObject<HTMLDivElement | null>
}) {
  const t = useSelector(playback.store, (s) => s.t)
  const playing = useSelector(playback.store, (s) => s.playing)
  const x = HEADER_W + (t / 1000) * pxPerSecond
  useEffect(() => {
    const el = scroller.current
    if (!playing || !el) return
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER_W) el.scrollLeft = x - HEADER_W - 60
  }, [x, playing, scroller])
  return (
    <div
      className="pointer-events-none absolute top-0 z-40 w-px bg-primary shadow-[0_0_8px_var(--primary)]"
      style={{ left: x, height }}
      data-testid="playhead"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-sm bg-primary px-1 py-px font-mono text-[10px] leading-4 font-semibold whitespace-nowrap text-primary-foreground tabular shadow">
        {formatMs(t, false)}
      </div>
      <div className="absolute inset-y-0 left-[-3px] w-[7px] bg-primary/10" />
    </div>
  )
}

const EMPTY: readonly Behavior[] = []

/** Sensor responses: when each may fire (green window) and every run triggered in this preview. */
function ResponsesLane({
  behaviors,
  playback,
  pxPerSecond,
  width,
  height,
  durationMs,
}: {
  behaviors: readonly Behavior[]
  playback: Playback
  pxPerSecond: number
  width: number
  height: number
  durationMs: number
}) {
  useSelector(playback.store, (s) => s.activeBehaviors.join())
  const x = (t: number) => (t / 1000) * pxPerSecond
  return (
    <div className="flex border-b bg-sensor/[0.03]" style={{ height }}>
      <div
        className="sticky left-0 z-10 flex items-start gap-1.5 border-r bg-surface-2 px-2 pt-1.5 font-medium"
        style={{ width: HEADER_W }}
      >
        <Radar className="size-3.5 text-sensor" />
        <span>Sensor responses</span>
      </div>
      <svg width={width} height={height} className="block">
        {behaviors.map((b, i) => {
          const y = 4 + i * RESPONSE_H
          const from = b.window?.fromMs ?? 0
          const to = b.window?.toMs ?? durationMs
          return (
            <g key={b.id} opacity={b.enabled ? 1 : 0.35}>
              <rect x={x(from)} y={y + 3} width={Math.max(2, x(to - from))} height={RESPONSE_H - 8} rx={3} className="fill-sensor/12 stroke-sensor/40" strokeDasharray={b.window ? undefined : '3 3'} />
              <text x={x(from) + 6} y={y + RESPONSE_H / 2 + 3} className="fill-sensor text-[10px]">
                {b.name} · {b.trigger.sensorId}:{b.trigger.event}
              </text>
              {playback.started
                .filter((s) => s.id === b.id)
                .map((s) => (
                  <g key={`${s.id}-${s.startAt}`}>
                    <polygon
                      points={`${x(s.startAt)},${y + RESPONSE_H - 4} ${x(s.startAt + b.blendMs)},${y + 2} ${x(s.startAt + b.blendMs)},${y + RESPONSE_H - 4}`}
                      className="fill-primary/40"
                    />
                    <rect x={x(s.startAt + b.blendMs)} y={y + 2} width={x(b.durationMs)} height={RESPONSE_H - 6} rx={2} className="fill-primary/70" />
                    <polygon
                      points={`${x(s.startAt + b.blendMs + b.durationMs)},${y + 2} ${x(s.startAt + 2 * b.blendMs + b.durationMs)},${y + RESPONSE_H - 4} ${x(s.startAt + b.blendMs + b.durationMs)},${y + RESPONSE_H - 4}`}
                      className="fill-primary/40"
                    />
                  </g>
                ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Multi-track show timeline: motion curves per joint, light colour bands, audio cues. */
export function Timeline(props: TimelineProps) {
  const { tracks, durationMs, environment, characters, playback, selection, onSelect, edit, issueKeys, pxPerSecond } =
    props
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const scroller = useRef<HTMLDivElement>(null)
  const behaviors = props.behaviors ?? EMPTY
  const rows = useMemo(
    () => buildRows(environment, characters, collapsed, behaviors),
    [environment, characters, collapsed, behaviors],
  )
  const laneW = Math.max(200, (durationMs / 1000) * pxPerSecond)
  const totalH = RULER_H + rows.reduce((h, r) => h + (r.type === 'group' ? 28 : r.height), 0)
  const xToT = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect()
    return clamp(((clientX - rect.left) / pxPerSecond) * 1000, 0, durationMs)
  }

  const badFor = (ref: RowRef): ReadonlySet<number> => {
    const set = new Set<number>()
    const joint = ref.kind === 'motion' ? ref.joint : undefined
    const n = keysOf(tracks, ref).length
    for (let i = 0; i < n; i++) if (issueKeys.has(issueKey(ref.deviceId, joint, i))) set.add(i)
    return set
  }

  const startDrag = (e: ReactPointerEvent, row: TrackRow, index: number) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect({ row: row.ref, index })
    const keys = keysOf(tracks, row.ref)
    const key = keys[index]
    if (!key) return
    const startX = e.clientX
    const startY = e.clientY
    const origT = key.t
    const origV = 'v' in key ? key.v : 0
    const coalesce = `drag:${rowKey(row.ref)}:${index}:${Date.now()}`
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return
      moved = true
      const raw = origT + ((ev.clientX - startX) / pxPerSecond) * 1000
      const t =
        row.type === 'audio'
          ? clamp(snap(raw, ev.shiftKey ? 1 : 50), 0, durationMs)
          : clampKeyTime(keys, index, ev.shiftKey ? Math.round(raw) : snap(raw), durationMs)
      let v = origV
      if (row.type === 'motion' && !ev.altKey) {
        const span = row.joint.max - row.joint.min
        v = round(clamp(origV - ((ev.clientY - startY) / (row.height - 2 * PAD)) * span, row.joint.min, row.joint.max))
      }
      edit((tr) => {
        const k = draftKeys(tr as Tracks, row.ref)[index]
        if (!k) return
        k.t = t
        if (row.type === 'motion' && 'v' in k) k.v = v
      }, coalesce)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const addKey = (row: TrackRow, t: number) => {
    const at = snap(t)
    if (row.type === 'audio') return props.onAddAudioCue(row.ref.deviceId, at)
    let index = 0
    if (row.type === 'motion') {
      const keys = keysOf(tracks, row.ref) as MotionKey[]
      const v = round(clamp(sampleJoint(keys, row.joint.home, at), row.joint.min, row.joint.max))
      edit((tr) => {
        index = upsertKey(draftKeys(tr as Tracks, row.ref) as MotionKey[], { t: at, v, interp: 'ease' })
      })
    } else {
      const keys = keysOf(tracks, row.ref) as LightKey[]
      const s = sampleLight(keys, at)
      const color = s.intensity > 0 ? rgbToHex(s.r, s.g, s.b) : '#ffffff'
      edit((tr) => {
        index = upsertKey(draftKeys(tr as Tracks, row.ref) as LightKey[], {
          t: at,
          color,
          intensity: s.intensity > 0 ? round(s.intensity) : 1,
          interp: 'linear',
        })
      })
    }
    onSelect({ row: row.ref, index })
  }

  const scrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    playback.seek(xToT(e.clientX, el))
    const move = (ev: PointerEvent) => playback.seek(xToT(ev.clientX, el))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const { major, minor } = tickSteps(pxPerSecond)
  const ticks = useMemo(() => {
    const out: { t: number; major: boolean }[] = []
    for (let t = 0; t <= durationMs; t += minor) out.push({ t, major: t % major === 0 })
    return out
  }, [durationMs, major, minor])

  return (
    <div
      ref={scroller}
      className="relative h-full overflow-auto overscroll-contain text-xs select-none"
      data-testid="timeline"
    >
      <div className="relative" style={{ width: HEADER_W + laneW, height: totalH }}>
        {/* ruler */}
        <div className="sticky top-0 z-30 flex border-b bg-sidebar" style={{ height: RULER_H }}>
          <div
            className="sticky left-0 z-10 flex items-center justify-between border-r bg-sidebar px-3 text-[11px] text-muted-foreground"
            style={{ width: HEADER_W }}
          >
            <span className="text-eyebrow">Tracks</span>
            <span className="font-mono">{formatMs(durationMs, false)}</span>
          </div>
          <div className="relative cursor-ew-resize" style={{ width: laneW }} onPointerDown={scrub} data-testid="ruler">
            {ticks.map((tk) => (
              <div
                key={tk.t}
                className={cn(
                  'absolute bottom-0 w-px',
                  tk.major ? 'h-2.5 bg-muted-foreground/50' : 'h-1 bg-muted-foreground/25',
                )}
                style={{ left: (tk.t / 1000) * pxPerSecond }}
              >
                {tk.major && (
                  <span className="absolute -top-4 left-1 font-mono text-[10px] whitespace-nowrap text-muted-foreground/80">
                    {formatMs(tk.t, false)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {rows.map((row) => {
          if (row.type === 'responses')
            return <ResponsesLane key="responses" behaviors={behaviors} playback={playback} pxPerSecond={pxPerSecond} width={laneW} height={row.height} durationMs={durationMs} />
          if (row.type === 'group') {
            const isCollapsed = collapsed.has(row.id)
            const g = GROUP_STYLE[row.kind]
            return (
              <div key={`g-${row.id}`} className="flex h-7 border-b bg-surface-2/60">
                <button
                  type="button"
                  className="sticky left-0 z-10 flex items-center gap-1.5 border-r bg-surface-2 px-2 text-left font-medium"
                  style={{ width: HEADER_W }}
                  onClick={() =>
                    setCollapsed((c) => {
                      const next = new Set(c)
                      if (next.has(row.id)) next.delete(row.id)
                      else next.add(row.id)
                      return next
                    })
                  }
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  )}
                  <g.icon className={cn('size-3.5', g.text)} />
                  <span className="truncate">{row.label}</span>
                  <span className="ml-auto truncate text-[10px] font-normal text-muted-foreground">{row.sub}</span>
                </button>
                <div style={{ width: laneW }} />
              </div>
            )
          }
          const selectedRow = sameRow(selection?.row, row.ref)
          const selectedIndex = selectedRow ? (selection?.index ?? null) : null
          const label = row.type === 'motion' ? row.ref.joint : row.label
          const meta =
            row.type === 'motion'
              ? `${row.joint.min}…${row.joint.max}${row.joint.type === 'revolute' ? '°' : 'm'}`
              : row.type === 'audio'
                ? `≤ ${row.maxDb} dB`
                : row.ref.deviceId
          return (
            <div
              key={rowKey(row.ref)}
              className={cn('flex border-b', selectedRow && 'bg-primary/5')}
              style={{ height: row.height }}
            >
              <button
                type="button"
                className={cn(
                  'sticky left-0 z-10 flex items-center gap-2 border-r bg-background px-2 pl-6 text-left transition hover:bg-surface-2',
                  selectedRow && 'bg-primary/10 shadow-[inset_2px_0_0_0_var(--primary)]',
                )}
                style={{ width: HEADER_W }}
                onClick={() => onSelect({ row: row.ref, index: null })}
                data-testid={`row-${rowKey(row.ref)}`}
              >
                <span className="truncate font-mono">{label}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{meta}</span>
              </button>
              <svg
                width={laneW}
                height={row.height}
                className="block"
                onPointerDown={(e) => {
                  onSelect({ row: row.ref, index: null })
                  playback.seek(xToT(e.clientX, e.currentTarget))
                }}
                onDoubleClick={(e) => addKey(row, xToT(e.clientX, e.currentTarget))}
                data-testid={`lane-${rowKey(row.ref)}`}
              >
                <title>Double-click to add a key</title>
                {row.type === 'motion' && (
                  <MotionLane
                    keys={keysOf(tracks, row.ref) as MotionKey[]}
                    joint={row.joint}
                    width={laneW}
                    height={row.height}
                    pxPerSecond={pxPerSecond}
                    selectedIndex={selectedIndex}
                    badIndexes={badFor(row.ref)}
                    onKeyDown={(e, i) => startDrag(e, row, i)}
                  />
                )}
                {row.type === 'light' && (
                  <LightLane
                    keys={keysOf(tracks, row.ref) as LightKey[]}
                    width={laneW}
                    height={row.height}
                    pxPerSecond={pxPerSecond}
                    selectedIndex={selectedIndex}
                    badIndexes={badFor(row.ref)}
                    onKeyDown={(e, i) => startDrag(e, row, i)}
                  />
                )}
                {row.type === 'audio' && (
                  <AudioLane
                    cues={keysOf(tracks, row.ref) as AudioCue[]}
                    height={row.height}
                    pxPerSecond={pxPerSecond}
                    durations={props.audioDurations}
                    selectedIndex={selectedIndex}
                    badIndexes={badFor(row.ref)}
                    onKeyDown={(e, i) => startDrag(e, row, i)}
                  />
                )}
              </svg>
            </div>
          )
        })}
        <Playhead playback={playback} pxPerSecond={pxPerSecond} height={totalH} scroller={scroller} />
      </div>
    </div>
  )
}
