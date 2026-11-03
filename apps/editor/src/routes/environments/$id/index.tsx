import { validateEnvironment } from '@studio/playback'
import {
  type DeviceKind,
  type DocRef,
  type EnvironmentDefinition,
  environmentDevices,
  type SensorType,
} from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Draft } from 'immer'
import { Crosshair, Fence, Magnet, Move3d, Plus, Rotate3d, Scaling, Trash } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { EditableContext, EditButton } from '@/components/editable'
import { EditorToolbar } from '@/components/editor-toolbar'
import { ColorInput, NumberInput, Row, Vec3Input } from '@/components/fields'
import { IssuesList } from '@/components/issues-list'
import { KIND } from '@/components/kind'
import { RevisionsPanel } from '@/components/revisions-panel'
import { type GizmoMode, type StageChange, StageScene, type StageSelection } from '@/components/three/stage-scene'
import { framing, Glass, Viewport } from '@/components/three/viewport'
import { Input } from '@/components/ui/input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDocEditor } from '@/lib/doc-editor'
import { assetsQuery, docQuery, docsQuery, revisionsQuery, useCharacters } from '@/lib/queries'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/environments/$id/')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(docQuery(params.id)),
  component: EnvironmentEditor,
})

type Env = EnvironmentDefinition
type ListKey = 'placements' | 'lights' | 'audio' | 'sensors'
const TAB_FOR: Record<NonNullable<StageSelection>['kind'], string> = {
  placement: 'figures',
  light: 'lighting',
  audio: 'audio',
  scenery: 'scenery',
  sensor: 'sensors',
  keepOut: 'stage',
}

function uniqueId(env: Env, base: string): string {
  const used = new Set(environmentDevices(env).map((d) => d.deviceId))
  for (let i = 1; ; i++) {
    const id = `${base}-${String(i).padStart(2, '0')}`
    if (!used.has(id)) return id
  }
}

