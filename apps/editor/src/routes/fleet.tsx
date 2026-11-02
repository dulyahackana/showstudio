import type { Deployment, Device } from '@studio/schema'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Rocket, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { FloorPlan } from '@/components/floor-plan'
import { KIND, KindTile, STATE_STYLE, StatusDot } from '@/components/kind'
import { EnvironmentPicker } from '@/components/environment-picker'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { DeviceStateBadge, ToneBadge } from '@/components/status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { mergeDevices } from '@/features/fleet/merge-devices'
import { api, problemMessage } from '@/lib/api'
import { formatMs, shortSha, timeAgo } from '@/lib/format'
import { deploymentsQuery, docsQuery, envStatusQuery, qk, revisionsQuery, useCharacters, useRevision } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useDocPermission } from '@/lib/project'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/fleet')({
  validateSearch: z.object({ env: z.string().optional() }),
  component: FleetPage,
})

function DeployDialog({ environmentId }: { environmentId: string }) {
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState<string[] | null>(null)
  const qc = useQueryClient()
  const { data: envDocs = [] } = useQuery(docsQuery('environment'))
  const deployRole = useCan('createDeployment')
  const deployProject = useDocPermission(envDocs.find((e) => e.id === environmentId)?.projectId, 'operate')
  const canDeploy = deployRole && deployProject
  const { data: shows = [] } = useQuery(docsQuery('show'))
  const form = useForm({
    defaultValues: { showId: '', revision: 0 },
    validators: {
      onSubmit: z.object({
        showId: z.string().min(1, 'Pick a show'),
        revision: z.number().int().positive('Pick an approved revision'),
      }),
    },
    onSubmit: async ({ value }) => {
      setReasons(null)
      try {
        const d = await api('createDeployment', { body: value })
        toast.success(`Deploying ${d.name} r${d.revision}`, {
          description: `${d.targets.length} devices will download, verify and stage it.`,
        })
        void qc.invalidateQueries({ queryKey: qk.deployments(environmentId) })
        setOpen(false)
      } catch (err) {
        const p = problemMessage(err)
        setReasons(p.reasons ?? [p.detail ?? p.title])
      }
    },
  })
  const showId = useStore(form.store, (s) => s.values.showId)
  const { data: revisions = [] } = useQuery({ ...revisionsQuery(showId), enabled: !!showId })
  const approved = revisions.filter((r) => r.status === 'approved')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canDeploy} data-testid="deploy-show">
          <Rocket /> Deploy show
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy to {environmentId}</DialogTitle>
          <DialogDescription>
            Only safety-approved, signed revisions can be deployed. Every device must be online and run the pinned
            definition (all-or-nothing).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="showId">
            {(field) => (
              <Field>
                <FieldLabel>Show</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    field.handleChange(v)
                    form.setFieldValue('revision', 0)
                  }}
                >
                  <SelectTrigger className="w-full" data-testid="deploy-show-select">
                    <SelectValue placeholder="Choose a show" />
                  </SelectTrigger>
                  <SelectContent>
                    {shows.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{' '}
                        {s.latestApprovedRevision
                          ? `(approved r${s.latestApprovedRevision})`
                          : '(no approved revision)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          <form.Field name="revision">
            {(field) => (
              <Field>
                <FieldLabel>Approved revision</FieldLabel>
                <Select
                  value={field.state.value ? String(field.state.value) : ''}
                  onValueChange={(v) => field.handleChange(Number(v))}
                >
                  <SelectTrigger className="w-full" data-testid="deploy-revision-select">
                    <SelectValue
                      placeholder={showId && !approved.length ? 'Nothing approved yet' : 'Choose a revision'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {approved.map((r) => (
                      <SelectItem key={r.revision} value={String(r.revision)}>
                        r{r.revision} · approved by {r.reviewedBy} · {shortSha(r.bundleSha256)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          {reasons && (
            <Alert variant="destructive">
              <AlertTitle>Not deployed</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <form.Subscribe selector={(s) => [s.isSubmitting, s.values.revision] as const}>
              {([submitting, revision]) => (
                <Button type="submit" disabled={submitting || !revision} data-testid="confirm-deploy">
                  {submitting ? 'Deploying…' : 'Deploy'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeviceRow({ d }: { d: Device }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3" data-testid={`device-${d.id}`}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-medium">{d.id}</span>
          <DeviceStateBadge state={d.state} online={d.online} />
        </div>
        <div className="flex flex-wrap gap-1">
          {d.staged.length === 0 && <span className="text-[11px] text-muted-foreground">nothing staged</span>}
          {d.staged.map((st) => (
            <Tooltip key={st.sha256}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[10px]',
                    st.status === 'staged'
                      ? 'border-sensor/25 bg-sensor/10 text-sensor'
                      : st.status === 'rejected'
                        ? 'border-danger/30 bg-danger/10 text-danger'
                        : 'border-motion/25 bg-motion/10 text-motion',
                  )}
                >
                  {st.status === 'staged' ? '✓' : st.status === 'rejected' ? '✗' : '…'} {st.showId} r{st.revision}
                </span>
              </TooltipTrigger>
              <TooltipContent>{st.reason ?? `${st.status} · ${shortSha(st.sha256)}`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="truncate">
            {d.characterRef ? `${d.characterRef.id}@${d.characterRef.revision} · ` : ''}
            {d.firmware}
          </span>
          <span className="shrink-0">
            {d.active ? `▶ ${formatMs(d.active.showTimeMs, false)}` : timeAgo(d.lastSeenAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

function DeploymentRow({ d }: { d: Deployment }) {
  const staged = d.targets.filter((t) => t.status === 'staged').length
  const rejected = d.targets.filter((t) => t.status === 'rejected')
  const pct = (staged / Math.max(1, d.targets.length)) * 100
  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">
            {d.name} <span className="font-mono text-xs text-muted-foreground">r{d.revision}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {shortSha(d.sha256)} · {d.createdBy} · {timeAgo(d.createdAt)}
          </div>
        </div>
        {d.goodToGo ? (
          <span data-testid={`good-to-go-${d.showId}`}>
            <ToneBadge t="ok">good to go</ToneBadge>
          </span>
        ) : (
          <ToneBadge t={rejected.length ? 'bad' : 'info'}>
            {staged}/{d.targets.length} staged
          </ToneBadge>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-[width]', rejected.length ? 'bg-danger' : d.goodToGo ? 'bg-sensor' : 'bg-motion')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {rejected.map((t) => (
        <p key={t.deviceId} className="text-xs text-danger">
          <span className="font-mono">{t.deviceId}</span>: {t.reason}
        </p>
      ))}
    </div>
  )
}

function FleetPage() {
  const { env } = Route.useSearch()
  const navigate = useNavigate()
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const environmentId = env ?? envs.find((e) => e.latestRevision)?.id
  useEffect(() => {
    if (!env && environmentId) void navigate({ to: '/fleet', search: { env: environmentId }, replace: true })
  }, [env, environmentId, navigate])

  const { data: status } = useQuery({ ...envStatusQuery(environmentId ?? ''), enabled: !!environmentId })
  const { data: deployments = [] } = useQuery({ ...deploymentsQuery(environmentId), enabled: !!environmentId })
  const layout = useRevision<'environment'>(
    environmentId && status?.environmentRevision ? { id: environmentId, revision: status.environmentRevision } : null,
  )
  const { characters } = useCharacters(layout.data?.content.placements.map((p) => p.character) ?? [])
  const devices = mergeDevices(status)
  const online = devices.filter((d) => d.online).length
  const states = Object.fromEntries(devices.map((d) => [d.id, d.online ? d.state : ('offline' as const)]))

  return (
    <>
      <PageHeader
        eyebrow="Operate"
        title="Fleet & deploy"
        description="Approved, signed shows go to every figure, light, audio and sensor controller. Each one verifies the bundle and its own limits before the show is good to go."
        actions={
          <>
            <EnvironmentPicker
              value={environmentId}
              onChange={(id) => void navigate({ to: '/fleet', search: { env: id } })}
            />
            {environmentId && <DeployDialog environmentId={environmentId} />}
          </>
        }
      />
      <PageBody>
        {environmentId && online === 0 && (
          <Alert>
            <Terminal />
            <AlertTitle>No controllers online</AlertTitle>
            <AlertDescription>
              Start the attraction: <code className="rounded bg-muted px-1 font-mono">bun run sim:godot</code> (game-engine
              twin) or <code className="rounded bg-muted px-1 font-mono">bun run fleet-sim</code> (headless). Devices
              provision themselves and connect over the device protocol.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <span className="font-semibold">
                Devices ({online}/{devices.length} online)
              </span>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {(['ready', 'running', 'estopped', 'offline'] as const).map((st) => (
                  <span key={st} className="inline-flex items-center gap-1.5">
                    <StatusDot state={st} /> {STATE_STYLE[st].label}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-blueprint relative min-h-80 flex-1 bg-sidebar/60">
              {layout.data && (
                <FloorPlan
                  env={layout.data.content}
                  characters={characters}
                  states={states}
                  labels
                  className="absolute inset-0 p-5"
                />
              )}
            </div>
          </Panel>
          <Panel className="flex flex-col">
            <div className="border-b px-5 py-3 font-semibold">Deployments</div>
            <div className="flex-1 divide-y">
              {deployments.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">Nothing deployed yet. Deploy an approved show.</p>
              )}
              {deployments.map((d) => (
                <DeploymentRow key={d.id} d={d} />
              ))}
            </div>
          </Panel>
        </div>
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {(['doll', 'light', 'audio', 'sensor'] as const).map((kind) => {
            const group = devices.filter((d) => d.kind === kind)
            return (
              <Panel key={kind} className="overflow-hidden">
                <div className="flex items-center gap-2.5 border-b px-4 py-3">
                  <KindTile kind={kind} />
                  <span className="font-semibold">{KIND[kind].plural}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {group.filter((d) => d.online).length}/{group.length}
                  </span>
                </div>
                <div className="divide-y">
                  {group.map((d) => (
                    <DeviceRow key={d.id} d={d} />
                  ))}
                  {group.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">None installed.</p>}
                </div>
              </Panel>
            )
          })}
        </div>
      </PageBody>
    </>
  )
}
