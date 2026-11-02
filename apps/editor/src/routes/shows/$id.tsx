import { compileBundle, validateShow } from '@studio/playback'
import { SENSOR_EVENTS, type ShowDefinition, type Tracks } from '@studio/schema'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import type { Draft } from 'immer'
import { AlertTriangle, ArrowLeft, History, ListTree, Pause, Play, Radar, Repeat, Settings2, SkipBack, ZoomIn } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EditorToolbar } from '@/components/editor-toolbar'
import { IssuesList } from '@/components/issues-list'
import { RevisionsPanel } from '@/components/revisions-panel'
import { StageScene, type StageSelection } from '@/components/three/stage-scene'
import { framing, Glass, Viewport } from '@/components/three/viewport'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { BehaviorsPanel } from '@/features/shows/behaviors-panel'
import { Inspector } from '@/features/shows/inspector'
import { type Playback, usePlayback } from '@/features/shows/playback'
import { SettingsPanel } from '@/features/shows/settings-panel'
import { Timeline } from '@/features/shows/timeline'
import {
  draftKeys,
  draftTargetTracks,
  issueKey,
  keysOf,
  type Selection,
  type Target,
  targetTracks,
} from '@/features/shows/timeline-math'
import { assetUrl } from '@/lib/api'
import { useDocEditor } from '@/lib/doc-editor'
import { formatMs } from '@/lib/format'
import { assetsQuery, docQuery, useShowContext } from '@/lib/queries'

export const Route = createFileRoute('/shows/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(docQuery(params.id)),
  component: ShowEditor,
})

function useAudioDurations(ids: string[]): Record<string, number> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['audio-duration', id],
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: () =>
        new Promise<number>((resolve) => {
          const a = new Audio(assetUrl(id))
          a.preload = 'metadata'
          a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration * 1000 : 2000)
          a.onerror = () => resolve(2000)
        }),
    })),
  })
  return Object.fromEntries(ids.map((id, i) => [id, results[i]?.data ?? 2000]))
}

function Transport({ playback, zoom, setZoom }: { playback: Playback; zoom: number; setZoom: (z: number) => void }) {
  const t = useSelector(playback.store, (s) => s.t)
  const playing = useSelector(playback.store, (s) => s.playing)
  const loop = useSelector(playback.store, (s) => s.loop)
  return (
    <div className="ml-auto flex items-center gap-3 pr-3">
      <div className="flex items-center gap-0.5 rounded-lg border bg-surface-2/60 p-0.5">
        <Button size="icon-sm" variant="ghost" onClick={() => playback.seek(0)} aria-label="Back to start">
          <SkipBack />
        </Button>
        <Button
          size="icon-sm"
          variant={playing ? 'secondary' : 'default'}
          onClick={() => playback.toggle()}
          aria-label={playing ? 'Pause' : 'Play'}
          data-testid="play"
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Toggle size="sm" pressed={loop} onPressedChange={(v) => playback.setLoop(v)} aria-label="Loop">
          <Repeat />
        </Toggle>
      </div>
      <span className="rounded-md border bg-sidebar px-2.5 py-1 font-mono text-xs tabular" data-testid="time">
        <span className="text-foreground">{formatMs(t)}</span>
        <span className="text-muted-foreground"> / {formatMs(playback.durationMs)}</span>
      </span>
      <div className="flex items-center gap-2 text-muted-foreground">
        <ZoomIn className="size-3.5" />
        <Slider className="w-24" min={15} max={300} step={5} value={[zoom]} onValueChange={([z = 60]) => setZoom(z)} />
      </div>
    </div>
  )
}

const clipShow = (show: ShowDefinition, behaviorId: string): ShowDefinition => {
  const b = show.behaviors.find((x) => x.id === behaviorId)
  return b ? { ...show, durationMs: b.durationMs, tracks: b.tracks, behaviors: [] } : show
}