function ItemCard({
  selected,
  onSelect,
  onDelete,
  title,
  kind,
  children,
}: {
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  title: ReactNode
  kind?: DeviceKind
  children: ReactNode
}) {
  const k = kind ? KIND[kind] : null
  return (
    // biome-ignore lint/a11y/useSemanticElements: card contains interactive inputs
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={() => {}}
      className={cn(
        'space-y-2.5 rounded-xl border bg-card p-3.5 transition-colors hover:border-foreground/15',
        selected && 'border-primary/60 bg-primary/[0.04] hover:border-primary/60',
      )}
    >
      <div className="flex items-center gap-2.5">
        {k ? (
          <span className={cn('flex size-7 items-center justify-center rounded-md border', k.soft)}>
            <k.icon className={cn('size-3.5', k.text)} />
          </span>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-md border border-warn/25 bg-warn/10">
            <Fence className="size-3.5 text-warn" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">{title}</span>
        <EditButton
          size="icon-xs"
          variant="ghost"
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash />
        </EditButton>
      </div>
      {children}
    </div>
  )
}

function CharacterRefPicker({ value, onChange }: { value: DocRef; onChange: (ref: DocRef) => void }) {
  const { data: characters = [] } = useQuery(docsQuery('character'))
  const { data: revisions = [] } = useQuery({ ...revisionsQuery(value.id), enabled: !!value.id })
  return (
    <div className="grid grid-cols-[1fr_80px] gap-1">
      <Select
        value={value.id}
        onValueChange={(id) => {
          const c = characters.find((x) => x.id === id)
          if (c?.latestRevision) onChange({ id, revision: c.latestRevision })
        }}
      >
        <SelectTrigger size="sm" className="w-full text-xs">
          <SelectValue placeholder="Character" />
        </SelectTrigger>
        <SelectContent>
          {characters
            .filter((c) => c.latestRevision)
            .map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Select value={String(value.revision)} onValueChange={(r) => onChange({ id: value.id, revision: Number(r) })}>
        <SelectTrigger size="sm" className="w-full font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...new Set([value.revision, ...revisions.map((r) => r.revision)])].map((r) => (
            <SelectItem key={r} value={String(r)} className="font-mono">
              r{r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** The environment's layout: stage, keep-out zones and every installed device, edited with gizmos. */
function EnvironmentEditor() {
  const { id } = Route.useParams()
  const editor = useDocEditor(id, 'environment')
  const { draft, update } = editor
  const { data: characterDocs = [] } = useQuery(docsQuery('character'))
  const { characters } = useCharacters(draft.placements.map((p) => p.character))
  const [selected, setSelected] = useState<StageSelection>(null)
  const [tab, setTab] = useState('figures')
  const [footprints, setFootprints] = useState(false)
  const canEdit = editor.canEdit
  const { data: assetList = [] } = useQuery(assetsQuery)
  const modelAssets = assetList.filter((a) => a.kind === 'model')
  const issues = useMemo(() => validateEnvironment(draft, { characters }), [draft, characters])

  const edit = (recipe: (d: Draft<Env>) => void, key?: string) => update(recipe, key)
  const [gizmo, setGizmo] = useState<{ mode: GizmoMode; snap: boolean; aim: boolean }>({
    mode: 'translate',
    snap: true,
    aim: false,
  })
  const drag = useRef(0)
  const applyChange = (c: StageChange, final: boolean) => {
    edit((d) => {
      if (c.kind === 'placement') {
        const p = d.placements.find((x) => x.deviceId === c.id)
        if (p && c.position) p.position = c.position
        if (p && c.rotationY !== undefined) p.rotationY = c.rotationY
      } else if (c.kind === 'light') {
        const l = d.lights.find((x) => x.deviceId === c.id)
        if (l && c.position) l.position = c.position
        if (l && c.target) l.target = c.target
      } else if (c.kind === 'audio') {
        const a = d.audio.find((x) => x.deviceId === c.id)
        if (a) a.position = c.position
      } else if (c.kind === 'sensor') {
        const x = d.sensors.find((s) => s.deviceId === c.id)
        if (x && c.position) x.position = c.position
        if (x && c.range !== undefined) x.range = c.range
      } else if (c.kind === 'scenery') {
        const item = d.scenery.find((x) => x.id === c.id)
        if (item && c.position) item.position = c.position
        if (item && c.rotationY !== undefined) item.rotationY = c.rotationY
        if (item && c.scale !== undefined) item.scale = c.scale
      } else {
        const z = d.keepOut.find((k) => k.name === c.id)
        if (z) z.box = c.box
      }
    }, `gizmo:${c.kind}:${c.id}:${drag.current}`)
    if (final) drag.current++
  }
  // W / E / R like every DCC tool; Esc deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const mode = ({ w: 'translate', e: 'rotate', r: 'scale' } as const)[e.key.toLowerCase() as 'w' | 'e' | 'r']
      if (mode && !e.metaKey && !e.ctrlKey) setGizmo((g) => ({ ...g, mode }))
      else if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const remove = (list: ListKey, i: number) =>
    edit((d) => {
      d[list].splice(i, 1)
    })
  const select = (s: StageSelection) => {
    setSelected(s)
    if (s) setTab(TAB_FOR[s.kind])
  }
  const isSel = (kind: NonNullable<StageSelection>['kind'], itemId: string) =>
    selected?.kind === kind && selected.id === itemId

  const firstCharacter = characterDocs.find((c) => c.latestRevision)

  return (
    <EditableContext.Provider value={editor.canEdit}>
      <div className="flex min-h-0 flex-1 flex-col">
        <EditorToolbar
          editor={editor}
          issues={issues}
          embedded
          subtitle={`Layout · ${environmentDevices(draft).length} devices · ${id}`}
        >
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={footprints} onCheckedChange={setFootprints} size="sm" disabled={false} /> Footprints
          </label>
        </EditorToolbar>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="60%" minSize="25%">
            <Viewport
              {...framing(draft.stage.min, draft.stage.max, 0.78)}
              shadowScale={Math.max(10, (draft.stage.max[0] - draft.stage.min[0]) * 1.6)}
              overlay={
                canEdit && (
                  <Glass className="absolute top-3 left-3 flex items-center gap-1 p-1">
                    <ToggleGroup
                      type="single"
                      size="sm"
                      value={gizmo.mode}
                      onValueChange={(v) => v && setGizmo((g) => ({ ...g, mode: v as GizmoMode }))}
                    >
                      <ToggleGroupItem value="translate" aria-label="Move (W)" title="Move (W)">
                        <Move3d />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="rotate" aria-label="Rotate (E)" title="Rotate figures (E)">
                        <Rotate3d />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="scale" aria-label="Resize (R)" title="Resize zones and sensor range (R)">
                        <Scaling />
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <span className="mx-1 h-5 w-px bg-white/10" />
                    <Toggle
                      size="sm"
                      pressed={gizmo.snap}
                      onPressedChange={(snap) => setGizmo((g) => ({ ...g, snap }))}
                      title="Snap to 10 cm / 7.5°"
                    >
                      <Magnet />
                    </Toggle>
                    {selected?.kind === 'light' && (
                      <Toggle
                        size="sm"
                        pressed={gizmo.aim}
                        onPressedChange={(aim) => setGizmo((g) => ({ ...g, aim }))}
                        title="Drag the aim point instead of the fixture"
                      >
                        <Crosshair /> <span className="text-xs">Aim</span>
                      </Toggle>
                    )}
                    <span className="px-2 text-[11px] text-muted-foreground">
                      {selected ? `${selected.id} · drag the gizmo` : 'Click an object to edit it'}
                    </span>
                  </Glass>
                )
              }
            >
              <StageScene
                env={draft}
                characters={characters}
                selected={selected}
                onSelect={select}
                showFootprints={footprints}
                {...(canEdit ? { editing: { ...gizmo, onChange: applyChange } } : {})}
              />
            </Viewport>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="40%" minSize="25%">
            <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
              <div className="overflow-x-auto border-b px-3">
                <TabsList variant="line" className="h-11 flex-nowrap">
                  <TabsTrigger value="stage">Stage</TabsTrigger>
                  <TabsTrigger value="figures">Figures ({draft.placements.length})</TabsTrigger>
                  <TabsTrigger value="lighting">Lighting ({draft.lights.length})</TabsTrigger>
                  <TabsTrigger value="audio">Audio ({draft.audio.length})</TabsTrigger>
                  <TabsTrigger value="sensors">Sensors ({draft.sensors.length})</TabsTrigger>
                  <TabsTrigger value="scenery">Scenery ({(draft.scenery ?? []).length})</TabsTrigger>
                  <TabsTrigger value="issues">Issues ({issues.length})</TabsTrigger>
                  <TabsTrigger value="revisions">Revisions</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="stage" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <Row label="Name">
                      <Input
                        className="h-7 text-xs"
                        value={draft.name}
                        onChange={(e) =>
                          edit((d) => {
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
                          edit((d) => {
                            d.description = e.target.value
                          }, 'desc')
                        }
                      />
                    </Row>
                    <Row label="Stage min (m)" hint="Show boundary. Figure footprints must stay inside.">
                      <Vec3Input
                        value={draft.stage.min}
                        onChange={(v) =>
                          edit((d) => {
                            d.stage.min = v
                          }, 'stage.min')
                        }
                      />
                    </Row>
                    <Row label="Stage max (m)">
                      <Vec3Input
                        value={draft.stage.max}
                        onChange={(v) =>
                          edit((d) => {
                            d.stage.max = v
                          }, 'stage.max')
                        }
                      />
                    </Row>
                    <Row label="Ambient">
                      <div className="flex items-center gap-3">
                        <ColorInput
                          value={draft.ambient.color}
                          onChange={(c) =>
                            edit((d) => {
                              d.ambient.color = c
                            }, 'ambient.c')
                          }
                        />
                        <NumberInput
                          aria-label="ambient intensity"
                          className="w-20"
                          min={0}
                          max={1}
                          step={0.05}
                          value={draft.ambient.intensity}
                          onChange={(v) =>
                            edit((d) => {
                              d.ambient.intensity = Math.min(1, Math.max(0, v))
                            }, 'ambient.i')
                          }
                        />
                      </div>
                    </Row>
                    <div className="flex items-center justify-between pt-2">
                      <h3 className="text-xs font-medium">Keep-out zones</h3>
                      <EditButton
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          edit((d) => {
                            d.keepOut.push({
                              name: `zone-${d.keepOut.length + 1}`,
                              box: { min: [-5, 0, 4], max: [5, 2.5, 6] },
                            })
                          })
                        }
                      >
                        <Plus /> Zone
                      </EditButton>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Guest walkways and queue lines. No figure's range of motion may reach them.
                    </p>
                    {draft.keepOut.map((z, i) => (
                      <ItemCard
                        key={`zone-${i}`}
                        title={z.name}
                        selected={isSel('keepOut', z.name)}
                        onSelect={() => setSelected({ kind: 'keepOut', id: z.name })}
                        onDelete={() => edit((d) => void d.keepOut.splice(i, 1))}
                      >
                        <Row label="Name">
                          <Input
                            className="h-7 text-xs"
                            value={z.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.keepOut[i] as (typeof d.keepOut)[number]).name = e.target.value
                              }, `ko${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Min">
                          <Vec3Input
                            value={z.box.min}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.keepOut[i] as (typeof d.keepOut)[number]).box.min = v
                              }, `ko${i}a`)
                            }
                          />
                        </Row>
                        <Row label="Max">
                          <Vec3Input
                            value={z.box.max}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.keepOut[i] as (typeof d.keepOut)[number]).box.max = v
                              }, `ko${i}b`)
                            }
                          />
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="figures" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        Each figure pins a published character revision.
                      </p>
                      <EditButton
                        size="xs"
                        variant="outline"
                        disabled={!firstCharacter}
                        data-testid="add-figure"
                        onClick={() =>
                          firstCharacter?.latestRevision &&
                          edit((d) => {
                            const deviceId = uniqueId(d as Env, firstCharacter.id)
                            d.placements.push({
                              deviceId,
                              name: firstCharacter.name,
                              character: { id: firstCharacter.id, revision: firstCharacter.latestRevision ?? 1 },
                              position: [0, 0, 0],
                              rotationY: 0,
                            })
                            setSelected({ kind: 'placement', id: deviceId })
                          })
                        }
                      >
                        <Plus /> Figure
                      </EditButton>
                    </div>
                    {!firstCharacter && (
                      <p className="text-xs text-warn">
                        Publish a{' '}
                        <Link to="/characters" className="underline">
                          character
                        </Link>{' '}
                        first.
                      </p>
                    )}
                    {draft.placements.map((p, i) => (
                      <ItemCard
                        key={`p-${i}`}
                        title={p.deviceId}
                        kind="doll"
                        selected={isSel('placement', p.deviceId)}
                        onSelect={() => setSelected({ kind: 'placement', id: p.deviceId })}
                        onDelete={() => remove('placements', i)}
                      >
                        <Row label="Device id">
                          <Input
                            className="h-7 font-mono text-xs"
                            value={p.deviceId}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.placements[i] as Env['placements'][number]).deviceId = e.target.value
                              }, `p${i}id`)
                            }
                          />
                        </Row>
                        <Row label="Label">
                          <Input
                            className="h-7 text-xs"
                            value={p.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.placements[i] as Env['placements'][number]).name = e.target.value
                              }, `p${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Character">
                          <CharacterRefPicker
                            value={p.character}
                            onChange={(ref) =>
                              edit((d) => {
                                ;(d.placements[i] as Env['placements'][number]).character = ref
                              })
                            }
                          />
                        </Row>
                        <Row label="Position (m)">
                          <Vec3Input
                            value={p.position}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.placements[i] as Env['placements'][number]).position = v
                              }, `p${i}pos`)
                            }
                          />
                        </Row>
                        <Row label="Yaw (°)">
                          <NumberInput
                            step={5}
                            value={p.rotationY}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.placements[i] as Env['placements'][number]).rotationY = v
                              }, `p${i}rot`)
                            }
                          />
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="lighting" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium">Palette</h3>
                      <EditButton
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          edit((d) => void d.palette.push({ name: `Color ${d.palette.length + 1}`, color: '#ffffff' }))
                        }
                      >
                        <Plus /> Color
                      </EditButton>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {draft.palette.map((c, i) => (
                        <div key={`pal-${i}`} className="flex items-center gap-1 rounded border p-1">
                          <ColorInput
                            value={c.color}
                            onChange={(color) =>
                              edit((d) => {
                                ;(d.palette[i] as Env['palette'][number]).color = color
                              }, `pal${i}c`)
                            }
                          />
                          <Input
                            className="h-7 min-w-0 flex-1 text-xs"
                            value={c.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.palette[i] as Env['palette'][number]).name = e.target.value
                              }, `pal${i}n`)
                            }
                          />
                          <EditButton
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => edit((d) => void d.palette.splice(i, 1))}
                          >
                            <Trash />
                          </EditButton>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <h3 className="text-xs font-medium">Fixtures</h3>
                      <EditButton
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          edit((d) => {
                            const deviceId = uniqueId(d as Env, 'light')
                            const address = Math.max(0, ...d.lights.map((l) => l.dmx.address)) + 8
                            d.lights.push({
                              deviceId,
                              name: 'Spot',
                              position: [3, 4, 3],
                              target: [0, 1, 0],
                              dmx: { universe: 0, address: Math.min(address, 505) },
                            })
                            setSelected({ kind: 'light', id: deviceId })
                          })
                        }
                      >
                        <Plus /> Fixture
                      </EditButton>
                    </div>
                    {draft.lights.map((l, i) => (
                      <ItemCard
                        key={`l-${i}`}
                        title={l.deviceId}
                        kind="light"
                        selected={isSel('light', l.deviceId)}
                        onSelect={() => setSelected({ kind: 'light', id: l.deviceId })}
                        onDelete={() => remove('lights', i)}
                      >
                        <Row label="Device id">
                          <Input
                            className="h-7 font-mono text-xs"
                            value={l.deviceId}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.lights[i] as Env['lights'][number]).deviceId = e.target.value
                              }, `l${i}id`)
                            }
                          />
                        </Row>
                        <Row label="Label">
                          <Input
                            className="h-7 text-xs"
                            value={l.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.lights[i] as Env['lights'][number]).name = e.target.value
                              }, `l${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Position (m)">
                          <Vec3Input
                            value={l.position}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.lights[i] as Env['lights'][number]).position = v
                              }, `l${i}p`)
                            }
                          />
                        </Row>
                        <Row label="Aim at (m)">
                          <Vec3Input
                            value={l.target}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.lights[i] as Env['lights'][number]).target = v
                              }, `l${i}t`)
                            }
                          />
                        </Row>
                        <Row label="DMX univ/addr">
                          <div className="grid grid-cols-2 gap-1">
                            <NumberInput
                              step={1}
                              min={0}
                              value={l.dmx.universe}
                              onChange={(v) =>
                                edit((d) => {
                                  ;(d.lights[i] as Env['lights'][number]).dmx.universe = Math.round(v)
                                }, `l${i}u`)
                              }
                            />
                            <NumberInput
                              step={1}
                              min={1}
                              max={512}
                              value={l.dmx.address}
                              onChange={(v) =>
                                edit((d) => {
                                  ;(d.lights[i] as Env['lights'][number]).dmx.address = Math.round(v)
                                }, `l${i}a`)
                              }
                            />
                          </div>
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="scenery" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        Set dressing for previews and the Godot twin. Not devices: never in bundles. Select one in the
                        viewport and drag the gizmo (W move · E rotate · R scale).
                      </p>
                      <EditButton
                        size="xs"
                        variant="outline"
                        disabled={!modelAssets.length}
                        onClick={() =>
                          edit((d) => {
                            const asset = modelAssets[0]
                            if (!asset) return
                            const used = new Set(d.scenery.map((x) => x.id))
                            let k = d.scenery.length + 1
                            while (used.has(`prop-${k}`)) k++
                            d.scenery.push({
                              id: `prop-${k}`,
                              name: asset.name.replace(/\.glb$/i, ''),
                              model: { assetId: asset.id },
                              position: [0, 0, 0],
                              rotationY: 0,
                              scale: 1,
                            })
                            setSelected({ kind: 'scenery', id: `prop-${k}` })
                          })
                        }
                      >
                        <Plus /> Prop
                      </EditButton>
                    </div>
                    {(draft.scenery ?? []).map((item, i) => (
                      <ItemCard
                        key={item.id}
                        title={item.name}
                        selected={isSel('scenery', item.id)}
                        onSelect={() => setSelected({ kind: 'scenery', id: item.id })}
                        onDelete={() => edit((d) => void d.scenery.splice(i, 1))}
                      >
                        <Row label="Name">
                          <Input
                            className="h-7 text-xs"
                            value={item.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.scenery[i] as Env['scenery'][number]).name = e.target.value
                              }, `s${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Model">
                          <Select
                            value={item.model.assetId}
                            onValueChange={(assetId) =>
                              edit((d) => {
                                ;(d.scenery[i] as Env['scenery'][number]).model = { assetId }
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="w-full text-xs">
                              <SelectValue placeholder="Missing model" />
                            </SelectTrigger>
                            <SelectContent>
                              {modelAssets.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Row>
                        <Row label="Position (m)">
                          <Vec3Input
                            value={item.position}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.scenery[i] as Env['scenery'][number]).position = v
                              }, `s${i}p`)
                            }
                          />
                        </Row>
                        <Row label="Yaw (°) / scale">
                          <div className="grid grid-cols-2 gap-1">
                            <NumberInput
                              aria-label="yaw"
                              step={5}
                              value={item.rotationY}
                              onChange={(v) =>
                                edit((d) => {
                                  ;(d.scenery[i] as Env['scenery'][number]).rotationY = v
                                }, `s${i}r`)
                              }
                            />
                            <NumberInput
                              aria-label="scale"
                              step={0.05}
                              min={0.05}
                              value={item.scale}
                              onChange={(v) =>
                                edit((d) => {
                                  ;(d.scenery[i] as Env['scenery'][number]).scale = Math.max(0.05, v)
                                }, `s${i}s`)
                              }
                            />
                          </div>
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="audio" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        Each zone has a volume ceiling; louder cues fail validation.
                      </p>
                      <EditButton
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          edit((d) => {
                            const deviceId = uniqueId(d as Env, 'audio')
                            d.audio.push({ deviceId, name: 'Speakers', position: [0, 2.5, 3], maxVolumeDb: -6 })
                            setSelected({ kind: 'audio', id: deviceId })
                          })
                        }
                      >
                        <Plus /> Zone
                      </EditButton>
                    </div>
                    {draft.audio.map((a, i) => (
                      <ItemCard
                        key={`a-${i}`}
                        title={a.deviceId}
                        kind="audio"
                        selected={isSel('audio', a.deviceId)}
                        onSelect={() => setSelected({ kind: 'audio', id: a.deviceId })}
                        onDelete={() => remove('audio', i)}
                      >
                        <Row label="Device id">
                          <Input
                            className="h-7 font-mono text-xs"
                            value={a.deviceId}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.audio[i] as Env['audio'][number]).deviceId = e.target.value
                              }, `a${i}id`)
                            }
                          />
                        </Row>
                        <Row label="Label">
                          <Input
                            className="h-7 text-xs"
                            value={a.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.audio[i] as Env['audio'][number]).name = e.target.value
                              }, `a${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Position (m)">
                          <Vec3Input
                            value={a.position}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.audio[i] as Env['audio'][number]).position = v
                              }, `a${i}p`)
                            }
                          />
                        </Row>
                        <Row label="Max (dBFS)">
                          <NumberInput
                            step={1}
                            max={0}
                            value={a.maxVolumeDb}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.audio[i] as Env['audio'][number]).maxVolumeDb = Math.min(0, v)
                              }, `a${i}v`)
                            }
                          />
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="sensors" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        Inputs that shows can react to locally, without the cloud.
                      </p>
                      <EditButton
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          edit((d) => {
                            const deviceId = uniqueId(d as Env, 'sensor')
                            d.sensors.push({
                              deviceId,
                              name: 'Presence',
                              type: 'presence',
                              position: [0, 0.5, 4.5],
                              range: 1.5,
                            })
                            setSelected({ kind: 'sensor', id: deviceId })
                          })
                        }
                      >
                        <Plus /> Sensor
                      </EditButton>
                    </div>
                    {draft.sensors.map((s, i) => (
                      <ItemCard
                        key={`s-${i}`}
                        title={s.deviceId}
                        kind="sensor"
                        selected={isSel('sensor', s.deviceId)}
                        onSelect={() => setSelected({ kind: 'sensor', id: s.deviceId })}
                        onDelete={() => remove('sensors', i)}
                      >
                        <Row label="Device id">
                          <Input
                            className="h-7 font-mono text-xs"
                            value={s.deviceId}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.sensors[i] as Env['sensors'][number]).deviceId = e.target.value
                              }, `s${i}id`)
                            }
                          />
                        </Row>
                        <Row label="Label">
                          <Input
                            className="h-7 text-xs"
                            value={s.name}
                            onChange={(e) =>
                              edit((d) => {
                                ;(d.sensors[i] as Env['sensors'][number]).name = e.target.value
                              }, `s${i}n`)
                            }
                          />
                        </Row>
                        <Row label="Type">
                          <Select
                            value={s.type}
                            onValueChange={(type) =>
                              edit((d) => {
                                ;(d.sensors[i] as Env['sensors'][number]).type = type as SensorType
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="presence">Presence (enter / exit)</SelectItem>
                              <SelectItem value="proximity">Proximity (enter / exit)</SelectItem>
                              <SelectItem value="button">Button (press)</SelectItem>
                            </SelectContent>
                          </Select>
                        </Row>
                        <Row label="Position (m)">
                          <Vec3Input
                            value={s.position}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.sensors[i] as Env['sensors'][number]).position = v
                              }, `s${i}p`)
                            }
                          />
                        </Row>
                        <Row label="Range (m)">
                          <NumberInput
                            min={0.1}
                            value={s.range}
                            onChange={(v) =>
                              edit((d) => {
                                ;(d.sensors[i] as Env['sensors'][number]).range = Math.max(0.1, v)
                              }, `s${i}r`)
                            }
                          />
                        </Row>
                      </ItemCard>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="issues" className="min-h-0 flex-1">
                <IssuesList
                  issues={issues}
                  onSelect={(i) => {
                    if (i.deviceId) {
                      const dev = environmentDevices(draft).find((d) => d.deviceId === i.deviceId)
                      if (dev) select({ kind: dev.kind === 'doll' ? 'placement' : dev.kind, id: dev.deviceId })
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="revisions" className="min-h-0 flex-1 overflow-auto">
                <RevisionsPanel docId={id} kind="environment" />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </EditableContext.Provider>
  )
}
