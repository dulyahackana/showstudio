import type { AuditEntry, DocumentSummary, EnvironmentStatus, ShowDefinition } from '@studio/schema'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  CircleCheck,
  Clapperboard,
  Gauge,
  Mountain,
  OctagonX,
  Play,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Upload,
  WifiOff,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { FloorPlan } from '@/components/floor-plan'
import { Stat, StatusDot } from '@/components/kind'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { ShowStrip } from '@/components/show-strip'
import { ToneBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { activeRun, useLiveFrame } from '@/features/fleet/live-frame'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { formatMs, timeAgo } from '@/lib/format'
import { docQuery, docsQuery, envStatusQuery, qk, useCharacters, useRevision } from '@/lib/queries'
import { useCurrentProject } from '@/lib/project'
import { useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: Overview })

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Overview() {
  const user = useUser()
  const project = useCurrentProject()
  const { data: docs = [] } = useQuery({ ...docsQuery(undefined, project?.id), enabled: !!project })
  const of = (kind: string) => docs.filter((d) => d.kind === kind)
  const characters = of('character')
  const environments = of('environment')
  const shows = of('show')
  const env = environments.find((e) => e.latestRevision)
  const { data: status, dataUpdatedAt } = useQuery({ ...envStatusQuery(env?.id ?? ''), enabled: !!env })
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const approved = shows.filter((s) => s.latestApprovedRevision)
  const ready = status?.prepared.filter((p) => p.goodToGo) ?? []

  return (
    <>
      <PageHeader
        eyebrow={project ? `Project · ${project.name}` : 'Studio'}
        title="Overview"
        description={`${greeting()}, ${user?.name ? user.name[0]?.toUpperCase() + user.name.slice(1) : 'there'}. Here is where every show stands, from model to launch.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/shows">
                <Clapperboard /> Shows
              </Link>
            </Button>
            <Button asChild>
              <Link to="/operator" search={env ? { env: env.id } : {}}>
                <Gauge /> Operator console
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        <Pipeline
          steps={[
            { icon: Bot, label: 'Figures', value: characters.length, hint: `${characters.filter((c) => c.latestRevision).length} published`, to: '/characters' },
            { icon: Mountain, label: 'Attractions', value: environments.length, hint: `${environments.filter((e) => e.latestRevision).length} published`, to: '/environments' },
            { icon: Clapperboard, label: 'Shows', value: shows.length, hint: `${shows.reduce((n, s) => n + (s.latestRevision ?? 0), 0)} revisions`, to: '/shows' },
            { icon: ShieldCheck, label: 'Approved', value: approved.length, hint: 'signed bundles', to: '/shows' },
            { icon: Rocket, label: 'Good to go', value: ready.length, hint: env?.name ?? '—', to: '/fleet' },
            { icon: Gauge, label: 'Online', value: `${online}/${devices.length}`, hint: 'controllers', to: '/operator' },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {env ? <LiveAttraction envId={env.id} status={status} updatedAt={dataUpdatedAt} /> : <Panel className="p-6 text-sm text-muted-foreground">Publish an environment to see it live.</Panel>}
          <Attention shows={shows} docs={docs} offline={devices.filter((d) => !d.online).map((d) => d.id)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <RecentShows shows={shows} />
          <Activity />
        </div>
      </PageBody>
    </>
  )
}

function Pipeline({
  steps,
}: {
  steps: { icon: typeof Bot; label: string; value: ReactNode; hint: string; to: '/characters' | '/environments' | '/shows' | '/fleet' | '/operator' }[]
}) {
  return (
    <Panel className="grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6">
      {steps.map((s, i) => (
        <Link
          key={s.label}
          to={s.to}
          className="group relative flex items-center gap-3 border-r border-b px-5 py-4 transition hover:bg-surface-2 xl:border-b-0"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface-2 text-muted-foreground transition group-hover:border-primary/40 group-hover:text-primary">
            <s.icon className="size-4" />
          </span>
          <Stat label={`${i + 1} · ${s.label}`} value={s.value} hint={s.hint} />
          {i < steps.length - 1 && (
            <ArrowRight className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-card text-muted-foreground/60 xl:block" />
          )}
        </Link>
      ))}
    </Panel>
  )
}

function LiveAttraction({
  envId,
  status,
  updatedAt,
}: {
  envId: string
  status: EnvironmentStatus | undefined
  updatedAt: number
}) {
  const now = useNow(250)
  const serverNow = now + (status ? status.serverTime - updatedAt : 0)
  const env = useRevision<'environment'>(status?.environmentRevision ? { id: envId, revision: status.environmentRevision } : null)
  const { characters } = useCharacters(env.data?.content.placements.map((p) => p.character) ?? [])
  const frame = useLiveFrame(status, serverNow)
  const run = activeRun(status)
  const latched = status?.estop.active ?? false
  const devices = mergeDevices(status)
  const states = Object.fromEntries(devices.map((d) => [d.id, d.online ? d.state : ('offline' as const)]))
  const elapsed = run ? Math.max(0, Math.min(run.durationMs, serverNow - run.startAt)) : 0

  return (
    <Panel className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2.5">
          <StatusDot state={latched ? 'estopped' : run ? 'running' : 'ready'} />
          <span className="font-semibold">{env.data?.content.name ?? envId}</span>
          <span className="font-mono text-xs text-muted-foreground">r{status?.environmentRevision}</span>
        </div>
        {latched ? (
          <ToneBadge t="bad">
            <OctagonX className="size-3" /> e-stop latched
          </ToneBadge>
        ) : run ? (
          <ToneBadge t="info">live</ToneBadge>
        ) : (
          <ToneBadge t="muted">idle</ToneBadge>
        )}
      </div>
      <div className="grid flex-1 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="bg-blueprint relative min-h-72 bg-sidebar/60 p-4">
          {env.data && (
            <FloorPlan
              env={env.data.content}
              characters={characters}
              lights={frame?.lights}
              states={states}
              labels="figures"
              className="absolute inset-0 p-4"
            />
          )}
        </div>
        <div className="flex flex-col gap-5 border-l p-5">
          <div>
            <div className="text-eyebrow">Now playing</div>
            {run ? (
              <>
                <div className="mt-1 text-lg font-semibold">{run.name}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${(elapsed / run.durationMs) * 100}%` }} />
                </div>
                <div className="mt-1.5 font-mono text-xs text-muted-foreground tabular">
                  {formatMs(elapsed, false)} / {formatMs(run.durationMs, false)} · {run.launchedBy}
                </div>
              </>
            ) : (
              <div className="mt-1 text-lg font-semibold text-muted-foreground">Nothing running</div>
            )}
          </div>
          <Stat
            label="Controllers"
            value={`${devices.filter((d) => d.online).length}/${devices.length}`}
            hint={devices.some((d) => !d.online) ? `${devices.filter((d) => !d.online).length} offline` : 'all online'}
          />
          <div>
            <div className="text-eyebrow">Ready to launch</div>
            <div className="mt-2 space-y-1.5">
              {(status?.prepared ?? []).map((p) => (
                <div key={p.sha256} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.name}</span>
                  {p.goodToGo ? <ToneBadge t="ok">good to go</ToneBadge> : <ToneBadge t="warn">{p.stagedOn}/{p.targets}</ToneBadge>}
                </div>
              ))}
              {status?.prepared.length === 0 && <p className="text-sm text-muted-foreground">Nothing deployed yet.</p>}
            </div>
          </div>
          <Button className="mt-auto" variant={run ? 'outline' : 'default'} asChild>
            <Link to="/operator" search={{ env: envId }}>
              <Play /> {run ? 'Open console' : 'Launch a show'}
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function Attention({ shows, docs, offline }: { shows: DocumentSummary[]; docs: DocumentSummary[]; offline: string[] }) {
  const awaiting = shows.filter((s) => s.latestRevision && s.latestRevision !== s.latestApprovedRevision)
  const unpublished = docs.filter((d) => !d.latestRevision)
  const items: { icon: typeof Bot; tone: string; title: ReactNode; sub: string; to: string; params?: { id: string } }[] = [
    ...awaiting.map((s) => ({
      icon: ShieldAlert,
      tone: 'text-warn',
      title: `${s.name} r${s.latestRevision}`,
      sub: 'Waiting for safety review',
      to: '/shows/$id',
      params: { id: s.id },
    })),
    ...unpublished.map((d) => ({
      icon: Upload,
      tone: 'text-motion',
      title: d.name,
      sub: `Draft ${d.kind}, never published`,
      to: `/${d.kind === 'character' ? 'characters' : d.kind === 'environment' ? 'environments' : 'shows'}/$id`,
      params: { id: d.id },
    })),
    ...(offline.length
      ? [{ icon: WifiOff, tone: 'text-danger', title: `${offline.length} controllers offline`, sub: offline.slice(0, 4).join(', '), to: '/fleet' }]
      : []),
  ]
  return (
    <Panel className="flex flex-col">
      <div className="border-b px-5 py-3 font-semibold">Needs attention</div>
      <div className="flex-1 divide-y">
        {items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <CircleCheck className="size-8 text-sensor" />
            <div className="font-medium">All clear</div>
            <p className="text-sm text-muted-foreground">Everything is published, reviewed and online.</p>
          </div>
        )}
        {items.map((it) => (
          // biome-ignore lint/suspicious/noExplicitAny: routes are typed per item above
          <Link key={`${it.to}-${String(it.title)}`} to={it.to as any} params={it.params as any} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
            <it.icon className={cn('size-4 shrink-0', it.tone)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{it.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{it.sub}</span>
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function RecentShows({ shows }: { shows: DocumentSummary[] }) {
  const recent = [...shows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
  const drafts = useQueries({ queries: recent.map((s) => docQuery(s.id)) })
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <span className="font-semibold">Shows</span>
        <Link to="/shows" className="text-xs text-muted-foreground hover:text-foreground">
          All shows →
        </Link>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        {recent.map((s, i) => {
          const draft = drafts[i]?.data?.draft as ShowDefinition | undefined
          return (
            <Link key={s.id} to="/shows/$id" params={{ id: s.id }} className="group space-y-3 bg-card p-5 transition hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium group-hover:text-primary">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {draft ? `${formatMs(draft.durationMs, false)} · ${draft.behaviors.length} sensor responses` : '…'}
                  </div>
                </div>
                {s.latestApprovedRevision ? (
                  <ToneBadge t="ok">approved r{s.latestApprovedRevision}</ToneBadge>
                ) : s.latestRevision ? (
                  <ToneBadge t="warn">in review</ToneBadge>
                ) : (
                  <ToneBadge t="muted">draft</ToneBadge>
                )}
              </div>
              <div className="rounded-md border bg-sidebar/70 px-2 py-1.5">{draft && <ShowStrip show={draft} />}</div>
            </Link>
          )
        })}
        {recent.length === 0 && <p className="bg-card p-5 text-sm text-muted-foreground">No shows yet.</p>}
      </div>
    </Panel>
  )
}

const ACTION: Record<string, { icon: typeof Bot; verb: string; tone: string }> = {
  'document.create': { icon: Clapperboard, verb: 'created', tone: 'text-muted-foreground' },
  'asset.upload': { icon: Upload, verb: 'uploaded', tone: 'text-muted-foreground' },
  'revision.publish': { icon: Upload, verb: 'published', tone: 'text-motion' },
  'revision.approve': { icon: ShieldCheck, verb: 'approved', tone: 'text-sensor' },
  'revision.reject': { icon: ShieldAlert, verb: 'rejected', tone: 'text-danger' },
  'show.deploy': { icon: Rocket, verb: 'deployed', tone: 'text-primary' },
  'show.launch': { icon: Play, verb: 'launched', tone: 'text-primary' },
  'show.stop': { icon: CircleCheck, verb: 'stopped', tone: 'text-muted-foreground' },
  'estop.trigger': { icon: OctagonX, verb: 'pressed e-stop on', tone: 'text-danger' },
  'estop.reset': { icon: CircleCheck, verb: 'reset e-stop on', tone: 'text-sensor' },
  'devices.provision': { icon: Gauge, verb: 'provisioned', tone: 'text-muted-foreground' },
}

function Activity() {
  const { data = [] } = useQuery({ queryKey: [...qk.audit, 'feed'], queryFn: () => api('listAudit', { query: { limit: 9 } }), refetchInterval: 5000 })
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <span className="font-semibold">Activity</span>
        <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground">
          Audit log →
        </Link>
      </div>
      <ol className="space-y-0.5 p-2">
        {data.map((e: AuditEntry) => {
          const a = ACTION[e.action] ?? { icon: CircleCheck, verb: e.action.replace(/[._]/g, ' '), tone: 'text-muted-foreground' }
          return (
            <li key={e.seq} className="flex items-start gap-3 rounded-md px-3 py-2">
              <a.icon className={cn('mt-0.5 size-4 shrink-0', a.tone)} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium capitalize">{e.actor}</span> <span className="text-muted-foreground">{a.verb}</span>{' '}
                <span className="font-mono text-xs">{e.entityId}</span>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.at)}</span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
