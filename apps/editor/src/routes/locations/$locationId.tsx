import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Mountain } from 'lucide-react'
import { toast } from 'sonner'
import { DocGrid } from '@/components/doc-cards'
import { LiveAttraction } from '@/components/live-attraction'
import { NewDocumentDialog } from '@/components/new-document-dialog'
import { PageBody, PageHeader, Section } from '@/components/page'
import { api } from '@/lib/api'
import { locationsQuery } from '@/lib/project'
import { docsQuery } from '@/lib/queries'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/locations/$locationId')({ component: LocationPage })

/** A site and its environments, live. New environments are created here. */
function LocationPage() {
  const { locationId } = Route.useParams()
  const { data: locations = [] } = useQuery(locationsQuery)
  const { data: envs = [] } = useQuery(docsQuery('environment', locationId))
  const location = locations.find((l) => l.id === locationId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canCreate = useCan('createDocument')

  const create = async ({ id, name }: { id: string; name: string }) => {
    await api('createDocument', {
      body: {
        kind: 'environment',
        id,
        locationId,
        draft: {
          schemaVersion: 1,
          name,
          description: '',
          stage: { min: [-5, 0, -4], max: [5, 4, 4] },
          keepOut: [],
          ambient: { color: '#1e293b', intensity: 0.4 },
          palette: [
            { name: 'Warm white', color: '#ffd8a8' },
            { name: 'Ember', color: '#ff6b00' },
            { name: 'Night', color: '#1c3faa' },
          ],
          placements: [],
          lights: [],
          audio: [],
          sensors: [],
          consoles: [],
          scenery: [],
        },
      },
    })
    toast.success(`Created ${name}`)
    void qc.invalidateQueries({ queryKey: ['docs'] })
    await navigate({ to: '/environments/$id', params: { id } })
  }

  return (
    <>
      <PageHeader
        eyebrow={`Location · ${location?.region ?? ''}`}
        title={location?.name ?? locationId}
        description={location?.description}
        actions={
          canCreate && (
            <NewDocumentDialog
              title="New environment"
              description={`An attraction at ${location?.name ?? 'this location'}: its boundaries and every device installed in it.`}
              label="New environment"
              initialExtra={null}
              onCreate={create}
            />
          )
        }
      />
      <PageBody>
        <Section title="Attractions">
          <DocGrid
            count={envs.length}
            empty={{
              icon: Mountain,
              title: 'No environments yet',
              description: 'Describe an attraction and every device installed in it.',
            }}
          >
            <div className="col-span-full grid gap-6 xl:grid-cols-2">
              {envs.map((e) => (
                <LiveAttraction key={e.id} envId={e.id} />
              ))}
            </div>
          </DocGrid>
        </Section>
      </PageBody>
    </>
  )
}
