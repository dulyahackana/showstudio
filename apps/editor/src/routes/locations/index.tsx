import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { MapPin, Mountain } from 'lucide-react'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { locationsQuery } from '@/lib/project'
import { docsQuery } from '@/lib/queries'

export const Route = createFileRoute('/locations/')({ component: LocationsPage })

function LocationsPage() {
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Locations" description="Parks and the attractions in them." />
      <PageBody>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((loc) => {
            const here = envs.filter((e) => e.locationId === loc.id)
            return (
              <Link key={loc.id} to="/locations/$locationId" params={{ locationId: loc.id }}>
                <Panel className="space-y-3 p-5 transition hover:-translate-y-0.5 hover:border-primary/40">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg border bg-surface-2">
                      <MapPin className="size-4 text-primary" />
                    </span>
                    <div>
                      <div className="font-semibold">{loc.name}</div>
                      <div className="text-xs text-muted-foreground">{loc.region}</div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{loc.description}</p>
                  <div className="space-y-1">
                    {here.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-sm">
                        <Mountain className="size-3.5 text-muted-foreground" /> {e.name}
                      </div>
                    ))}
                  </div>
                </Panel>
              </Link>
            )
          })}
        </div>
      </PageBody>
    </>
  )
}
