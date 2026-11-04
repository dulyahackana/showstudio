import type { DocumentSummary } from '@studio/schema'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Mountain, OctagonX } from 'lucide-react'
import { toast } from 'sonner'
import { StatusDot } from '@/components/kind'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { useNow } from '@/hooks/use-now'
import { api, problemMessage } from '@/lib/api'
import { formatMs } from '@/lib/format'
import { docsQuery, envStatusQuery } from '@/lib/queries'
import { useCan } from '@/lib/session'
import { cn } from '@/lib/utils'

function useEstop(env: { id: string; name: string }) {
  return useMutation({
    mutationFn: () => api('estop', { body: { environmentId: env.id, reason: 'e-stop from studio sidebar' } }),
    onSuccess: () => toast.error(`E-STOP sent to every device in ${env.name}`),
    onError: (err) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail }),
  })
}

function useAttraction(envId: string) {
  const { data: status, dataUpdatedAt } = useQuery(envStatusQuery(envId))
  const now = useNow(500)
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const run = status?.run && ['scheduled', 'running'].includes(status.run.status) ? status.run : null
  const serverNow = now + (status ? status.serverTime - dataUpdatedAt : 0)
  const elapsed = run ? Math.max(0, Math.min(run.durationMs, serverNow - run.startAt)) : 0
  const latched = status?.estop.active ?? false
  const state = latched
    ? ('estopped' as const)
    : run
      ? ('running' as const)
      : online
        ? ('ready' as const)
        : ('offline' as const)
  return { devices, online, run, elapsed, latched, state }
}

/**
 * One attraction in the sidebar: live state, controllers online or the show clock, and a
 * software e-stop any signed-in user can press. Operators land in the control room,
 * everyone else on the layout.
 */
export function AttractionItem({ env, active }: { env: DocumentSummary; active: boolean }) {
  const operator = useCan('launch')
  const { devices, online, run, elapsed, latched, state } = useAttraction(env.id)
  const estop = useEstop(env)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={`${env.name} · ${latched ? 'E-STOP latched' : run ? `live ${formatMs(elapsed, false)}` : `${online}/${devices.length} online`}`}
        className={cn('pr-9', latched && 'bg-danger/10 hover:bg-danger/15')}
      >
        <Link to={operator ? '/environments/$id/operate' : '/environments/$id'} params={{ id: env.id }}>
          <span className="relative">
            <Mountain />
            <StatusDot
              state={state}
              className="absolute -right-1 -bottom-1 hidden group-data-[collapsible=icon]:block"
            />
          </span>
          <span className="min-w-0 flex-1 truncate">{env.name}</span>
          <StatusDot state={state} className="group-data-[collapsible=icon]:hidden" />
          <span
            className={cn(
              'shrink-0 font-mono text-[10px] tabular',
              latched ? 'font-semibold text-danger' : run ? 'text-motion' : 'text-muted-foreground',
            )}
          >
            {latched ? 'E-STOP' : run ? formatMs(elapsed, false) : `${online}/${devices.length}`}
          </span>
        </Link>
      </SidebarMenuButton>
      <button
        type="button"
        onClick={() => estop.mutate()}
        disabled={estop.isPending || latched}
        title={`Emergency stop ${env.name}: every figure, light and speaker stops now`}
        aria-label={`Emergency stop ${env.name}`}
        className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-danger hover:text-white disabled:opacity-30 group-data-[collapsible=icon]:hidden"
        data-testid={`estop-global-${env.id}`}
      >
        <OctagonX className="size-3.5" />
      </button>
    </SidebarMenuItem>
  )
}

/** The e-stops while the sidebar is an icon rail (in the editors): one button, pick the attraction. */
export function EstopRailButton() {
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const live = envs.filter((e) => e.latestRevision)
  if (!live.length) return null
  return (
    <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip="E-stop an attraction"
            aria-label="E-stop an attraction"
            className="text-danger hover:bg-danger/15 hover:text-danger"
          >
            <OctagonX />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuLabel>Emergency stop</DropdownMenuLabel>
          {live.map((env) => (
            <EstopMenuItem key={env.id} env={env} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function EstopMenuItem({ env }: { env: DocumentSummary }) {
  const estop = useEstop(env)
  const { latched } = useAttraction(env.id)
  return (
    <DropdownMenuItem variant="destructive" disabled={latched} onSelect={() => estop.mutate()}>
      <OctagonX /> {env.name}
      {latched && <span className="ml-auto text-[10px]">latched</span>}
    </DropdownMenuItem>
  )
}
