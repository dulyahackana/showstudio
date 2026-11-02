import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Mountain } from 'lucide-react'
import { DocGrid, EnvironmentCard } from '@/components/doc-cards'
import { NewDocumentDialog } from '@/components/new-document-dialog'
import { PageBody, PageHeader } from '@/components/page'
import { api } from '@/lib/api'
import { docsQuery } from '@/lib/queries'
import { useCurrentProject, useProjectCan } from '@/lib/project'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/environments/')({
  component: EnvironmentsPage,
})

function EnvironmentsPage() {
  const project = useCurrentProject()
  const canEdit = useProjectCan('edit')
  const { data = [] } = useQuery({ ...docsQuery('environment', project?.id), enabled: !!project })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canCreate = useCan('createDocument')

  const create = async ({ id, name }: { id: string; name: string }) => {
    await api('createDocument', {
      body: {
        kind: 'environment',
        id,
        projectId: project?.id ?? '',
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
        eyebrow={`${project?.name ?? 'Project'} · ${data.length} attractions`}
        title="Environments"
        description="One per attraction: the stage boundary, keep-out zones and every installed figure, fixture, speaker and sensor."
        actions={
          <NewDocumentDialog
            title="New environment"
            description="Describe an attraction: its boundaries and every device installed in it."
            label="New environment"
            disabled={!canCreate || !canEdit || !project}
            initialExtra={null}
            onCreate={create}
          />
        }
      />
      <PageBody>
        <DocGrid
          count={data.length}
          empty={{ icon: Mountain, title: 'No attractions yet', description: 'Describe an attraction and every device installed in it.' }}
        >
          {data.map((d) => (
            <EnvironmentCard key={d.id} doc={d} />
          ))}
        </DocGrid>
      </PageBody>
    </>
  )
}
