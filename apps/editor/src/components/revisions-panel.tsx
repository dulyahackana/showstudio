import { diffShows } from '@studio/playback'
import type { RevisionSummary, ShowDefinition } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { FileJson, GitCompare, Package, Rocket, RotateCcw, ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/data-table'
import { RevisionBadge, ToneBadge } from '@/components/status'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { activeRun } from '@/features/fleet/live-frame'
import { api, problemMessage } from '@/lib/api'
import { saveBlob } from '@/lib/download'
import { shortSha, timeAgo } from '@/lib/format'
import { useCanEditDoc, useDocPermission } from '@/lib/project'
import { docQuery, envStatusQuery, qk, revisionQuery, revisionsQuery } from '@/lib/queries'
import { canCall, useUser } from '@/lib/session'

const toastError = (err: unknown) => {
  const p = problemMessage(err)
  toast.error(p.title, { description: [p.detail, ...(p.reasons ?? [])].filter(Boolean).join(' · ') })
}

const AREA = {
  meta: 'Show',
  motion: 'Motion',
  lights: 'Lights',
  audio: 'Audio',
  behaviors: 'Sensor response',
} as const

/** What changed in a revision compared with the one before it. */
export function DiffView({ docId, revision }: { docId: string; revision: number }) {
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
          {AREA[e.area]}: {e.target} {e.detail && <span className="text-muted-foreground">({e.detail})</span>}
        </li>
      ))}
    </ul>
  )
}

/** Four-eyes safety review of a published revision; approval signs its bundle. */
export function useReview(docId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      revision,
      decision,
      note = '',
    }: {
      revision: number
      decision: 'approve' | 'reject'
      note?: string
    }) =>
      api(decision === 'approve' ? 'approveRevision' : 'rejectRevision', {
        params: { id: docId, revision },
        body: { note },
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
}

/** Download a revision: its definition (.json) or, for approved shows, the offline install package (.zip). */
export function useDownloadRevision(docId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ revision, as }: { revision: number; as: 'package' | 'definition' }) => {
      if (as === 'package')
        return saveBlob(await api('downloadPackage', { params: { id: docId, revision } }), `${docId}-r${revision}.zip`)
      const rev = await qc.fetchQuery(revisionQuery(docId, revision))
      const json = new Blob([`${JSON.stringify(rev.content, null, 2)}\n`], { type: 'application/json' })
      saveBlob(json, `${docId}-r${revision}.json`)
    },
    onError: toastError,
  })
}

/**
 * The revision catalog: every published revision with safety review (four-eyes),
 * downloads (the definition; for approved shows the offline install package), restore
 * as the draft, and, for approved shows, deploy to roll the attraction back to it.
 * In an editor, pass it so pending edits are saved first and the restored draft loads.
 */
