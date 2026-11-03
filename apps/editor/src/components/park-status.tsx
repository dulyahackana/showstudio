import type { DocumentSummary } from '@studio/schema'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { OctagonX } from 'lucide-react'
import { toast } from 'sonner'
import { StatusDot } from '@/components/kind'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { useNow } from '@/hooks/use-now'
import { api, problemMessage } from '@/lib/api'
import { formatMs } from '@/lib/format'
import { docsQuery, envStatusQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'

/**
 * Live state of every attraction, on every screen: devices online, what is playing,
 * and a software e-stop per attraction that any signed-in user can press.
 */
export function ParkStatus() {
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const live = envs.filter((e) => e.latestRevision)
  if (!live.length) return null
  return (
    <div className="space-y-2 group-data-[collapsible=icon]:hidden" data-testid="park-status">
      <div className="text-eyebrow px-1">Live attractions</div>
      {live.map((env) => (
        <AttractionStatus key={env.id} env={env} />
      ))}
    </div>
  )
}

function AttractionStatus({ env }: { env: DocumentSummary }) {
  const { data: status, dataUpdatedAt } = useQuery(envStatusQuery(env.id))
  const now = useNow(500)
  const estop = useMutation({
    mutationFn: () => api('estop', { body: { environmentId: env.id, reason: 'e-stop from studio sidebar' } }),
    onSuccess: () => toast.error(`E-STOP sent to every device in ${env.name}`),
    onError: (err) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail }),
  })
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const run = status?.run && ['scheduled', 'running'].includes(status.run.status) ? status.run : null
  const serverNow = now + (status ? status.serverTime - dataUpdatedAt : 0)
  const elapsed = run ? Math.max(0, Math.min(run.durationMs, serverNow - run.startAt)) : 0
  const latched = status?.estop.active ?? false
  const ready = status?.prepared.filter((p) => p.goodToGo).length ?? 0

  return (
    <div
      className={cn('space-y-2 rounded-lg border bg-surface-2/70 p-2.5', latched && 'border-danger/50 bg-danger/10')}
    >
      <div className="flex items-center gap-2">
        <StatusDot state={latched ? 'estopped' : run ? 'running' : online ? 'ready' : 'offline'} />
        <Link
          to="/environments/$id/operate"
          params={{ id: env.id }}
          className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
        >
          {env.name}
        </Link>
        <button
          type="button"
          onClick={() => estop.mutate()}
          disabled={estop.isPending || latched}
          title={`E-stop ${env.name}`}
          className="flex h-5 items-center gap-1 rounded border border-danger/50 bg-danger/15 px-1.5 text-[10px] font-semibold tracking-wide text-danger uppercase transition hover:bg-danger hover:text-white disabled:opacity-40"
          data-testid={`estop-global-${env.id}`}
        >
          <OctagonX className="size-3" /> Stop
        </button>
      </div>
      <div className="flex gap-0.5">
        {devices.map((d) => (
          <span
            key={d.id}
            title={`${d.id}: ${d.online ? d.state : 'offline'}`}
            className={cn(
              'h-1 flex-1 rounded-full',
              !d.online
                ? 'bg-muted-foreground/25'
                : d.state === 'estopped' || d.state === 'faulted'
                  ? 'bg-danger'
                  : d.state === 'running' || d.state === 'armed'
                    ? 'bg-motion'
                    : 'bg-ok',
            )}
          />
        ))}
      </div>
      <div className="text-[11px]">
        {latched ? (
          <span className="font-semibold text-danger">E-stop latched</span>
        ) : run ? (
          <>
            <div className="flex justify-between gap-2">
              <span className="truncate">{run.name}</span>
              <span className="shrink-0 font-mono text-muted-foreground tabular">{formatMs(elapsed, false)}</span>
            </div>
            <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(elapsed / run.durationMs) * 100}%` }} />
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">
            {online}/{devices.length} online · {ready} ready
          </span>
        )}
      </div>
    </div>
  )
}
