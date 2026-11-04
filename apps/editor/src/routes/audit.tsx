import type { AuditEntry } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { PageBody, PageHeader } from '@/components/page'
import { ToneBadge } from '@/components/status'
import { api } from '@/lib/api'
import { describeAudit } from '@/lib/audit-text'
import { shortSha, timeAgo } from '@/lib/format'
import { qk } from '@/lib/queries'

export const Route = createFileRoute('/audit')({ component: AuditPage })

const columns: ColumnDef<AuditEntry>[] = [
  { header: '#', accessorKey: 'seq', cell: ({ row }) => <span className="font-mono text-xs">{row.original.seq}</span> },
  {
    header: 'When',
    accessorKey: 'at',
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap" title={new Date(row.original.at).toLocaleString()}>
        {timeAgo(row.original.at)}
      </span>
    ),
  },
  {
    header: 'What happened',
    id: 'what',
    cell: ({ row }) => (
      <span className="text-sm">
        <span className="font-medium capitalize">{row.original.actor}</span>{' '}
        <span className="text-muted-foreground">{describeAudit(row.original, { subject: true })}</span>
      </span>
    ),
  },
  {
    header: 'Event',
    id: 'event',
    cell: ({ row }) => (
      <code
        className="block max-w-xs truncate text-[11px] text-muted-foreground"
        title={`${row.original.entity}:${row.original.entityId}\n${JSON.stringify(row.original.details, null, 2)}`}
      >
        {row.original.action}
      </code>
    ),
  },
  {
    header: 'Hash',
    id: 'hash',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-muted-foreground">{shortSha(row.original.hash)}</span>
    ),
  },
]

function AuditPage() {
  const { data = [] } = useQuery({
    queryKey: qk.audit,
    queryFn: () => api('listAudit', { query: { limit: 500 } }),
    refetchInterval: 5000,
  })
  const { data: verify } = useQuery({
    queryKey: [...qk.audit, 'verify'],
    queryFn: () => api('verifyAudit'),
    refetchInterval: 5000,
  })
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Every publish, approval, deploy, launch and e-stop. Append-only, hash-chained."
        actions={
          verify &&
          (verify.ok ? (
            <ToneBadge t="ok">
              <ShieldCheck className="size-3" /> Chain intact · {verify.count} entries
            </ToneBadge>
          ) : (
            <ToneBadge t="bad">
              <ShieldAlert className="size-3" /> Tampering detected at #{verify.brokenAtSeq}
            </ToneBadge>
          ))
        }
      />
      <PageBody>
        <DataTable data={data} columns={columns} rowId={(e) => String(e.seq)} />
      </PageBody>
    </>
  )
}
