import type { DeviceState, RevisionStatus, StagedStatus, TargetStatus } from '@studio/schema'
import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import { STATE_STYLE, StatusDot } from '@/components/kind'
import { Badge } from '@/components/ui/badge'
import type { SaveStatus } from '@/lib/doc-editor'
import { cn } from '@/lib/utils'

const tone = {
  ok: 'border-ok/25 bg-ok/10 text-ok',
  warn: 'border-warn/25 bg-warn/10 text-warn',
  bad: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-motion/25 bg-motion/10 text-motion',
  review: 'border-review/30 bg-review/10 text-review',
  sensor: 'border-sensor/25 bg-sensor/10 text-sensor',
  muted: 'border-border bg-muted/40 text-muted-foreground',
} as const

export function ToneBadge({
  t,
  children,
  className,
}: {
  t: keyof typeof tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('h-5 rounded-full px-2 text-[11px] font-medium', tone[t], className)}>
      {children}
    </Badge>
  )
}

export function RevisionBadge({ status }: { status: RevisionStatus }) {
  const t = status === 'approved' ? 'ok' : status === 'rejected' ? 'bad' : 'review'
  const label = status === 'published' ? 'in review' : status
  return <ToneBadge t={t}>{label}</ToneBadge>
}

export function DeviceStateBadge({ state, online }: { state: DeviceState; online: boolean }) {
  const key = online ? state : 'offline'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', STATE_STYLE[key].text)}>
      <StatusDot state={key} />
      {STATE_STYLE[key].label}
    </span>
  )
}

export function StagedBadge({ status }: { status: StagedStatus | TargetStatus }) {
  const t: Record<string, keyof typeof tone> = {
    staged: 'ok',
    downloading: 'info',
    pending: 'muted',
    rejected: 'bad',
    offline: 'muted',
  }
  return <ToneBadge t={t[status] ?? 'muted'}>{status}</ToneBadge>
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: CircleCheck, text: 'Saved', cls: 'text-muted-foreground' },
    unsaved: { icon: CircleDashed, text: 'Unsaved', cls: 'text-muted-foreground' },
    saving: { icon: LoaderCircle, text: 'Saving…', cls: 'text-muted-foreground [&_svg]:animate-spin' },
    conflict: { icon: TriangleAlert, text: 'Conflict', cls: 'text-warn' },
    error: { icon: CircleAlert, text: 'Not saved', cls: 'text-danger' },
  }[status]
  const Icon = map.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', map.cls)} data-testid="save-status">
      <Icon className="size-3.5" />
      {map.text}
    </span>
  )
}
