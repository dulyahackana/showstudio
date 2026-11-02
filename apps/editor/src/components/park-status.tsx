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
 * Live state of the attraction, on every screen: devices online, what is playing,
 * and a software e-stop that any signed-in user can press.
 */
export function ParkStatus() {
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const env = envs.find((e) => e.latestRevision)
  const { data: status, dataUpdatedAt } = useQuery({ ...envStatusQuery(env?.id ?? ''), enabled: !!env })
  const now = useNow(500)
  const estop = useMutation({
    mutationFn: () => api('estop', { body: { environmentId: env?.id ?? '', reason: 'e-stop from studio sidebar' } }),
    onSuccess: () => toast.error('E-STOP sent to every device'),
    onError: (err) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail }),
  })
  if (!env) return null

  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const run = status?.run && ['scheduled', 'running'].includes(status.run.status) ? status.run : null
  const serverNow = now + (status ? status.serverTime - dataUpdatedAt : 0)
  const elapsed = run ? Math.max(0, Math.min(run.durationMs, serverNow - run.startAt)) : 0
  const latched = status?.estop.active ?? false
  const ready = status?.prepared.filter((p) => p.goodToGo).length ?? 0

  return (
    <div
      className={cn(
        'space-y-2.5 rounded-lg border bg-surface-2/70 p-3 group-data-[collapsible=icon]:hidden',
        latched && 'border-danger/50 bg-danger/10',
      )}
      data-testid="park-status"
    >
      <Link to="/operator" search={{ env: env.id }} className="flex items-center justify-between gap-2">
        <span className="text-eyebrow truncate">{env.name}</span>
        <StatusDot state={latched ? 'estopped' : run ? 'running' : online ? 'ready' : 'offline'} />
      </Link>
      <div className="flex gap-0.5">
        {devices.map((d) => (
          <span
            key={d.id}
            title={`${d.id}: ${d.online ? d.state : 'offline'}`}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              !d.online
                ? 'bg-muted-foreground/25'
                : d.state === 'estopped' || d.state === 'faulted'
                  ? 'bg-danger'
                  : d.state === 'running' || d.state === 'armed'
                    ? 'bg-motion'
                    : 'bg-sensor',
            )}
          />
        ))}
      </div>
      <div className="text-xs">
        {latched ? (
          <span className="font-semibold text-danger">E-stop latched</span>
        ) : run ? (
          <>
            <div className="truncate font-medium">{run.name}</div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(elapsed / run.durationMs) * 100}%` }} />
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground tabular">
              {formatMs(elapsed, false)} / {formatMs(run.durationMs, false)}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">
            {online}/{devices.length} devices · {ready} {ready === 1 ? 'show' : 'shows'} ready
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => estop.mutate()}
        disabled={estop.isPending || latched}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger/50 bg-danger/15 py-1.5 text-xs font-semibold tracking-wide text-danger uppercase transition hover:bg-danger hover:text-white disabled:opacity-40"
        data-testid="estop-global"
      >
        <OctagonX className="size-3.5" /> E-stop
      </button>
    </div>
  )
}
