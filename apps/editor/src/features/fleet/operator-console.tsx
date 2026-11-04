import { environmentDevices, type PreparedShow, SENSOR_EVENTS, type SensorEvent } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { OctagonX, Play, Radar, RefreshCw, Rocket, Square } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FloorPlan } from '@/components/floor-plan'
import { KindIcon, STATE_STYLE, StatusDot } from '@/components/kind'
import { Panel } from '@/components/page'
import { ShowStrip } from '@/components/show-strip'
import { ToneBadge } from '@/components/status'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { activeRun, useLiveFrame } from '@/features/fleet/live-frame'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { useNow } from '@/hooks/use-now'
import { api, problemMessage } from '@/lib/api'
import { formatMs } from '@/lib/format'
import { useProjects } from '@/lib/project'
import { envStatusQuery, qk, useCharacters, useRevision } from '@/lib/queries'
import { canCall, useCan, useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const toastError = (err: unknown) => {
  const p = problemMessage(err)
  toast.error(p.title, { description: [p.detail, ...(p.reasons ?? [])].filter(Boolean).join(' · ') })
}

/**
 * The control room for one environment: big targets, readiness at a glance, e-stop
 * always visible, and a zone-clear confirmation before anything moves. focusShowId
 * puts one project's show first (its Launch step).
 */
export function OperatorConsole({ environmentId, focusShowId }: { environmentId: string; focusShowId?: string }) {
  const qc = useQueryClient()
  const user = useUser()
  const { data: projects = [] } = useProjects()
  const { data: status, dataUpdatedAt } = useQuery(envStatusQuery(environmentId))
  const layout = useRevision<'environment'>(
    environmentId && status?.environmentRevision ? { id: environmentId, revision: status.environmentRevision } : null,
  )
  const { characters } = useCharacters(layout.data?.content.placements.map((p) => p.character) ?? [])
  const now = useNow(100)
  // Stop and reset act on the environment (workspace operator role); launching a show also
  // needs the operator role in that show's project.
  const canOperate = useCan('launch')
  const operatesProject = (showId: string) =>
    !!user?.roles.includes('admin') ||
    ['owner', 'operator'].includes(projects.find((p) => p.id === showId)?.myRole ?? '')
  const canLaunch = (showId: string) => canOperate && operatesProject(showId)
  const canDeploy = (showId: string) => canCall(user, 'createDeployment') && operatesProject(showId)
  const canSimulate = canCall(user, 'simulateSensor')
  const [launching, setLaunching] = useState<PreparedShow | null>(null)
  const [zoneClear, setZoneClear] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const offset = status ? status.serverTime - dataUpdatedAt : 0
  const serverNow = now + offset
  const run = activeRun(status)
  const frame = useLiveFrame(status, serverNow)
  const runShow = useRevision<'show'>(run ? { id: run.showId, revision: run.revision } : null)
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  // After a show completes, controllers with standby responses keep answering guests until stopped.
  const standby = !run && devices.some((d) => d.online && d.state === 'standby') ? status?.run : null
  const states = Object.fromEntries(devices.map((d) => [d.id, d.online ? d.state : ('offline' as const)]))
  const names = new Map(layout.data ? environmentDevices(layout.data.content).map((d) => [d.deviceId, d.name]) : [])
  const refresh = () => qc.invalidateQueries({ queryKey: qk.envStatus(environmentId) })
  const prepared = [...(status?.prepared ?? [])].sort(
    (a, b) => Number(b.showId === focusShowId) - Number(a.showId === focusShowId),
  )
  const focusStaged = !focusShowId || prepared.some((p) => p.showId === focusShowId)

  const estop = useMutation({
    mutationFn: () => api('estop', { body: { environmentId, reason: 'operator e-stop' } }),
    onSuccess: () => {
      toast.error('E-STOP sent to every device')
      void refresh()
    },
    onError: toastError,
  })
  const reset = useMutation({
    mutationFn: () => api('resetEstop', { body: { environmentId } }),
    onSuccess: () => void refresh(),
    onError: toastError,
  })
  const stop = useMutation({
    mutationFn: () => api('stop', { body: { environmentId } }),
    onSuccess: () => void refresh(),
    onError: toastError,
  })
  const launch = useMutation({
    mutationFn: async (show: PreparedShow) => {
      if (run) {
        await api('stop', { body: { environmentId } })
        await sleep(600)
      }
      return api('launch', { body: { showId: show.showId, revision: show.revision, zoneClearConfirmed: true } })
    },
    onSuccess: (r) => {
      toast.success(`${r.name} launches in ${Math.round((r.startAt - Date.now()) / 1000)} s`)
      void refresh()
    },
    onError: toastError,
  })
  const simulate = useMutation({
    mutationFn: ({ deviceId, event }: { deviceId: string; event: 'enter' | 'exit' | 'press' }) =>
      api('simulateSensor', { params: { deviceId }, body: { environmentId, event } }),
    onError: toastError,
  })

  const estopActive = status?.estop.active ?? false
  const elapsed = run ? Math.min(run.durationMs, serverNow - run.startAt) : 0
  const startingIn = run && serverNow < run.startAt ? (run.startAt - serverNow) / 1000 : null
  const clock = new Date(serverNow)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-surface/40 px-6">
        <div className="min-w-0">
          <div className="text-eyebrow">Control room</div>
          <div className="truncate text-sm font-semibold">{layout.data?.content.name ?? environmentId}</div>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <div className="text-right">
            <div className="text-eyebrow">Park time</div>
            <div className="font-mono text-sm tabular">{clock.toLocaleTimeString([], { hour12: false })}</div>
          </div>
          <div className="text-right">
            <div className="text-eyebrow">Controllers</div>
            <div className={cn('font-mono text-sm tabular', online < devices.length && 'text-warn')}>
              {online}/{devices.length} online
            </div>
          </div>
          <button
            type="button"
            onClick={() => estop.mutate()}
            className="group flex h-11 items-center gap-2.5 rounded-lg border border-[#ff8a80]/30 bg-gradient-to-b from-[#b4232c] to-[#7f1d24] px-5 font-semibold tracking-[0.18em] text-white shadow-[0_0_0_3px_rgba(255,255,255,0.08),0_8px_24px_-8px_rgba(180,35,44,0.8)] transition hover:from-[#c8303a] active:scale-[0.97] disabled:opacity-40"
            data-testid="estop"
          >
            <OctagonX className="size-5" /> E-STOP
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-auto px-6 py-6">
        {estopActive && (
          <div
            className="flex items-center gap-4 rounded-xl border border-danger/40 bg-gradient-to-r from-danger/15 to-transparent p-4"
            data-testid="estop-banner"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-danger/20">
              <OctagonX className="size-5 text-danger" />
            </span>
            <div className="flex-1">
              <p className="font-semibold tracking-wide text-danger">E-STOP LATCHED</p>
              <p className="text-sm text-muted-foreground">
                {status?.estop.by} · {status?.estop.reason} ·{' '}
                {status?.estop.at && new Date(status.estop.at).toLocaleTimeString()} · figures held at rest until reset
              </p>
            </div>
            {canOperate ? (
              <Button variant="outline" onClick={() => setResetOpen(true)} data-testid="reset-estop">
                <RefreshCw /> Reset
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">An operator resets it after inspection</span>
            )}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="flex flex-col overflow-hidden" data-testid="now-playing">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <span className="text-eyebrow">Now playing</span>
                {run ? (
                  startingIn !== null ? (
                    <ToneBadge t="warn">armed</ToneBadge>
                  ) : (
                    <ToneBadge t="info">running</ToneBadge>
                  )
                ) : standby ? (
                  <ToneBadge t="sensor">standby</ToneBadge>
                ) : (
                  <ToneBadge t="muted">idle</ToneBadge>
                )}
              </div>
              <div className={cn('flex flex-1 flex-col justify-between', run || standby ? 'gap-6 p-6' : 'gap-3 p-5')}>
                <div>
                  <div className={cn('font-semibold tracking-tight', run || standby ? 'text-3xl' : 'text-xl')}>
                    {run ? (
                      <>
                        {run.name} <span className="font-mono text-lg text-muted-foreground">· r{run.revision}</span>
                      </>
                    ) : standby ? (
                      <span data-testid="standby">
                        Standby <span className="text-lg text-muted-foreground">· {standby.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Nothing running</span>
                    )}
                  </div>
                  {run && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      launched by <span className="capitalize">{run.launchedBy}</span>
                    </div>
                  )}
                  {standby && (
                    <div className="mt-1 max-w-md text-sm text-muted-foreground">
                      The show has ended. Figures rest at home and still answer guests with its between-show responses.
                    </div>
                  )}
                </div>
                {run && (
                  <div className="space-y-3">
                    {startingIn !== null ? (
                      <div className="font-mono text-5xl font-semibold text-warn tabular">
                        T−{startingIn.toFixed(1)}
                        <span className="ml-2 text-lg text-muted-foreground">s</span>
                      </div>
                    ) : (
                      <div className="font-mono text-5xl font-semibold tabular">
                        {formatMs(Math.max(0, elapsed), false)}
                        <span className="text-2xl text-muted-foreground"> / {formatMs(run.durationMs, false)}</span>
                      </div>
                    )}
                    <div className="rounded-lg border bg-sidebar px-3 py-2">
                      {runShow.data ? (
                        <ShowStrip
                          show={runShow.data.content}
                          progress={Math.max(0, elapsed) / run.durationMs}
                          className="h-16"
                        />
                      ) : (
                        <div className="h-16" />
                      )}
                    </div>
                  </div>
                )}
                {canOperate &&
                  (run || standby ? (
                    <Button
                      size="lg"
                      variant="secondary"
                      className="self-start"
                      disabled={stop.isPending}
                      onClick={() => stop.mutate()}
                      data-testid="stop"
                    >
                      <Square /> {run ? 'Stop show' : 'End standby'}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">Launch one of the prepared shows below.</p>
                  ))}
              </div>
            </Panel>

            <section className="space-y-3">
              <h2
                className="text-sm font-semibold"
                title="Staged and verified on every controller. Launch one, or swap at any time."
              >
                Prepared shows
              </h2>
              {!focusStaged && focusShowId && (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm">
                  <Rocket className="size-4 text-muted-foreground" />
                  <span className="flex-1 text-muted-foreground">
                    This show is not staged on {layout.data?.content.name ?? environmentId} yet.
                  </span>
                  {canDeploy(focusShowId) && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/projects/$projectId/deploy" params={{ projectId: focusShowId }}>
                        Go to Deploy
                      </Link>
                    </Button>
                  )}
                </div>
              )}
              <div className="grid gap-4 2xl:grid-cols-2">
                {prepared.map((p) => (
                  <PreparedCard
                    key={p.sha256}
                    show={p}
                    focused={p.showId === focusShowId}
                    running={run?.sha256 === p.sha256}
                    swapping={!!run && run.sha256 !== p.sha256}
                    canLaunch={canLaunch(p.showId)}
                    disabled={!p.goodToGo || estopActive || run?.sha256 === p.sha256 || launch.isPending}
                    onLaunch={() => {
                      setZoneClear(false)
                      setLaunching(p)
                    }}
                  />
                ))}
                {status && status.prepared.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No shows staged. Deploy an approved show from its project (step 3, Deploy).
                  </p>
                )}
              </div>
            </section>
          </div>
          <div className="space-y-6">
            <Panel className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <span className="text-eyebrow">Attraction · live</span>
                <span className="text-[11px] text-muted-foreground">main timeline · responses decided on site</span>
              </div>
              <div className="bg-blueprint relative min-h-80 flex-1 bg-sidebar/70 xl:min-h-[26rem]">
                {layout.data && (
                  <FloorPlan
                    env={layout.data.content}
                    characters={characters}
                    lights={frame?.lights}
                    states={states}
                    labels
                    className="absolute inset-0 p-5"
                  />
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-px border-t bg-border">
                {devices.map((d) => {
                  const key = d.online ? d.state : 'offline'
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 bg-card px-3 py-2"
                      title={`${names.get(d.id) ?? d.id} (${d.id}): ${STATE_STYLE[key].label}`}
                    >
                      <KindIcon kind={d.kind} className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate text-xs">{names.get(d.id) ?? d.id}</span>
                      <StatusDot state={key} />
                    </div>
                  )
                })}
              </div>
            </Panel>
            {canSimulate && layout.data && layout.data.content.sensors.length > 0 && (
              <section className="space-y-3">
                <h2
                  className="text-sm font-semibold"
                  title="Makes a sensor fire on site. The park's local show controller decides the reaction."
                >
                  Guest simulation
                </h2>
                <div className="flex flex-wrap gap-2">
                  {layout.data.content.sensors.flatMap((s) =>
                    SENSOR_EVENTS[s.type].map((ev) => (
                      <Button
                        key={`${s.deviceId}-${ev}`}
                        variant="outline"
                        size="sm"
                        className="border-sensor/30 text-sensor hover:bg-sensor/10 hover:text-sensor"
                        disabled={!devices.find((d) => d.id === s.deviceId)?.online}
                        onClick={() => simulate.mutate({ deviceId: s.deviceId, event: ev })}
                        data-testid={`sensor-${s.deviceId}-${ev}`}
                      >
                        <Radar /> {SENSOR_EVENT_LABEL[ev]} · {s.name}
                      </Button>
                    )),
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!launching} onOpenChange={(o) => !o && setLaunching(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {run ? 'Swap to' : 'Launch'} {launching?.name} r{launching?.revision}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {run ? `"${run.name}" stops first. ` : ''}All devices start together a few seconds after you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label className="flex items-center gap-3 rounded-lg border bg-surface-2/60 p-3 text-sm">
            <Checkbox checked={zoneClear} onCheckedChange={(v) => setZoneClear(v === true)} data-testid="zone-clear" />I
            confirm the show zone is clear of guests and staff.
          </Label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!zoneClear}
              onClick={() => launching && launch.mutate(launching)}
              data-testid="confirm-launch"
            >
              Launch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the e-stop?</AlertDialogTitle>
            <AlertDialogDescription>
              Only reset after the cause has been inspected and the area is safe. Figures stay at rest until a show is
              launched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reset.mutate()}>Reset e-stop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PreparedCard({
  show,
  focused,
  running,
  swapping,
  canLaunch,
  disabled,
  onLaunch,
}: {
  show: PreparedShow
  focused: boolean
  running: boolean
  swapping: boolean
  canLaunch: boolean
  disabled: boolean
  onLaunch: () => void
}) {
  const rev = useRevision<'show'>({ id: show.showId, revision: show.revision })
  return (
    <Panel
      className={cn(
        'flex flex-col overflow-hidden transition',
        focused && 'border-primary/50',
        running && 'border-motion/50 shadow-[0_0_0_1px_var(--motion)]',
      )}
      data-testid={`prepared-${show.showId}`}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {show.name} <span className="font-mono text-xs text-muted-foreground">r{show.revision}</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{formatMs(show.durationMs, false)}</div>
        </div>
        <div className="flex gap-1.5">
          {running && <ToneBadge t="info">running</ToneBadge>}
          {show.goodToGo ? (
            <ToneBadge t="ok">good to go</ToneBadge>
          ) : (
            <ToneBadge t="warn">
              {show.stagedOn}/{show.targets} staged
            </ToneBadge>
          )}
        </div>
      </div>
      <div className="mx-4 rounded-md border bg-sidebar px-2 py-1.5">
        {rev.data ? <ShowStrip show={rev.data.content} /> : <div className="h-14" />}
      </div>
      {canLaunch ? (
        <div className="p-4">
          <Button
            size="lg"
            className="w-full"
            disabled={disabled}
            onClick={onLaunch}
            data-testid={`launch-${show.showId}`}
          >
            <Play /> {swapping ? 'Swap to this show' : 'Launch'}
          </Button>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </Panel>
  )
}

const SENSOR_EVENT_LABEL: Record<SensorEvent, string> = {
  enter: 'Guest walks in',
  exit: 'Guest walks out',
  press: 'Guest presses',
}
