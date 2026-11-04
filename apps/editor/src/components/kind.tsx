import type { DeviceKind, DeviceState } from '@studio/schema'
import { Bot, Joystick, Lightbulb, Radar, Volume2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One colour and icon per device kind, used everywhere (timeline, 3D, floor plans,
 * fleet, badges), so a figure, a light, a speaker, a sensor and a console read the same on every screen.
 */
export const KIND = {
  doll: {
    label: 'Figure',
    plural: 'Figures',
    icon: Bot,
    text: 'text-motion',
    soft: 'bg-motion/10 border-motion/25',
    dot: 'bg-motion',
    hex: '#5cc8ea',
  },
  light: {
    label: 'Light',
    plural: 'Lighting',
    icon: Lightbulb,
    text: 'text-light',
    soft: 'bg-light/10 border-light/25',
    dot: 'bg-light',
    hex: '#f7d24f',
  },
  audio: {
    label: 'Audio',
    plural: 'Audio',
    icon: Volume2,
    text: 'text-audio',
    soft: 'bg-audio/10 border-audio/25',
    dot: 'bg-audio',
    hex: '#b48cf2',
  },
  sensor: {
    label: 'Sensor',
    plural: 'Sensors',
    icon: Radar,
    text: 'text-sensor',
    soft: 'bg-sensor/10 border-sensor/25',
    dot: 'bg-sensor',
    hex: '#f472b6',
  },
  console: {
    label: 'Console',
    plural: 'Consoles',
    icon: Joystick,
    text: 'text-sky-300',
    soft: 'bg-sky-300/10 border-sky-300/25',
    dot: 'bg-sky-300',
    hex: '#7dd3fc',
  },
} as const satisfies Record<DeviceKind, unknown>

export const ACCENT = '#34d399'
export const DANGER = '#f0554b'

export function KindIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const k = KIND[kind]
  return <k.icon className={cn('size-4', k.text, className)} />
}

/** Rounded square with the kind icon, for list rows and cards. */
export function KindTile({ kind, className }: { kind: DeviceKind; className?: string }) {
  const k = KIND[kind]
  return (
    <span
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-md border', k.soft, className)}
    >
      <k.icon className={cn('size-3.5', k.text)} />
    </span>
  )
}

export const STATE_STYLE: Record<
  DeviceState | 'offline',
  { dot: string; text: string; pulse?: boolean; label: string }
> = {
  idle: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', label: 'idle' },
  ready: { dot: 'bg-ok', text: 'text-ok', label: 'ready' },
  armed: { dot: 'bg-warn', text: 'text-warn', pulse: true, label: 'armed' },
  running: { dot: 'bg-motion', text: 'text-motion', pulse: true, label: 'running' },
  standby: { dot: 'bg-sensor', text: 'text-sensor', label: 'standby' },
  estopped: { dot: 'bg-danger', text: 'text-danger', label: 'e-stopped' },
  faulted: { dot: 'bg-danger', text: 'text-danger', label: 'faulted' },
  offline: { dot: 'border border-muted-foreground/60 bg-transparent', text: 'text-muted-foreground', label: 'offline' },
}

export function StatusDot({ state, className }: { state: keyof typeof STATE_STYLE; className?: string }) {
  const s = STATE_STYLE[state]
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {s.pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', s.dot)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', s.dot)} />
    </span>
  )
}

/** Small uppercase label above a value. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-eyebrow">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight tabular">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
