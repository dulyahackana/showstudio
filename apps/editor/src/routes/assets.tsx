import type { Asset } from '@studio/schema'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Pause, Play, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table'
import { PageBody, PageHeader } from '@/components/page'
import { ToneBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { api, assetUrl, problemMessage } from '@/lib/api'
import { formatBytes, shortSha, timeAgo } from '@/lib/format'
import { assetsQuery, qk } from '@/lib/queries'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/assets')({
  loader: ({ context }) => context.queryClient.ensureQueryData(assetsQuery),
  component: AssetsPage,
})

function AssetsPage() {
  const { data } = useSuspenseQuery(assetsQuery)
  const qc = useQueryClient()
  const canUpload = useCan('uploadAsset')
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await api('uploadAsset', { body: form })
      }
      return files.length
    },
    onSuccess: (n) => {
      toast.success(`Uploaded ${n} file(s)`)
      void qc.invalidateQueries({ queryKey: qk.assets })
    },
    onError: (err) => toast.error('Upload failed', { description: problemMessage(err).detail }),
  })

  const toggle = (a: Asset) => {
    audio.current?.pause()
    if (playing === a.id) return setPlaying(null)
    audio.current = new Audio(assetUrl(a.id))
    audio.current.onended = () => setPlaying(null)
    void audio.current.play()
    setPlaying(a.id)
  }

  const columns: ColumnDef<Asset>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.kind === 'audio' && (
            <Button size="icon-xs" variant="ghost" onClick={() => toggle(row.original)} aria-label="Preview">
              {playing === row.original.id ? <Pause /> : <Play />}
            </Button>
          )}
          {row.original.name}
        </span>
      ),
    },
    {
      header: 'Kind',
      accessorKey: 'kind',
      cell: ({ row }) => <ToneBadge t={row.original.kind === 'model' ? 'info' : 'warn'}>{row.original.kind}</ToneBadge>,
    },
    { header: 'Size', accessorKey: 'size', cell: ({ row }) => formatBytes(row.original.size) },
    {
      header: 'Content hash',
      id: 'id',
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.original.id}>
          {shortSha(row.original.id)}
        </span>
      ),
    },
    {
      header: 'Uploaded',
      accessorKey: 'createdAt',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdBy} · {timeAgo(row.original.createdAt)}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Assets"
        description="3D models and audio. Identified by their bytes, so devices can verify every download."
        actions={
          canUpload && (
            <Button size="sm" disabled={upload.isPending} asChild>
              <label>
                <Upload /> Upload GLB / audio
                <input
                  type="file"
                  multiple
                  accept=".glb,.wav,.ogg,.mp3"
                  className="hidden"
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])]
                    if (files.length) upload.mutate(files)
                    e.target.value = ''
                  }}
                />
              </label>
            </Button>
          )
        }
      />
      <PageBody>
        <DataTable data={data} columns={columns} rowId={(a) => a.id} empty="No assets yet." />
      </PageBody>
    </>
  )
}
