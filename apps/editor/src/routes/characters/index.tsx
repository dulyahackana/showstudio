import type { Joint, Vec3 } from '@studio/schema'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { toast } from 'sonner'
import { CharacterCard, DocGrid } from '@/components/doc-cards'
import { NewDocumentDialog } from '@/components/new-document-dialog'
import { PageBody, PageHeader } from '@/components/page'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { inspectGlb, parseDefinitionFile } from '@/features/characters/import'
import { api } from '@/lib/api'
import { docsQuery } from '@/lib/queries'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/characters/')({
  component: CharactersPage,
})

interface Files {
  model: File | null
  definition: File | null
}

function CharactersPage() {
  const { data = [] } = useQuery(docsQuery('character'))
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canCreate = useCan('createDocument')

  const create = async ({ id, name, extra }: { id: string; name: string; extra: Files }) => {
    let model: { assetId: string } | null = null
    let size: Vec3 = [1, 2, 1]
    let joints: Joint[] = []
    if (extra.model) {
      const form = new FormData()
      form.append('file', extra.model)
      const asset = await api('uploadAsset', { body: form })
      model = { assetId: asset.id }
      size = (await inspectGlb(await extra.model.arrayBuffer())).size
    }
    if (extra.definition) joints = parseDefinitionFile(await extra.definition.text(), extra.definition.name).joints
    await api('createDocument', {
      body: {
        kind: 'character',
        id,
        draft: { schemaVersion: 1, name, description: '', model, footprint: { size }, joints },
      },
    })
    toast.success(`Created ${name}`, { description: `${joints.length} joints imported` })
    void qc.invalidateQueries({ queryKey: ['docs'] })
    await navigate({ to: '/characters/$id', params: { id } })
  }

  return (
    <>
      <PageHeader
        eyebrow={`Library · ${data.length} figures`}
        title="Characters"
        description="Each mechatronic figure: its 3D model, joints, ranges of motion and maximum speeds. Shared by every environment and project."
        actions={
          canCreate && (
            <NewDocumentDialog<Files>
              title="New character"
              description="Upload the figure's GLB model and, optionally, a URDF or JSON joint definition."
              label="New character"
              initialExtra={{ model: null, definition: null }}
              onCreate={create}
              extra={(v, set) => (
                <>
                  <Field>
                    <FieldLabel htmlFor="model-file">3D model (.glb)</FieldLabel>
                    <Input
                      id="model-file"
                      type="file"
                      accept=".glb,model/gltf-binary"
                      onChange={(e) => set({ ...v, model: e.target.files?.[0] ?? null })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="def-file">Definition (.urdf or .json)</FieldLabel>
                    <Input
                      id="def-file"
                      type="file"
                      accept=".urdf,.xml,.json"
                      onChange={(e) => set({ ...v, definition: e.target.files?.[0] ?? null })}
                    />
                    <FieldDescription>
                      Joint names, axes, limits and velocities. You can refine them next.
                    </FieldDescription>
                  </Field>
                </>
              )}
            />
          )
        }
      />
      <PageBody>
        <DocGrid
          count={data.length}
          empty={{
            icon: Bot,
            title: 'No figures yet',
            description: 'Upload a GLB model and its URDF or JSON definition.',
          }}
        >
          {data.map((d) => (
            <CharacterCard key={d.id} doc={d} />
          ))}
        </DocGrid>
      </PageBody>
    </>
  )
}
