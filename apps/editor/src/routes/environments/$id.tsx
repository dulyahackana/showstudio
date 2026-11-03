import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { ChevronRight, Gauge, Map as MapIcon, Server } from 'lucide-react'
import { StatusDot } from '@/components/kind'
import { activeRun } from '@/features/fleet/live-frame'
import { locationsQuery } from '@/lib/project'
import { docQuery, envStatusQuery } from '@/lib/queries'

export const Route = createFileRoute('/environments/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(docQuery(params.id)),
  component: EnvironmentLayout,
})

const TABS = [
  { to: '/environments/$id', label: 'Layout', icon: MapIcon, exact: true },
  { to: '/environments/$id/devices', label: 'Devices', icon: Server, exact: false },
  { to: '/environments/$id/operate', label: 'Control room', icon: Gauge, exact: false },
] as const

/** An environment (attraction) at its location: its layout, its controllers, its control room. */
function EnvironmentLayout() {
  const { id } = Route.useParams()
  const { data: doc } = useQuery(docQuery(id))
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: status } = useQuery({ ...envStatusQuery(id), enabled: !!doc?.latestRevision })
  const location = locations.find((l) => l.id === doc?.locationId)
  const online = status?.devices.filter((d) => d.online).length ?? 0
  const state = status?.estop.active ? 'estopped' : activeRun(status) ? 'running' : online ? 'ready' : 'offline'

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-surface/60 px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to="/locations" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
            Locations
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
          {location && (
            <>
              <Link
                to="/locations/$locationId"
                params={{ locationId: location.id }}
                className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
              >
                {location.name}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            </>
          )}
          <h1 className="truncate text-base font-semibold tracking-tight" data-testid="doc-title">
            {doc?.name ?? id}
          </h1>
          {status && <StatusDot state={state} className="ml-1" />}
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              params={{ id }}
              activeOptions={{ exact: t.exact }}
              className="flex h-8 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              activeProps={{ className: 'bg-surface-2 text-foreground ring-1 ring-border' }}
            >
              <t.icon className="size-4" /> {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
