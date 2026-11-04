import {
  type Asset,
  type AudioCue,
  type CharacterDefinition,
  type EnvironmentDefinition,
  type Interp,
  type LightKey,
  type MotionKey,
  refKey,
  type Tracks,
} from '@studio/schema'
import { useSelector } from '@tanstack/react-store'
import type { Draft } from 'immer'
import { Bot, ChevronRight, Keyboard, Plus, Trash } from 'lucide-react'
import { useState } from 'react'
import { EditButton, useEditable } from '@/components/editable'
import { ColorInput, NumberInput, Row } from '@/components/fields'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Playback } from './playback'
import { clamp, clampKeyTime, draftKeys, keysOf, round, type Selection, upsertKey } from './timeline-math'

function InterpSelect({ value, onChange }: { value: Interp; onChange: (v: Interp) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Interp)}>
      <SelectTrigger size="sm" className="w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ease">Ease (smooth start/stop)</SelectItem>
        <SelectItem value="linear">Linear</SelectItem>
        <SelectItem value="step">Step (jump)</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function Inspector({
  tracks,
  durationMs,
  environment,
  characters,
  playback,
  selection,
  onSelect,
  edit,
  audioAssets,
  focusDevice,
  onFocus,
  palette,
}: {
  tracks: Tracks
  durationMs: number
  environment: EnvironmentDefinition
  characters: ReadonlyMap<string, CharacterDefinition>
  playback: Playback
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  edit: (fn: (t: Draft<Tracks>) => void, coalesceKey?: string) => void
  audioAssets: Asset[]
  focusDevice: string | null
  onFocus?: (deviceId: string) => void
  palette: EnvironmentDefinition['palette']
}) {
  const editable = useEditable()
  // Re-render with the playhead (coarsely while playing) so pose sliders follow the show.
  const t = useSelector(playback.store, (s) => (s.playing ? Math.round(s.t / 100) * 100 : s.t))
  const at = Math.round(t / 10) * 10
  const deviceId = selection?.row.deviceId ?? focusDevice
  const placement = environment.placements.find((p) => p.deviceId === deviceId)
  const character = placement ? characters.get(refKey(placement.character)) : undefined
  const pose = placement ? playback.frame()?.poses[placement.deviceId] : undefined
  const row = selection?.row
  const keys = row ? keysOf(tracks, row) : []
  const key = selection?.index != null ? keys[selection.index] : undefined

  const patchKey = (patch: Partial<MotionKey & LightKey & AudioCue>, coalesce?: string) => {
    if (!row || selection?.index == null) return
    const index = selection.index
    edit((tr) => {
      const k = draftKeys(tr as Tracks, row)[index]
      if (k) Object.assign(k, patch)
    }, coalesce)
  }
  const deleteKey = () => {
    if (!row || selection?.index == null) return
    const index = selection.index
    edit((tr) => void draftKeys(tr as Tracks, row).splice(index, 1))
    onSelect({ row, index: null })
  }

  return (
    <ScrollArea className="h-full bg-surface/40">
      <div className="flex h-11 items-center justify-between border-b px-4">
        <span className="text-eyebrow">Inspector</span>
        <span className="rounded border bg-sidebar px-2 py-0.5 font-mono text-xs text-primary tabular">
          {formatMs(at)}
        </span>
      </div>
      <div className="space-y-4 p-3 text-xs" data-testid="inspector">
        {placement && character && (
          <section className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md border border-motion/25 bg-motion/10">
                <Bot className="size-3.5 text-motion" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{placement.name}</h3>
                <span className="font-mono text-[10px] text-muted-foreground">{placement.deviceId}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Drag a joint to pose the figure: a key is set at the playhead (auto-key).
            </p>
            {character.joints.map((j) => {
              const v = pose?.[j.name] ?? j.home
              return (
                <div key={j.name} className="space-y-1.5">
                  <div className="flex justify-between font-mono text-[11px]">
                    <button
                      type="button"
                      className="hover:text-motion"
                      onClick={() =>
                        onSelect({ row: { kind: 'motion', deviceId: placement.deviceId, joint: j.name }, index: null })
                      }
                    >
                      {j.name}
                    </button>
                    <span className="text-motion tabular">
                      {v.toFixed(1)}
                      {j.type === 'revolute' ? '°' : 'm'}
                    </span>
                  </div>
                  <Slider
                    min={j.min}
                    max={j.max}
                    step={(j.max - j.min) / 200}
                    value={[v]}
                    aria-label={j.name}
                    onValueChange={([value = j.home]) => {
                      playback.pause()
                      const motionRow = { kind: 'motion' as const, deviceId: placement.deviceId, joint: j.name }
                      let index = 0
                      edit((tr) => {
                        index = upsertKey(draftKeys(tr as Tracks, motionRow) as MotionKey[], {
                          t: at,
                          v: round(value),
                          interp: 'ease',
                        })
                      }, `pose:${placement.deviceId}:${j.name}:${at}`)
                      onSelect({ row: motionRow, index })
                    }}
                  />
                </div>
              )
            })}
          </section>
        )}

        {row && key && (
          <section className="space-y-2.5 rounded-lg border bg-card p-3" data-testid="key-inspector">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">
                {row.kind === 'audio' ? 'Audio cue' : 'Key'}{' '}
                {selection?.index !== null && `#${(selection?.index ?? 0) + 1}`}
              </h3>
              <EditButton size="icon-xs" variant="ghost" onClick={deleteKey} aria-label="Delete key">
                <Trash />
              </EditButton>
            </div>
            <Row label="Time (ms)">
              <NumberInput
                step={10}
                value={key.t}
                onChange={(v) => {
                  const index = selection?.index ?? 0
                  const tt =
                    row.kind === 'audio'
                      ? clamp(Math.round(v), 0, durationMs)
                      : clampKeyTime(keys, index, Math.round(v), durationMs)
                  patchKey({ t: tt }, `t:${index}`)
                }}
              />
            </Row>
            {row.kind === 'motion' &&
              'v' in key &&
              (() => {
                const j = character?.joints.find((x) => x.name === row.joint)
                return (
                  <>
                    <Row label={`Value (${j?.type === 'prismatic' ? 'm' : '°'})`}>
                      <NumberInput
                        value={key.v}
                        onChange={(v) => patchKey({ v: j ? clamp(v, j.min, j.max) : v }, `v:${selection?.index}`)}
                      />
                    </Row>
                    <Row label="To next key">
                      <InterpSelect value={key.interp} onChange={(interp) => patchKey({ interp })} />
                    </Row>
                  </>
                )
              })()}
            {row.kind === 'light' && 'color' in key && (
              <>
                <Row label="Color">
                  <ColorInput value={key.color} onChange={(color) => patchKey({ color }, `c:${selection?.index}`)} />
                </Row>
                {editable && palette.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-[118px]">
                    {palette.map((p) => (
                      <button
                        type="button"
                        key={p.name}
                        title={p.name}
                        className="size-5 rounded border"
                        style={{ background: p.color }}
                        onClick={() => patchKey({ color: p.color })}
                      />
                    ))}
                  </div>
                )}
                <Row label="Intensity">
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[key.intensity]}
                    onValueChange={([v = 0]) => patchKey({ intensity: round(v) }, `i:${selection?.index}`)}
                  />
                </Row>
                <Row label="To next key">
                  <InterpSelect value={key.interp} onChange={(interp) => patchKey({ interp })} />
                </Row>
              </>
            )}
            {row.kind === 'audio' &&
              'assetId' in key &&
              (() => {
                const zone = environment.audio.find((a) => a.deviceId === row.deviceId)
                return (
                  <>
                    <Row label="Label">
                      <Input
                        className="h-7 text-xs"
                        value={key.label}
                        onChange={(e) => patchKey({ label: e.target.value }, `l:${selection?.index}`)}
                      />
                    </Row>
                    <Row label="Audio file">
                      <Select value={key.assetId} onValueChange={(assetId) => patchKey({ assetId })}>
                        <SelectTrigger size="sm" className="w-full text-xs">
                          <SelectValue placeholder="Missing file" />
                        </SelectTrigger>
                        <SelectContent>
                          {audioAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Row>
                    <Row label={`Volume (≤ ${zone?.maxVolumeDb ?? 0} dB)`}>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={-48}
                          max={0}
                          step={0.5}
                          value={[key.volumeDb]}
                          onValueChange={([v = -12]) => patchKey({ volumeDb: v }, `vol:${selection?.index}`)}
                        />
                        <span className="w-12 text-right font-mono">{key.volumeDb} dB</span>
                      </div>
                    </Row>
                  </>
                )
              })()}
          </section>
        )}

        {row && !key && (
          <EditButton
            size="sm"
            variant={row.kind === 'motion' ? 'default' : 'outline'}
            className="w-full"
            data-testid="add-key-at-playhead"
            onClick={() => {
              if (row.kind === 'motion') {
                const joint = character?.joints.find((j) => j.name === row.joint)
                const v = pose?.[row.joint] ?? joint?.home ?? 0
                let index = 0
                edit((tr) => {
                  index = upsertKey(draftKeys(tr as Tracks, row) as MotionKey[], { t: at, v: round(v), interp: 'ease' })
                })
                onSelect({ row, index })
              }
              if (row.kind === 'light') {
                let index = 0
                edit((tr) => {
                  index = upsertKey(draftKeys(tr as Tracks, row) as LightKey[], {
                    t: at,
                    color: palette[0]?.color ?? '#ffffff',
                    intensity: 1,
                    interp: 'linear',
                  })
                })
                onSelect({ row, index })
              }
            }}
            disabled={row.kind === 'audio'}
          >
            <Plus />{' '}
            {row.kind === 'audio'
              ? 'Double-click the lane to add a cue'
              : `Add ${row.kind === 'motion' ? row.joint : 'light'} key at ${formatMs(at)}`}
          </EditButton>
        )}

        {!selection && !placement && (
          <>
            <section className="space-y-1.5">
              <div className="text-eyebrow px-1">Figures</div>
              {environment.placements.map((p) => {
                const c = characters.get(refKey(p.character))
                return (
                  <button
                    key={p.deviceId}
                    type="button"
                    onClick={() => onFocus?.(p.deviceId)}
                    className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition hover:border-motion/40 hover:bg-surface-2"
                  >
                    <span className="flex size-7 items-center justify-center rounded-md border border-motion/25 bg-motion/10">
                      <Bot className="size-3.5 text-motion" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {p.deviceId} · {c?.joints.length ?? 0} {c?.joints.length === 1 ? 'joint' : 'joints'}
                      </span>
                    </span>
                    <span className="text-muted-foreground">{editable ? 'Pose →' : 'Inspect →'}</span>
                  </button>
                )
              })}
            </section>
            {editable && <AnimateHelp />}
          </>
        )}
      </div>
    </ScrollArea>
  )
}