function ShowEditor() {
  const { id } = Route.useParams()
  const editor = useDocEditor(id, 'show')
  const { draft, update } = editor
  const { environment, characters, loading, error } = useShowContext(draft.environment)
  const { data: assets = [] } = useQuery(assetsQuery)
  const audioAssets = useMemo(() => assets.filter((a) => a.kind === 'audio'), [assets])
  const [target, setTarget] = useState<Target>({ kind: 'main' })
  const [selection, setSelection] = useState<Selection | null>(null)
  const [focusDevice, setFocusDevice] = useState<string | null>(null)
  const [zoom, setZoom] = useState(60)
  const [tab, setTab] = useState('timeline')

  const issues = useMemo(
    () =>
      environment ? validateShow(draft, { environment, characters, assets: new Set(assets.map((a) => a.id)) }) : [],
    [draft, environment, characters, assets],
  )

  const bundle = useMemo(() => {
    if (
      !environment ||
      characters.size < new Set(environment.placements.map((p) => `${p.character.id}@${p.character.revision}`)).size
    )
      return null
    try {
      return compileBundle({
        show: { id, revision: 1 },
        definition: target.kind === 'main' ? draft : clipShow(draft, target.id),
        environment,
        characters,
        assetPath: (a) => a,
      })
    } catch {
      return null
    }
  }, [draft, environment, characters, target, id])
  const playback = usePlayback(bundle)
  const activeBehaviors = useSelector(playback.store, (s) => s.activeBehaviors)
  const activeSensors = useSelector(playback.store, (s) => s.activeSensors)

  const current = targetTracks(draft, target)
  useEffect(() => {
    if (!current) setTarget({ kind: 'main' })
  }, [current])

  const editTracks = useCallback(
    (fn: (t: Draft<Tracks>) => void, key?: string) =>
      update((d) => {
        const tracks = draftTargetTracks(d as ShowDefinition, target)
        if (tracks) fn(tracks as Draft<Tracks>)
      }, key),
    [update, target],
  )

  const issueKeys = useMemo(
    () =>
      new Set(
        issues
          .filter(
            (i) => i.severity === 'error' && (target.kind === 'main' ? !i.behaviorId : i.behaviorId === target.id),
          )
          .map((i) => issueKey(i.deviceId, i.joint, i.index)),
      ),
    [issues, target],
  )
  const audioDurations = useAudioDurations(useMemo(() => audioAssets.map((a) => a.id), [audioAssets]))

  const addAudioCue = (deviceId: string, t: number) => {
    const asset = audioAssets[0]
    if (!asset) {
      toast.error('No audio files yet', { description: 'Upload WAV/OGG/MP3 files on the Assets page first.' })
      return
    }
    const zone = environment?.audio.find((a) => a.deviceId === deviceId)
    const row = { kind: 'audio' as const, deviceId }
    let index = 0
    editTracks((tr) => {
      const cues = draftKeys(tr as Tracks, row) as Tracks['audio'][string]
      const used = new Set(cues.map((c) => c.id))
      let n = cues.length + 1
      while (used.has(`cue-${n}`)) n++
      cues.push({
        id: `cue-${n}`,
        t,
        assetId: asset.id,
        volumeDb: Math.min(-12, zone?.maxVolumeDb ?? 0),
        label: asset.name.replace(/\.[^.]+$/, ''),
      })
      cues.sort((a, b) => a.t - b.t)
      index = cues.findIndex((c) => c.id === `cue-${n}`)
    })
    setSelection({ row, index })
  }

  // Keyboard: space, delete, nudge.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.getAttribute('role') === 'slider')
      )
        return
      if (e.code === 'Space') {
        e.preventDefault()
        playback.toggle()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.index != null) {
        e.preventDefault()
        const { row, index } = selection
        editTracks((tr) => void draftKeys(tr as Tracks, row).splice(index, 1))
        setSelection({ row, index: null })
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        playback.seek(playback.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1000 : 100))
      } else if (e.key === 'Home') {
        playback.seek(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playback, selection, editTracks])

  if (!environment) {
    return (
      <div className="flex h-full flex-col">
        <EditorToolbar editor={editor} issues={issues} title={draft.name} requiresReview />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{loading ? 'Loading environment…' : 'Environment unavailable'}</EmptyTitle>
            <EmptyDescription>
              {error
                ? `${draft.environment.id}@${draft.environment.revision}: ${error.message}`
                : 'Fetching the pinned environment revision.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const behavior = target.kind === 'behavior' ? draft.behaviors.find((b) => b.id === target.id) : undefined
  const stageSelected: StageSelection = focusDevice
    ? { kind: 'placement', id: focusDevice }
    : selection?.row.kind === 'motion'
      ? { kind: 'placement', id: selection.row.deviceId }
      : selection?.row.kind === 'light'
        ? { kind: 'light', id: selection.row.deviceId }
        : selection?.row.kind === 'audio'
          ? { kind: 'audio', id: selection.row.deviceId }
          : null
  const highlightNode =
    selection?.row.kind === 'motion'
      ? (() => {
          const row = selection.row
          const p = environment.placements.find((x) => x.deviceId === row.deviceId)
          const c = p && characters.get(`${p.character.id}@${p.character.revision}`)
          const node = c?.joints.find((j) => j.name === row.joint)?.node
          return node ? { deviceId: row.deviceId, node } : null
        })()
      : null

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        editor={editor}
        issues={issues}
        title={draft.name}
        subtitle={`Show · ${environment.name} r${draft.environment.revision} · ${formatMs(draft.durationMs, false)} · ${draft.behaviors.length} sensor responses`}
        requiresReview
      />
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="56%" minSize="20%">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="72%" minSize="30%">
              <Viewport
                {...framing(environment.stage.min, environment.stage.max, 0.72)}
                shadowScale={Math.max(10, (environment.stage.max[0] - environment.stage.min[0]) * 1.6)}
                overlay={
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Glass className="px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{environment.name}</span>{' '}
                        <span className="font-mono text-[11px] text-muted-foreground/70">r{draft.environment.revision}</span>
                      </Glass>
                      {activeBehaviors.map((b) => (
                        <Glass key={b} className="flex items-center gap-1.5 border-primary/40 px-3 py-1.5 text-xs text-primary">
                          <Radar className="size-3.5 animate-pulse" /> {draft.behaviors.find((x) => x.id === b)?.name ?? b}
                        </Glass>
                      ))}
                      {behavior && (
                        <Glass className="px-3 py-1.5 text-xs text-motion">Clip preview · {behavior.name}</Glass>
                      )}
                    </div>
                    {target.kind === 'main' && environment.sensors.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="border-sensor/40 bg-[#0b111d]/80 text-sensor backdrop-blur hover:bg-sensor/15 hover:text-sensor" data-testid="simulate-sensor">
                            <Radar /> Simulate guest
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Fire a sensor at the playhead</DropdownMenuLabel>
                          {environment.sensors.flatMap((s) =>
                            SENSOR_EVENTS[s.type].map((ev) => (
                              <DropdownMenuItem
                                key={`${s.deviceId}-${ev}`}
                                onSelect={() => {
                                  const started = playback.trigger(s.deviceId, ev)
                                  if (!started.length)
                                    toast.info(`${s.name}: ${ev}`, {
                                      description: 'No response eligible (window, cooldown or busy).',
                                    })
                                  playback.play()
                                }}
                              >
                                {s.name} · {ev}
                              </DropdownMenuItem>
                            )),
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                }
              >
                <StageScene
                  env={environment}
                  characters={characters}
                  frame={() => playback.frame()}
                  selected={stageSelected}
                  activeSensors={new Set(activeSensors)}
                  highlightNode={highlightNode}
                  onSelect={(s) => {
                    if (s?.kind === 'placement') {
                      setFocusDevice(s.id)
                      setSelection(null)
                    } else if (s?.kind === 'light' || s?.kind === 'audio') {
                      setFocusDevice(null)
                      setSelection({ row: { kind: s.kind, deviceId: s.id }, index: null })
                    } else if (s?.kind === 'sensor') {
                      const sensor = environment.sensors.find((x) => x.deviceId === s.id)
                      const ev = sensor && SENSOR_EVENTS[sensor.type][0]
                      if (sensor && ev && target.kind === 'main') {
                        playback.trigger(sensor.deviceId, ev)
                        playback.play()
                      }
                    } else {
                      setFocusDevice(null)
                    }
                  }}
                />
              </Viewport>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="28%" minSize="18%">
              {current && (
                <Inspector
                  tracks={current.tracks}
                  durationMs={current.durationMs}
                  environment={environment}
                  characters={characters}
                  playback={playback}
                  selection={selection && keysOf(current.tracks, selection.row) ? selection : null}
                  onSelect={(s) => {
                    setSelection(s)
                    if (s) setFocusDevice(null)
                  }}
                  edit={editTracks}
                  audioAssets={audioAssets}
                  focusDevice={focusDevice}
                  onFocus={(d) => {
                    setFocusDevice(d)
                    setSelection(null)
                  }}
                  palette={environment.palette}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="44%" minSize="15%">
          <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
            <div className="flex h-11 shrink-0 items-center border-b bg-surface/60 pl-2">
              <TabsList variant="line" className="h-11">
                <TabsTrigger value="timeline">
                  <ListTree /> Timeline
                </TabsTrigger>
                <TabsTrigger value="behaviors" data-testid="tab-behaviors">
                  <Radar /> Sensor responses ({draft.behaviors.length})
                </TabsTrigger>
                <TabsTrigger value="issues" data-testid="tab-issues">
                  <AlertTriangle /> Issues ({issues.length})
                </TabsTrigger>
                <TabsTrigger value="revisions" data-testid="tab-revisions">
                  <History /> Revisions
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings2 /> Settings
                </TabsTrigger>
              </TabsList>
              <Transport playback={playback} zoom={zoom} setZoom={setZoom} />
            </div>
            {behavior && (tab === 'timeline' || tab === 'behaviors') && (
              <div className="flex items-center gap-2 border-b bg-primary/10 px-3 py-1.5 text-xs">
                <Radar className="size-3.5 text-primary" />
                Editing response clip <strong>{behavior.name}</strong> ({formatMs(behavior.durationMs)}). The preview
                plays the clip by itself; blends are added at runtime.
                <Button size="xs" variant="outline" className="ml-auto" onClick={() => setTarget({ kind: 'main' })}>
                  <ArrowLeft /> Main timeline
                </Button>
              </div>
            )}
            <TabsContent value="timeline" className="min-h-0 flex-1">
              {current && (
                <Timeline
                  tracks={current.tracks}
                  durationMs={current.durationMs}
                  environment={environment}
                  characters={characters}
                  playback={playback}
                  selection={selection}
                  onSelect={(s) => {
                    setSelection(s)
                    if (s) setFocusDevice(null)
                  }}
                  edit={editTracks}
                  issueKeys={issueKeys}
                  audioDurations={audioDurations}
                  onAddAudioCue={addAudioCue}
                  pxPerSecond={zoom}
                  {...(target.kind === 'main' ? { behaviors: draft.behaviors } : {})}
                />
              )}
            </TabsContent>
            <TabsContent value="behaviors" className="min-h-0 flex-1">
              <BehaviorsPanel
                show={draft}
                environment={environment}
                update={update}
                target={target}
                setTarget={(t) => {
                  setTarget(t)
                  setSelection(null)
                  playback.seek(0)
                  if (t.kind === 'behavior') setTab('timeline')
                }}
                playback={playback}
                activeBehaviors={activeBehaviors}
              />
            </TabsContent>
            <TabsContent value="issues" className="min-h-0 flex-1">
              <IssuesList
                issues={issues}
                onSelect={(i) => {
                  const t: Target = i.behaviorId ? { kind: 'behavior', id: i.behaviorId } : { kind: 'main' }
                  setTarget(t)
                  if (i.deviceId) {
                    const row = i.joint
                      ? { kind: 'motion' as const, deviceId: i.deviceId, joint: i.joint }
                      : environment.lights.some((l) => l.deviceId === i.deviceId)
                        ? { kind: 'light' as const, deviceId: i.deviceId }
                        : { kind: 'audio' as const, deviceId: i.deviceId }
                    setSelection({ row, index: i.index ?? null })
                  }
                  if (i.t !== undefined) setTimeout(() => playback.seek(i.t ?? 0), 0)
                  setTab('timeline')
                }}
              />
            </TabsContent>
            <TabsContent value="revisions" className="min-h-0 flex-1 overflow-auto">
              <RevisionsPanel docId={id} kind="show" />
            </TabsContent>
            <TabsContent value="settings" className="min-h-0 flex-1">
              <SettingsPanel show={draft} update={update} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
