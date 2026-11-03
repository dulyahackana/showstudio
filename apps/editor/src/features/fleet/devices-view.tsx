import type { Deployment, Device } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { FloorPlan } from '@/components/floor-plan'
import { KIND, KindTile, STATE_STYLE, StatusDot } from '@/components/kind'
import { Panel } from '@/components/page'
import { DeviceStateBadge, ToneBadge } from '@/components/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { formatMs, shortSha, timeAgo } from '@/lib/format'
import { deploymentsQuery, envStatusQuery, useCharacters, useRevision } from '@/lib/queries'
import { cn } from '@/lib/utils'

function DeviceRow({ d }: { d: Device }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3" data-testid={`device-${d.id}`}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-medium">{d.id}</span>
          <DeviceStateBadge state={d.state} online={d.online} />
        </div>
        <div className="flex flex-wrap gap-1">
          {d.staged.length === 0 && <span className="text-[11px] text-muted-foreground">nothing staged</span>}
          {d.staged.map((st) => (
            <Tooltip key={st.sha256}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px]',
                    st.status === 'staged'
                      ? 'border-ok/25 bg-ok/10 text-ok'
                      : st.status === 'rejected'
                        ? 'border-danger/30 bg-danger/10 text-danger'
                        : 'border-motion/25 bg-motion/10 text-motion',
                  )}
                >
                  {st.status === 'staged' ? '✓' : st.status === 'rejected' ? '✗' : '…'} {st.showId} r{st.revision}
                </span>
              </TooltipTrigger>
              <TooltipContent>{st.reason ?? `${st.status} · ${shortSha(st.sha256)}`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="truncate">
            {d.characterRef ? `${d.characterRef.id}@${d.characterRef.revision} · ` : ''}
            {d.firmware}
          </span>
          <span className="shrink-0">
            {d.active ? `▶ ${formatMs(d.active.showTimeMs, false)}` : timeAgo(d.lastSeenAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

function DeploymentRow({ d }: { d: Deployment }) {
  const staged = d.targets.filter((t) => t.status === 'staged').length
  const rejected = d.targets.filter((t) => t.status === 'rejected')
  const pct = (staged / Math.max(1, d.targets.length)) * 100
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">
            {d.name} <span className="font-mono text-xs text-muted-foreground">r{d.revision}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {shortSha(d.sha256)} · {d.createdBy} · {timeAgo(d.createdAt)}
          </div>
        </div>
        {d.goodToGo ? (
          <span data-testid={`good-to-go-${d.showId}`}>
            <ToneBadge t="ok">good to go</ToneBadge>
          </span>
        ) : (
          <ToneBadge t={rejected.length ? 'bad' : 'info'}>
            {staged}/{d.targets.length} staged
          </ToneBadge>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-[width]',
            rejected.length ? 'bg-danger' : d.goodToGo ? 'bg-ok' : 'bg-motion',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {rejected.map((t) => (
        <p key={t.deviceId} className="text-xs text-danger">
          <span className="font-mono">{t.deviceId}</span>: {t.reason}
        </p>
      ))}
    </div>
  )
}

/**
 * Every controller of one environment on its floor plan, grouped by kind, with the
 * deployments staged on them. showId narrows the deployments to one project's show.
 */
export function DevicesView({
  environmentId,
  showId,
  children,
}: {
  environmentId: string
  showId?: string
  children?: ReactNode
}) {
  const { data: status } = useQuery(envStatusQuery(environmentId))
  const { data: allDeployments = [] } = useQuery(deploymentsQuery(environmentId))
  // Latest deployment per bundle; redeploys of the same bytes are history, not new rows.
  const deployments = [...allDeployments]
    .filter((d) => !showId || d.showId === showId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((d, i, list) => list.findIndex((x) => x.sha256 === d.sha256) === i)
  const layout = useRevision<'environment'>(
    status?.environmentRevision ? { id: environmentId, revision: status.environmentRevision } : null,
  )
  const { characters } = useCharacters(layout.data?.content.placements.map((p) => p.character) ?? [])
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const states = Object.fromEntries(devices.map((d) => [d.id, d.online ? d.state : ('offline' as const)]))

  return (
    <div className="space-y-6">
      {status && online === 0 && (
        <Alert>
          <Terminal />
          <AlertTitle>No controllers online</AlertTitle>
          <AlertDescription>
            Start the attraction:{' '}
            <code className="rounded bg-muted px-1 font-mono">bun run sim:godot --env {environmentId}</code>{' '}
            (game-engine twin) or{' '}
            <code className="rounded bg-muted px-1 font-mono">bun run fleet-sim --env {environmentId}</code> (headless).
            Devices provision themselves and connect over the device protocol.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
            <span className="font-semibold" data-testid="devices-online">
              Devices ({online}/{devices.length} online)
            </span>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {(['ready', 'running', 'estopped', 'offline'] as const).map((st) => (
                <span key={st} className="inline-flex items-center gap-1.5">
                  <StatusDot state={st} /> {STATE_STYLE[st].label}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-blueprint relative min-h-80 flex-1 bg-sidebar/60">
            {layout.data && (
              <FloorPlan
                env={layout.data.content}
                characters={characters}
                states={states}
                labels
                className="absolute inset-0 p-5"
              />
            )}
          </div>
        </Panel>
        <div className="space-y-6">
          {children}
          <Panel className="flex flex-col">
            <div className="border-b px-5 py-3 font-semibold">
              {showId ? 'Deployments of this show' : 'Deployments'}
            </div>
            <div className="flex-1 divide-y">
              {deployments.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nothing deployed yet.</p>}
              {deployments.map((d) => (
                <DeploymentRow key={d.id} d={d} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        {(['doll', 'light', 'audio', 'sensor'] as const).map((kind) => {
          const group = devices.filter((d) => d.kind === kind)
          return (
            <Panel key={kind} className="overflow-hidden">
              <div className="flex items-center gap-2.5 border-b px-4 py-3">
                <KindTile kind={kind} />
                <span className="font-semibold">{KIND[kind].plural}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {group.filter((d) => d.online).length}/{group.length}
                </span>
              </div>
              <div className="divide-y">
                {group.map((d) => (
                  <DeviceRow key={d.id} d={d} />
                ))}
                {group.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">None installed.</p>}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