/** The animating basics, folded away once read. Remembered in this browser. */
function AnimateHelp() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('studio.help.animate') !== 'closed'
    } catch {
      return true
    }
  })
  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem('studio.help.animate', open ? 'closed' : 'open')
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <section className="rounded-lg border text-muted-foreground">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium text-foreground"
      >
        <Keyboard className="size-3.5 text-muted-foreground" /> How to animate
        <ChevronRight className={cn('ml-auto size-3.5 text-muted-foreground transition', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 pt-2 pb-3">
          <ol className="list-decimal space-y-1 pl-4 leading-relaxed">
            <li>Move the playhead to a moment.</li>
            <li>
              <span className="text-foreground">Pose</span> a figure above: every joint you move becomes a key there. Or
              hover a track and click <span className="text-foreground">◆</span>.
            </li>
            <li>Drag keys to retime them, up or down to change the value.</li>
          </ol>
          <p className="leading-relaxed">
            <Kbd>Space</Kbd> play · <Kbd>⌫</Kbd> delete key · <Kbd>⌘Z</Kbd> undo · <Kbd>←</Kbd>
            <Kbd>→</Kbd> nudge · <Kbd>⇧</Kbd> no snapping · <Kbd>⌥</Kbd> time only
          </p>
        </div>
      )}
    </section>
  )
}
