import { validateCharacter } from '@studio/playback'
import type { Joint } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FileUp, Gauge, Pause, Play, Plus, Ruler, Trash, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EditorToolbar } from '@/components/editor-toolbar'
import { NumberInput, Row, Vec3Input } from '@/components/fields'
import { IssuesList } from '@/components/issues-list'
import { RevisionsPanel } from '@/components/revisions-panel'
import { CharacterModel, type Pose } from '@/components/three/character-model'
import { framing, Glass, Viewport } from '@/components/three/viewport'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { parseDefinitionFile, useGlbInfo } from '@/features/characters/import'
import { api, problemMessage } from '@/lib/api'
import { useDocEditor } from '@/lib/doc-editor'
import { formatBytes } from '@/lib/format'
import { assetsQuery, docQuery } from '@/lib/queries'

export const Route = createFileRoute('/characters/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(docQuery(params.id)),
  component: CharacterEditor,
})

const unit = (j: Pick<Joint, 'type'>) => (j.type === 'revolute' ? '°' : 'm')

function CharacterEditor() {
  const { id } = Route.useParams()
  const editor = useDocEditor(id, 'character')
  const { draft, update } = editor
  const glb = useGlbInfo(draft.model?.assetId)
  const { data: assets = [] } = useQuery(assetsQuery)
  const [selected, setSelected] = useState<string | null>(draft.joints[0]?.name ?? null)
  const [tab, setTab] = useState('joints')
  const [sweeping, setSweeping] = useState(false)
  const pose = useRef<Pose>({})
  const [testValue, setTestValue] = useState<number | null>(null)

  const issues = useMemo(
    () => validateCharacter(draft, glb.data ? { modelNodes: glb.data.nodes } : {}),
    [draft, glb.data],
  )
  const index = draft.joints.findIndex((j) => j.name === selected)
  const joint = index >= 0 ? draft.joints[index] : undefined

  // Sweep the selected joint between its limits at its real maximum speed.
  useEffect(() => {
    if (!sweeping || !joint) return
    let raf = 0
    const start = performance.now()
    const range = joint.max - joint.min
    const period = (2 * range) / joint.maxVelocity
    const step = () => {
      const phase = (((performance.now() - start) / 1000) % period) / period
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2
      pose.current = { ...pose.current, [joint.name]: joint.min + range * tri }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [sweeping, joint])

  const setJoint = (patch: Partial<Joint>, key: string) =>
    update((d) => {
      const j = d.joints[index]
      if (j) Object.assign(j, patch)
    }, `${index}:${key}`)

  const addJoint = () => {
    const used = new Set(draft.joints.map((j) => j.name))
    let n = draft.joints.length + 1
    while (used.has(`joint_${n}`)) n++
    const name = `joint_${n}`
    const node = glb.data?.nodes.find((x) => !draft.joints.some((j) => j.node === x)) ?? glb.data?.nodes[0] ?? 'root'
    update((d) => {
      d.joints.push({ name, node, type: 'revolute', axis: [0, 1, 0], min: -45, max: 45, home: 0, maxVelocity: 60 })
    })
    setSelected(name)
  }

  const importDefinition = async (file: File) => {
    try {
      const parsed = parseDefinitionFile(await file.text(), file.name)
      update((d) => {
        d.joints = parsed.joints
      })
      setSelected(parsed.joints[0]?.name ?? null)
      toast.success(`Imported ${parsed.joints.length} joints from ${file.name}`)
    } catch (err) {
      toast.error('Import failed', { description: problemMessage(err).title })
    }
  }

  const uploadModel = async (file: File) => {
    try {
      const form = new FormData()
      form.append('file', file)
      const asset = await api('uploadAsset', { body: form })
      update((d) => {
        d.model = { assetId: asset.id }
      })
      toast.success('Model uploaded')
    } catch (err) {
      toast.error('Upload failed', { description: problemMessage(err).detail })
    }
  }

  const modelAsset = assets.find((a) => a.id === draft.model?.assetId)

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        editor={editor}
        issues={issues}
        title={draft.name}
        subtitle={`Character · ${draft.joints.length} joints · ${id}`}
      />
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="58%" minSize="25%">
          <Viewport
            {...(() => {
              const [sx, sy, sz] = draft.footprint.size
              return framing([-sx / 2, 0, -sz / 2], [sx / 2, sy, sz / 2], 1.45)
            })()}
            shadowScale={Math.max(4, draft.footprint.size[0] * 2.5)}
            overlay={
              <>
                <Glass className="absolute top-3 left-3 px-3 py-2 text-xs">
                  <div className="font-medium">{draft.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {draft.joints.length} joints · {draft.footprint.size.map((n) => n.toFixed(1)).join(' × ')} m
                  </div>
                </Glass>
                {joint && (
                  <Glass className="absolute bottom-4 left-1/2 w-[min(440px,90%)] -translate-x-1/2 space-y-2.5 p-3.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-eyebrow">Joint tester</span>
                      <span className="font-mono text-sm text-motion tabular">
                        {(testValue ?? joint.home).toFixed(1)}
                        {unit(joint)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-24 truncate font-mono text-xs">{joint.name}</span>
                      <Slider
                        className="flex-1"
                        min={joint.min}
                        max={joint.max}
                        step={(joint.max - joint.min) / 200}
                        value={[testValue ?? joint.home]}
                        onValueChange={([v = joint.home]) => {
                          setSweeping(false)
                          setTestValue(v)
                          pose.current = { ...pose.current, [joint.name]: v }
                        }}
                      />
                      <Button size="xs" variant={sweeping ? 'default' : 'outline'} onClick={() => setSweeping((s) => !s)}>
                        {sweeping ? <Pause /> : <Play />} {sweeping ? 'Stop' : 'Sweep'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Sweep moves between the limits at the joint's maximum speed ({joint.maxVelocity}
                      {unit(joint)}/s): {((2 * (joint.max - joint.min)) / joint.maxVelocity).toFixed(1)} s per cycle.
                    </p>
                  </Glass>
                )}
              </>
            }
          >
            <CharacterModel character={draft} pose={() => pose.current} highlightNode={joint?.node ?? null} />
          </Viewport>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="42%" minSize="25%">
          <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
            <div className="border-b px-3">
              <TabsList variant="line" className="h-11">
                <TabsTrigger value="joints">Joints ({draft.joints.length})</TabsTrigger>
                <TabsTrigger value="model">Model</TabsTrigger>
                <TabsTrigger value="issues">Issues ({issues.length})</TabsTrigger>
                <TabsTrigger value="revisions">Revisions</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="joints" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={addJoint} data-testid="add-joint">
                      <Plus /> Add joint
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <label>
                        <FileUp /> Import URDF / JSON
                        <input
                          type="file"
                          accept=".urdf,.xml,.json"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void importDefinition(f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-lg border" data-testid="joint-list">
                    {draft.joints.length === 0 && (
                      <p className="p-4 text-sm text-muted-foreground">No joints. Import a definition or add one.</p>
                    )}
                    {draft.joints.map((j) => (
                      <button
                        type="button"
                        key={j.name}
                        onClick={() => {
                          setSelected(j.name)
                          setTestValue(null)
                          setSweeping(false)
                        }}
                        className={cn(
                          'grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 border-b px-3 py-2.5 text-left transition last:border-b-0 hover:bg-surface-2',
                          j.name === selected && 'bg-primary/[0.07] shadow-[inset_2px_0_0_0_var(--primary)]',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs">{j.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {j.node} · {j.type}
                          </span>
                        </span>
                        <RangeBar
                          min={j.min}
                          max={j.max}
                          home={j.home}
                          value={j.name === selected ? (testValue ?? undefined) : undefined}
                          unit={unit(j)}
                        />
                        <span className="text-right font-mono text-[11px] text-muted-foreground">
                          {j.maxVelocity}
                          {unit(j)}/s
                        </span>
                      </button>
                    ))}
                  </div>
                  {joint && (
                    <div className="space-y-4 rounded-lg border bg-surface/60 p-4" data-testid="joint-form">
                      <div className="flex items-center justify-between">
                        <span className="text-eyebrow">Joint</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Gauge className="size-3" /> full sweep {((2 * (joint.max - joint.min)) / joint.maxVelocity).toFixed(1)} s
                        </span>
                      </div>
                      <Row label="Name">
                        <Input
                          className="h-7 font-mono text-xs"
                          value={joint.name}
                          onChange={(e) => {
                            const name = e.target.value
                            setJoint({ name }, 'name')
                            setSelected(name)
                          }}
                        />
                      </Row>
                      <Row
                        label="Model node"
                        hint={glb.data && !glb.data.nodes.includes(joint.node) ? 'Not found in the model' : undefined}
                      >
                        {glb.data ? (
                          <Select value={joint.node} onValueChange={(node) => setJoint({ node }, 'node')}>
                            <SelectTrigger size="sm" className="w-full font-mono text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[...new Set([joint.node, ...glb.data.nodes])].map((n) => (
                                <SelectItem key={n} value={n} className="font-mono text-xs">
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className="h-7 font-mono text-xs"
                            value={joint.node}
                            onChange={(e) => setJoint({ node: e.target.value }, 'node')}
                          />
                        )}
                      </Row>
                      <Row label="Type">
                        <Select
                          value={joint.type}
                          onValueChange={(type) => setJoint({ type: type as Joint['type'] }, 'type')}
                        >
                          <SelectTrigger size="sm" className="w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="revolute">Revolute (degrees)</SelectItem>
                            <SelectItem value="prismatic">Prismatic (meters)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Row>
                      <Row label="Axis (local)">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            <Vec3Input value={joint.axis} onChange={(axis) => setJoint({ axis }, 'axis')} />
                          </div>
                          <ToggleGroup
                            type="single"
                            size="sm"
                            variant="outline"
                            value={['1,0,0', '0,1,0', '0,0,1'].includes(joint.axis.join(',')) ? joint.axis.join(',') : ''}
                            onValueChange={(v) => v && setJoint({ axis: v.split(',').map(Number) as Joint['axis'] }, 'axis')}
                          >
                            <ToggleGroupItem value="1,0,0" className="h-7 px-2 font-mono text-[11px]">
                              X
                            </ToggleGroupItem>
                            <ToggleGroupItem value="0,1,0" className="h-7 px-2 font-mono text-[11px]">
                              Y
                            </ToggleGroupItem>
                            <ToggleGroupItem value="0,0,1" className="h-7 px-2 font-mono text-[11px]">
                              Z
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                      </Row>
                      <div className="text-eyebrow pt-1">Limits</div>
                      <RangeBar min={joint.min} max={joint.max} home={joint.home} unit={unit(joint)} large />
                      <Row label={`Min / max (${unit(joint)})`}>
                        <div className="grid grid-cols-2 gap-1">
                          <NumberInput
                            aria-label="min"
                            value={joint.min}
                            onChange={(min) => setJoint({ min }, 'min')}
                          />
                          <NumberInput
                            aria-label="max"
                            value={joint.max}
                            onChange={(max) => setJoint({ max }, 'max')}
                          />
                        </div>
                      </Row>
                      <Row label={`Home (${unit(joint)})`}>
                        <NumberInput
                          aria-label="home"
                          value={joint.home}
                          onChange={(home) => setJoint({ home }, 'home')}
                        />
                      </Row>
                      <Row label={`Max speed (${unit(joint)}/s)`}>
                        <NumberInput
                          aria-label="max velocity"
                          value={joint.maxVelocity}
                          min={0.001}
                          onChange={(maxVelocity) => setJoint({ maxVelocity }, 'maxVelocity')}
                        />
                      </Row>
                      <div className="flex justify-end">
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-danger hover:text-danger"
                          onClick={() => {
                            update((d) => {
                              d.joints.splice(index, 1)
                            })
                            setSelected(draft.joints[index + 1]?.name ?? draft.joints[index - 1]?.name ?? null)
                          }}
                        >
                          <Trash /> Delete joint
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="model" className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <Row label="Name">
                    <Input
                      className="h-7 text-xs"
                      value={draft.name}
                      onChange={(e) =>
                        update((d) => {
                          d.name = e.target.value
                        }, 'name')
                      }
                    />
                  </Row>
                  <Row label="Description">
                    <Textarea
                      className="text-xs"
                      value={draft.description}
                      onChange={(e) =>
                        update((d) => {
                          d.description = e.target.value
                        }, 'description')
                      }
                    />
                  </Row>
                  <Row label="3D model">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {modelAsset
                          ? `${modelAsset.name} · ${formatBytes(modelAsset.size)}`
                          : draft.model
                            ? 'Loading…'
                            : 'None'}
                      </span>
                      <Button size="xs" variant="outline" asChild>
                        <label>
                          <Upload /> {draft.model ? 'Replace' : 'Upload'} GLB
                          <input
                            type="file"
                            accept=".glb"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void uploadModel(f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </Button>
                    </div>
                  </Row>
                  <Row
                    label="Footprint (m)"
                    hint="Bounding box of the full range of motion; checked against stage boundaries."
                  >
                    <div className="space-y-1">
                      <Vec3Input
                        value={draft.footprint.size}
                        onChange={(size) =>
                          update((d) => {
                            d.footprint.size = size
                          }, 'footprint')
                        }
                      />
                      {glb.data && (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            update((d) => {
                              d.footprint.size = glb.data.size
                            })
                          }
                        >
                          <Ruler /> Fit to model ({glb.data.size.join(' × ')})
                        </Button>
                      )}
                    </div>
                  </Row>
                  {glb.data && (
                    <Row label="Model nodes">
                      <div className="flex flex-wrap gap-1">
                        {glb.data.nodes.map((n) => {
                          const mapped = draft.joints.some((j) => j.node === n)
                          return (
                            <span
                              key={n}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${mapped ? 'border-sensor/40 text-sensor' : 'text-muted-foreground'}`}
                            >
                              {n}
                            </span>
                          )
                        })}
                      </div>
                    </Row>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="issues" className="min-h-0 flex-1">
              <IssuesList
                issues={issues}
                onSelect={(i) => {
                  if (i.joint) {
                    setSelected(i.joint)
                    setTab('joints')
                  }
                }}
              />
            </TabsContent>
            <TabsContent value="revisions" className="min-h-0 flex-1 overflow-auto">
              <RevisionsPanel docId={id} kind="character" />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

/** Range of motion at a glance: limits, home position and (optionally) the live value. */
function RangeBar({
  min,
  max,
  home,
  value,
  unit: u,
  large = false,
}: {
  min: number
  max: number
  home: number
  value?: number
  unit: string
  large?: boolean
}) {
  const span = max - min || 1
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / span) * 100))}%`
  return (
    <div className="min-w-0">
      <div className={cn('relative rounded-full bg-motion/15', large ? 'h-2' : 'h-1.5')}>
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-motion/25 via-motion/50 to-motion/25" />
        {min < 0 && max > 0 && <div className="absolute inset-y-[-3px] w-px bg-foreground/30" style={{ left: pct(0) }} />}
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-background bg-foreground"
          style={{ left: pct(home) }}
          title={`home ${home}${u}`}
        />
        {value !== undefined && (
          <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: pct(value) }} />
        )}
      </div>
      <div className={cn('mt-1 flex justify-between font-mono text-muted-foreground', large ? 'text-[11px]' : 'text-[10px]')}>
        <span>
          {min}
          {u}
        </span>
        {large && (
          <span className="text-foreground/70">
            home {home}
            {u}
          </span>
        )}
        <span>
          {max}
          {u}
        </span>
      </div>
    </div>
  )
}