export function RevisionsPanel({
  docId,
  kind,
  editor,
}: {
  docId: string
  kind: 'character' | 'environment' | 'show'
  editor?: { flush: () => Promise<void>; reload: () => Promise<void> }
}) {
  const qc = useQueryClient()
  const user = useUser()
  const { data: revisions = [] } = useQuery(revisionsQuery(docId))
  const { data: doc } = useQuery(docQuery(docId))
  const projectReview = useDocPermission(doc?.projectId, 'review')
  const projectOperate = useDocPermission(doc?.projectId, 'operate')
  const canRestore = useCanEditDoc(doc)
  const canPackage = canCall(user, 'downloadPackage') && projectOperate
  const canDeploy = canCall(user, 'createDeployment') && projectOperate
  const environmentId = kind === 'show' ? (doc?.draft as ShowDefinition | undefined)?.environment.id : undefined
  const { data: status } = useQuery({ ...envStatusQuery(environmentId ?? ''), enabled: !!environmentId })
  const live = activeRun(status)
  const [diffOf, setDiffOf] = useState<number | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)

  const restore = useMutation({
    mutationFn: async (revision: number) => {
      await editor?.flush()
      const fresh = await qc.fetchQuery({ ...docQuery(docId), staleTime: 0 })
      return api('restoreRevision', { params: { id: docId, revision }, body: { draftVersion: fresh.draftVersion } })
    },
    onSuccess: async (_doc, revision) => {
      toast.success(`r${revision} is the draft again`, {
        description:
          kind === 'show'
            ? 'Publish it to send it through safety review.'
            : 'Publish it to make it the latest revision.',
      })
      void qc.invalidateQueries({ queryKey: ['docs'] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['project'] })
      await (editor ? editor.reload() : qc.invalidateQueries({ queryKey: qk.doc(docId) }))
    },
    onError: toastError,
  })
  const deploy = useMutation({
    mutationFn: (revision: number) => api('createDeployment', { body: { showId: docId, revision } }),
    onSuccess: (d) => {
      toast.success(`Deploying ${d.name} r${d.revision}`, {
        description: `${d.targets.length} controllers download, verify and stage it. Launch it from the control room once it is good to go.`,
      })
      if (environmentId) {
        void qc.invalidateQueries({ queryKey: qk.deployments(environmentId) })
        void qc.invalidateQueries({ queryKey: qk.envStatus(environmentId) })
      }
    },
    onError: toastError,
  })
  const download = useDownloadRevision(docId)

  const review = useReview(docId)

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
          {
            header: 'On site',
            id: 'site',
            cell: ({ row }) => {
              const r = row.original
              if (live?.showId === docId && live.revision === r.revision) return <ToneBadge t="info">live</ToneBadge>
              const p = status?.prepared.find((x) => x.showId === docId && x.revision === r.revision)
              if (!p) return <span className="text-xs text-muted-foreground">—</span>
              return (
                <ToneBadge t={p.goodToGo ? 'ok' : 'warn'}>
                  {p.goodToGo ? 'staged' : 'staging'} {p.stagedOn}/{p.targets}
                </ToneBadge>
              )
            },
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
        const approved = r.status === 'approved' && r.signed
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
            <Button
              size="icon-xs"
              variant="ghost"
              title="Download the definition (.json)"
              onClick={() => download.mutate({ revision: r.revision, as: 'definition' })}
              data-testid={`download-json-r${r.revision}`}
            >
              <FileJson />
            </Button>
            {approved && canPackage && (
              <Button
                size="icon-xs"
                variant="ghost"
                title="Download the offline install package (.zip): signed bundle, signature, audio, manifest"
                onClick={() => download.mutate({ revision: r.revision, as: 'package' })}
                data-testid={`download-package-r${r.revision}`}
              >
                <Package />
              </Button>
            )}
            {canRestore && (
              <Button
                size="xs"
                variant="ghost"
                title="Make this revision the draft again"
                onClick={() => setRestoring(r.revision)}
                data-testid={`restore-r${r.revision}`}
              >
                <RotateCcw /> Restore
              </Button>
            )}
            {approved && canDeploy && (
              <Button
                size="xs"
                variant="outline"
                title="Stage this revision on every controller of the attraction"
                disabled={deploy.isPending}
                onClick={() => deploy.mutate(r.revision)}
                data-testid={`deploy-r${r.revision}`}
              >
                <Rocket /> Deploy
              </Button>
            )}
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

  const latest = revisions[0]?.revision ?? 0
  return (
    <div className="space-y-3 p-3">
      <DataTable data={revisions} columns={columns} empty="Not published yet." rowId={(r) => String(r.revision)} />
      <AlertDialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore r{restoring} as the draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The current draft is replaced by revision {restoring}, including any changes that were never published.
              Published revisions never change.{' '}
              {kind === 'show'
                ? `Publishing it creates r${latest + 1}, which needs safety review before it can be deployed.`
                : `Publishing it creates r${latest + 1}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoring !== null && restore.mutate(restoring)}
              data-testid="confirm-restore"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {diffOf !== null && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-xs font-medium">Changes in r{diffOf}</p>
          <DiffView docId={docId} revision={diffOf} />
        </div>
      )}
    </div>
  )
}
