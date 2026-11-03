import type { AuditEntry } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { PageBody, PageHeader } from '@/components/page'
import { ToneBadge } from '@/components/status'
import { api } from '@/lib/api'
import { shortSha } from '@/lib/format'
import { qk } from '@/lib/queries'

export const Route = createFileRoute('/audit')({ component: AuditPage })

const columns: ColumnDef<AuditEntry>[] = [
  { header: '#', accessorKey: 'seq', cell: ({ row }) => <span className="font-mono text-xs">{row.original.seq}</span> },
  {
    header: 'When',
    accessorKey: 'at',
    cell: ({ row }) => <span className="text-xs">{new Date(row.original.at).toLocaleString()}</span>,
  },
  { header: 'Who', accessorKey: 'actor' },
  {
    header: 'Action',
    accessorKey: 'action',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
  },
  {
    header: 'Subject',
    id: 'subject',
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.entity}:{row.original.entityId}
      </span>
    ),
  },
  {
    header: 'Details',
    id: 'details',
    cell: ({ row }) => (
      <code
        className="block max-w-md truncate text-[11px] text-muted-foreground"
        title={JSON.stringify(row.original.details)}
      >
        {JSON.stringify(row.original.details)}
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
        description="Append-only and hash-chained: every publish, approval, deployment, launch and e-stop, with who did it."
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
