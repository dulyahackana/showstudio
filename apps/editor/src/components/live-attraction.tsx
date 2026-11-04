import type { Project } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Map as MapIcon, OctagonX, Play, Server } from 'lucide-react'
import { FloorPlan } from '@/components/floor-plan'
import { Stat, StatusDot } from '@/components/kind'
import { Panel } from '@/components/page'
import { StageBadge } from '@/components/project-ui'
import { ToneBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { activeRun, useLiveFrame } from '@/features/fleet/live-frame'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { useNow } from '@/hooks/use-now'
import { formatMs } from '@/lib/format'
import { useProjectStage, useProjects } from '@/lib/project'
import { envStatusQuery, useCharacters, useRevision } from '@/lib/queries'
import { useCan } from '@/lib/session'

/**
 * One environment, live: floor plan with the lights as they are now, what is playing,
 * controllers online, shows staged, and the projects made for it.
 */
type ButtonVariant = 'default' | 'outline'

function ControlRoomButton({
  envId,
  className,
  variant = 'default',
}: {
  envId: string
  className?: string
  variant?: ButtonVariant
}) {
  return (
    <Button size="sm" variant={variant} className={className} asChild>
      <Link to="/environments/$id/operate" params={{ id: envId }} data-testid={`operate-${envId}`}>
        <Play /> Control room
      </Link>
    </Button>
  )
}

function LayoutButton({
  envId,
  className,
  variant = 'default',
}: {
  envId: string
  className?: string
  variant?: ButtonVariant
}) {
  return (
    <Button size="sm" variant={variant} className={className} asChild>
      <Link to="/environments/$id" params={{ id: envId }}>
        <MapIcon /> Layout
      </Link>
    </Button>
  )
}

export function LiveAttraction({ envId }: { envId: string }) {
  const operator = useCan('launch')
  const { data: status, dataUpdatedAt: updatedAt } = useQuery(envStatusQuery(envId))
  const now = useNow(250)
  const serverNow = now + (status ? status.serverTime - updatedAt : 0)
  const env = useRevision<'environment'>(
    status?.environmentRevision ? { id: envId, revision: status.environmentRevision } : null,
  )
  const { characters } = useCharacters(env.data?.content.placements.map((p) => p.character) ?? [])
  const frame = useLiveFrame(status, serverNow)
  const run = activeRun(status)
  const latched = status?.estop.active ?? false
  const devices = mergeDevices(status)
  const states = Object.fromEntries(devices.map((d) => [d.id, d.online ? d.state : ('offline' as const)]))
  const elapsed = run ? Math.max(0, Math.min(run.durationMs, serverNow - run.startAt)) : 0

  return (
    <Panel className="@container flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2.5">
          <StatusDot state={latched ? 'estopped' : run ? 'running' : 'ready'} />
          <Link to="/environments/$id" params={{ id: envId }} className="font-semibold hover:underline">
            {env.data?.content.name ?? envId}
          </Link>
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
      <div className="grid flex-1 @2xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="bg-blueprint relative min-h-64 bg-sidebar/60 p-4 @2xl:min-h-72">
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
        <div className="grid gap-4 border-t p-4 @md:grid-cols-2 @2xl:flex @2xl:flex-col @2xl:gap-5 @2xl:border-t-0 @2xl:border-l @2xl:p-5">
          <div>
            <div className="text-eyebrow">Now playing</div>
            {run ? (
              <>
                <div className="mt-1 text-lg font-semibold">{run.name}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${(elapsed / run.durationMs) * 100}%` }}
                  />
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
          <div className="@md:col-span-2">
            <ProjectsFor envId={envId} />
          </div>
          {/* The first action is the one this person came for: operators run, engineers lay out. */}
          <div className="mt-auto grid grid-cols-2 gap-1.5 @md:col-span-2 @md:grid-cols-3 @2xl:grid-cols-2">
            {operator ? (
              <>
                <ControlRoomButton envId={envId} className="col-span-2 @md:col-span-1 @2xl:col-span-2" />
                <LayoutButton envId={envId} variant="outline" />
              </>
            ) : (
              <>
                <LayoutButton envId={envId} className="col-span-2 @md:col-span-1 @2xl:col-span-2" />
                <ControlRoomButton envId={envId} variant="outline" />
              </>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to="/environments/$id/devices" params={{ id: envId }}>
                <Server /> Devices
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ProjectsFor({ envId }: { envId: string }) {
  const { data: projects = [] } = useProjects()
  const mine = projects.filter((p) => p.environmentId === envId)
  return (
    <div>
      <div className="text-eyebrow">Shows made for it</div>
      <div className="mt-2 space-y-1.5">
        {mine.map((p) => (
          <ProjectLine key={p.id} project={p} />
        ))}
        {mine.length === 0 && <p className="text-sm text-muted-foreground">None of your projects.</p>}
      </div>
    </div>
  )
}

function ProjectLine({ project }: { project: Project }) {
  const stage = useProjectStage(project)
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="flex items-center justify-between gap-2 text-sm hover:text-primary"
    >
      <span className="truncate">{project.name}</span>
      <StageBadge stage={stage} />
    </Link>
  )
}
