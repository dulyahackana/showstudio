import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Clapperboard } from 'lucide-react'
import { DocGrid, ShowCard } from '@/components/doc-cards'
import { NumberInput } from '@/components/fields'
import { NewDocumentDialog } from '@/components/new-document-dialog'
import { PageBody, PageHeader } from '@/components/page'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { docsQuery } from '@/lib/queries'
import { useCurrentProject, useProjectCan } from '@/lib/project'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/shows/')({
  component: ShowsPage,
})

interface Extra {
  environmentId: string
  seconds: number
}

function ShowsPage() {
  const project = useCurrentProject()
  const canEdit = useProjectCan('edit')
  const { data = [] } = useQuery({ ...docsQuery('show', project?.id), enabled: !!project })
  const { data: envs = [] } = useQuery({ ...docsQuery('environment', project?.id), enabled: !!project })
  const published = envs.filter((e) => e.latestRevision)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canCreate = useCan('createDocument')

  const create = async ({ id, name, extra }: { id: string; name: string; extra: Extra }) => {
    const env = published.find((e) => e.id === extra.environmentId) ?? published[0]
    if (!env?.latestRevision) throw new Error('Publish an environment first')
    await api('createDocument', {
      body: {
        kind: 'show',
        id,
        projectId: project?.id ?? '',
        draft: {
          schemaVersion: 1,
          name,
          description: '',
          environment: { id: env.id, revision: env.latestRevision },
          durationMs: Math.round(extra.seconds * 1000),
          tracks: { motion: {}, lights: {}, audio: {} },
          behaviors: [],
        },
      },
    })
    toast.success(`Created ${name}`)
    void qc.invalidateQueries({ queryKey: ['docs'] })
    await navigate({ to: '/shows/$id', params: { id } })
  }

  return (
    <>
      <PageHeader
        eyebrow={`${project?.name ?? 'Project'} · ${data.length} shows`}
        title="Shows"
        description="Motion, light and sound on one timeline, plus bounded responses to guests. Approved revisions are signed and deployable."
        actions={
          <NewDocumentDialog<Extra>
            title="New show"
            description="A show is a timeline for one attraction (environment revision)."
            label="New show"
            disabled={!canCreate || !canEdit || !project || published.length === 0}
            initialExtra={{ environmentId: '', seconds: 60 }}
            onCreate={create}
            extra={(v, set) => (
              <>
                <Field>
                  <FieldLabel>Environment</FieldLabel>
                  <Select
                    value={v.environmentId || published[0]?.id}
                    onValueChange={(environmentId) => set({ ...v, environmentId })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick an attraction" />
                    </SelectTrigger>
                    <SelectContent>
                      {published.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} (r{e.latestRevision})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Pinned to the latest published revision.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Duration (seconds)</FieldLabel>
                  <NumberInput
                    step={1}
                    min={1}
                    value={v.seconds}
                    onChange={(seconds) => set({ ...v, seconds: Math.max(1, seconds) })}
                  />
                </Field>
              </>
            )}
          />
        }
      />
      <PageBody>
        {published.length === 0 && <p className="text-sm text-warn">Publish an environment before creating shows.</p>}
        <DocGrid
          count={data.length}
          empty={{ icon: Clapperboard, title: 'No shows yet', description: 'Create a show for a published attraction.' }}
        >
          {data.map((d) => (
            <ShowCard key={d.id} doc={d} />
          ))}
        </DocGrid>
      </PageBody>
    </>
  )
}
