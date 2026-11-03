import { diffShows } from '@studio/playback'
import type { RevisionSummary } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { GitCompare, ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table'
import { RevisionBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { api, problemMessage } from '@/lib/api'
import { shortSha, timeAgo } from '@/lib/format'
import { useDocPermission } from '@/lib/project'
import { docQuery, qk, revisionQuery, revisionsQuery } from '@/lib/queries'
import { canCall, useUser } from '@/lib/session'

function DiffView({ docId, revision }: { docId: string; revision: number }) {
  const cur = useQuery(revisionQuery(docId, revision))
  const prev = useQuery({ ...revisionQuery(docId, revision - 1), enabled: revision > 1 })
  if (revision === 1) return <p className="text-xs text-muted-foreground">First revision.</p>
  if (cur.data?.kind !== 'show' || prev.data?.kind !== 'show')
    return <p className="text-xs text-muted-foreground">Loading…</p>
  const entries = diffShows(prev.data.content, cur.data.content)
  if (!entries.length) return <p className="text-xs text-muted-foreground">No differences.</p>
  return (
    <ul className="space-y-0.5 text-xs">
      {entries.map((e, i) => (
        <li key={`${e.target}-${i}`} className="font-mono">
          <span className={e.change === 'added' ? 'text-ok' : e.change === 'removed' ? 'text-danger' : 'text-warn'}>
            {e.change === 'added' ? '+' : e.change === 'removed' ? '−' : '~'}
          </span>{' '}
          {e.area}: {e.target} {e.detail && <span className="text-muted-foreground">({e.detail})</span>}
        </li>
      ))}
    </ul>
  )
}

/** Revision history with safety review (four-eyes). */
export function RevisionsPanel({ docId, kind }: { docId: string; kind: 'character' | 'environment' | 'show' }) {
  const qc = useQueryClient()
  const user = useUser()
  const { data: revisions = [] } = useQuery(revisionsQuery(docId))
  const { data: doc } = useQuery(docQuery(docId))
  const projectReview = useDocPermission(doc?.projectId, 'review')
  const [diffOf, setDiffOf] = useState<number | null>(null)

  const review = useMutation({
    mutationFn: ({ revision, decision }: { revision: number; decision: 'approve' | 'reject' }) =>
      api(decision === 'approve' ? 'approveRevision' : 'rejectRevision', {
        params: { id: docId, revision },
        body: { note: '' },
      }),
    onSuccess: (rev) => {
      toast.success(
        rev.status === 'approved'
          ? `Revision ${rev.revision} approved and signed`
          : `Revision ${rev.revision} rejected`,
      )
      void qc.invalidateQueries({ queryKey: qk.revisions(docId) })
      void qc.invalidateQueries({ queryKey: ['docs'] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['project'] })
    },
    onError: (err) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail }),
  })

  const columns: ColumnDef<RevisionSummary>[] = [
    {
      header: 'Rev',
      accessorKey: 'revision',
      cell: ({ row }) => <span className="font-mono">r{row.original.revision}</span>,
    },
    ...(kind === 'show'
      ? [
          {
            header: 'Status',
            id: 'status',
            cell: ({ row }) => <RevisionBadge status={row.original.status} />,
          } satisfies ColumnDef<RevisionSummary>,
        ]
      : []),
    {
      header: 'Published',
      id: 'published',
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.publishedBy} · {timeAgo(row.original.publishedAt)}
          {row.original.note && <span className="block text-muted-foreground">{row.original.note}</span>}
        </span>
      ),
    },
    ...(kind === 'show'
      ? [
          {
            header: 'Reviewed',
            id: 'reviewed',
            cell: ({ row }) =>
              row.original.reviewedBy ? (
                <span className="text-xs">
                  {row.original.reviewedBy} · {timeAgo(row.original.reviewedAt)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          } satisfies ColumnDef<RevisionSummary>,
          {
            header: 'Bundle',
            id: 'bundle',
            cell: ({ row }) => (
              <span className="font-mono text-xs">
                {shortSha(row.original.bundleSha256)}{' '}
                {row.original.signed && <ShieldCheck className="inline size-3 text-ok" />}
              </span>
            ),
          } satisfies ColumnDef<RevisionSummary>,
        ]
      : [
          {
            header: 'Hash',
            id: 'sha',
            cell: ({ row }) => <span className="font-mono text-xs">{shortSha(row.original.sha256)}</span>,
          } satisfies ColumnDef<RevisionSummary>,
        ]),
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        if (kind !== 'show') return null
        // Four-eyes: authors never see review actions on their own revisions.
        const canReview = canCall(user, 'approveRevision') && projectReview && user?.name !== r.publishedBy
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Changes vs previous"
              onClick={() => setDiffOf(diffOf === r.revision ? null : r.revision)}
            >
              <GitCompare />
            </Button>
            {r.status === 'published' && canReview && (
              <Button
                size="xs"
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate({ revision: r.revision, decision: 'approve' })}
                data-testid={`approve-r${r.revision}`}
              >
                <ShieldCheck /> Approve
              </Button>
            )}
            {r.status === 'published' && canReview && (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Reject"
                onClick={() => review.mutate({ revision: r.revision, decision: 'reject' })}
              >
                <ShieldX />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-3 p-3">
      <DataTable data={revisions} columns={columns} empty="Not published yet." rowId={(r) => String(r.revision)} />
      {diffOf !== null && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-xs font-medium">Changes in r{diffOf}</p>
          <DiffView docId={docId} revision={diffOf} />
        </div>
      )}
    </div>
  )
}
