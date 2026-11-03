import type { CharacterDefinition, DocumentSummary, EnvironmentDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { FloorPlan } from '@/components/floor-plan'
import { KIND, KindIcon } from '@/components/kind'
import { ModelThumb } from '@/components/model-thumb'
import { ToneBadge } from '@/components/status'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { timeAgo } from '@/lib/format'
import { docQuery, useCharacters } from '@/lib/queries'
import { cn } from '@/lib/utils'

export function DocStatus({ doc, reviewed = false }: { doc: DocumentSummary; reviewed?: boolean }) {
  if (reviewed && doc.latestApprovedRevision)
    return <ToneBadge t="ok">approved r{doc.latestApprovedRevision}</ToneBadge>
  if (reviewed && doc.latestRevision) return <ToneBadge t="warn">r{doc.latestRevision} in review</ToneBadge>
  if (doc.latestRevision) return <ToneBadge t="info">published r{doc.latestRevision}</ToneBadge>
  return <ToneBadge t="muted">draft</ToneBadge>
}

function Card({
  to,
  id,
  preview,
  title,
  status,
  meta,
  doc,
}: {
  to: '/characters/$id' | '/environments/$id'
  id: string
  preview: ReactNode
  title: string
  status: ReactNode
  meta: ReactNode
  doc: DocumentSummary
}) {
  return (
    <Link
      to={to}
      params={{ id }}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_40px_-16px_oklch(0.79_0.17_155/35%)]"
      data-testid={`card-${id}`}
    >
      <div className="bg-blueprint relative aspect-[16/10] overflow-hidden border-b bg-sidebar">{preview}</div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold group-hover:text-primary">{title}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">{id}</div>
          </div>
          {status}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta}</div>
        <div className="mt-auto pt-1 text-[11px] text-muted-foreground">
          Edited by <span className="text-foreground/80 capitalize">{doc.updatedBy}</span> · {timeAgo(doc.updatedAt)}
        </div>
      </div>
    </Link>
  )
}

export function CharacterCard({ doc }: { doc: DocumentSummary }) {
  const { data } = useQuery(docQuery(doc.id))
  const c = data?.draft as CharacterDefinition | undefined
  return (
    <Card
      to="/characters/$id"
      id={doc.id}
      doc={doc}
      title={doc.name}
      status={<DocStatus doc={doc} />}
      preview={
        <>
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-motion/10 to-transparent" />
          <ModelThumb assetId={c?.model?.assetId} joints={c?.joints} className="absolute inset-0 h-full w-full p-3" />
        </>
      }
      meta={
        c && (
          <>
            <span className="inline-flex items-center gap-1">
              <KindIcon kind="doll" className="size-3.5" /> {c.joints.length} joints
            </span>
            <span className="font-mono">{c.footprint.size.map((n) => n.toFixed(1)).join(' × ')} m</span>
          </>
        )
      }
    />
  )
}

export function EnvironmentCard({ doc }: { doc: DocumentSummary }) {
  const { data } = useQuery(docQuery(doc.id))
  const env = data?.draft as EnvironmentDefinition | undefined
  const { characters } = useCharacters(env?.placements.map((p) => p.character) ?? [])
  const counts = env
    ? ([
        ['doll', env.placements.length],
        ['light', env.lights.length],
        ['audio', env.audio.length],
        ['sensor', env.sensors.length],
      ] as const)
    : []
  return (
    <Card
      to="/environments/$id"
      id={doc.id}
      doc={doc}
      title={doc.name}
      status={<DocStatus doc={doc} />}
      preview={env && <FloorPlan env={env} characters={characters} className="absolute inset-0 p-3" />}
      meta={counts.map(([kind, n]) => (
        <span key={kind} className="inline-flex items-center gap-1" title={KIND[kind].plural}>
          <KindIcon kind={kind} className="size-3.5" /> {n}
        </span>
      ))}
    />
  )
}

export function DocGrid({
  children,
  empty,
  count,
}: {
  children: ReactNode
  empty: { icon: typeof Clock; title: string; description: string; action?: ReactNode }
  count: number
}) {
  if (count === 0)
    return (
      <Empty className="bg-blueprint rounded-xl border border-dashed py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <empty.icon />
          </EmptyMedia>
          <EmptyTitle>{empty.title}</EmptyTitle>
          <EmptyDescription>{empty.description}</EmptyDescription>
        </EmptyHeader>
        {empty.action}
      </Empty>
    )
  return <div className={cn('grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')}>{children}</div>
}
