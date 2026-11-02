import { type EnvironmentDefinition, SENSOR_EVENTS, type SensorEvent, type ShowDefinition } from '@studio/schema'
import type { Draft } from 'immer'
import { Pencil, Plus, Radar, Trash, Zap } from 'lucide-react'
import { NumberInput } from '@/components/fields'
import { ToneBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Playback } from './playback'
import type { Target } from './timeline-math'

/**
 * Step 4b: custom responses to sensor input. Each response is a bounded clip
 * (blend in, play, blend out) so the validator can prove it is safe from any pose.
 */
export function BehaviorsPanel({
  show,
  environment,
  update,
  target,
  setTarget,
  playback,
  activeBehaviors,
}: {
  show: ShowDefinition
  environment: EnvironmentDefinition
  update: (fn: (d: Draft<ShowDefinition>) => void, key?: string) => void
  target: Target
  setTarget: (t: Target) => void
  playback: Playback
  activeBehaviors: readonly string[]
}) {
  const sensors = environment.sensors
  const add = () => {
    const sensor = sensors[0]
    if (!sensor) return
    const used = new Set(show.behaviors.map((b) => b.id))
    let n = show.behaviors.length + 1
    while (used.has(`response-${n}`)) n++
    const id = `response-${n}`
    update((d) => {
      d.behaviors.push({
        id,
        name: `Response ${n}`,
        enabled: true,
        trigger: { sensorId: sensor.deviceId, event: SENSOR_EVENTS[sensor.type][0] ?? 'enter' },
        window: null,
        blendMs: 2000,
        cooldownMs: 5000,
        durationMs: 3000,
        tracks: { motion: {}, lights: {}, audio: {} },
      })
    })
    setTarget({ kind: 'behavior', id })
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4 text-xs">
        <div className="flex items-center justify-between gap-4">
          <p className="max-w-xl text-muted-foreground">
            Bounded reactions to guests, decided in the park by the local show controller (never the cloud). Each one
            blends in from wherever the figures are, plays a clip and blends back, so it is provably safe from any pose.
          </p>
          <Button size="sm" variant="outline" onClick={add} disabled={!sensors.length} data-testid="add-behavior">
            <Plus /> Response
          </Button>
        </div>
        {!sensors.length && <p className="text-warn">This environment has no sensors.</p>}
        <div className="grid gap-3 2xl:grid-cols-2">
          {show.behaviors.map((b, i) => {
            const sensor = sensors.find((s) => s.deviceId === b.trigger.sensorId)
            const editing = target.kind === 'behavior' && target.id === b.id
            const playing = activeBehaviors.includes(b.id)
            const set = (fn: (x: Draft<ShowDefinition>['behaviors'][number]) => void, key?: string) =>
              update((d) => {
                const x = d.behaviors[i]
                if (x) fn(x)
              }, key && `b${i}:${key}`)
            return (
              <div
                key={b.id}
                className={cn(
                  'space-y-4 rounded-xl border bg-card p-4 transition',
                  editing && 'border-primary/60 bg-primary/[0.04]',
                  playing && 'shadow-[0_0_0_1px_var(--primary)]',
                  !b.enabled && 'opacity-60',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sensor/25 bg-sensor/10">
                    <Radar className={cn('size-4 text-sensor', playing && 'animate-pulse text-primary')} />
                  </span>
                  <Input
                    className="h-8 max-w-64 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
                    value={b.name}
                    onChange={(e) =>
                      set((x) => {
                        x.name = e.target.value
                      }, 'name')
                    }
                  />
                  {playing && <ToneBadge t="warn">playing</ToneBadge>}
                  <div className="ml-auto flex items-center gap-1">
                    <Switch
                      checked={b.enabled}
                      onCheckedChange={(v) =>
                        set((x) => {
                          x.enabled = v
                        })
                      }
                      aria-label="Enabled"
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Trigger at the playhead"
                      disabled={target.kind !== 'main' || !b.enabled}
                      onClick={() => {
                        playback.trigger(b.trigger.sensorId, b.trigger.event)
                        playback.play()
                      }}
                    >
                      <Zap />
                    </Button>
                    <Button
                      size="sm"
                      variant={editing ? 'default' : 'outline'}
                      onClick={() => setTarget(editing ? { kind: 'main' } : { kind: 'behavior', id: b.id })}
                    >
                      <Pencil /> {editing ? 'Done' : 'Edit clip'}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete response"
                      onClick={() => {
                        if (editing) setTarget({ kind: 'main' })
                        update((d) => void d.behaviors.splice(i, 1))
                      }}
                    >
                      <Trash />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">When</span>
                  <Select
                    value={b.trigger.sensorId}
                    onValueChange={(sensorId) =>
                      set((x) => {
                        x.trigger.sensorId = sensorId
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto min-w-32 text-xs">
                      <SelectValue placeholder="sensor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sensors.map((s) => (
                        <SelectItem key={s.deviceId} value={s.deviceId}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">reports</span>
                  <Select
                    value={b.trigger.event}
                    onValueChange={(event) =>
                      set((x) => {
                        x.trigger.event = event as SensorEvent
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-auto min-w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(sensor ? SENSOR_EVENTS[sensor.type] : (['enter', 'exit', 'press'] as const)).map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="ml-2 flex items-center gap-1.5 text-muted-foreground">
                    <Switch
                      checked={b.window !== null}
                      onCheckedChange={(on) =>
                        set((x) => {
                          x.window = on ? { fromMs: 0, toMs: show.durationMs } : null
                        })
                      }
                      aria-label="Limit to a window"
                    />
                    {b.window ? 'only between' : 'any time in the show'}
                  </span>
                  {b.window && (
                    <span className="flex items-center gap-1">
                      <NumberInput
                        className="w-20"
                        step={100}
                        value={b.window.fromMs}
                        onChange={(v) =>
                          set((x) => {
                            if (x.window) x.window.fromMs = Math.max(0, Math.round(v))
                          }, 'wf')
                        }
                      />
                      <span className="text-muted-foreground">–</span>
                      <NumberInput
                        className="w-20"
                        step={100}
                        value={b.window.toMs}
                        onChange={(v) =>
                          set((x) => {
                            if (x.window) x.window.toMs = Math.max(0, Math.round(v))
                          }, 'wt')
                        }
                      />
                      <span className="text-muted-foreground">ms</span>
                    </span>
                  )}
                </div>

                <TimingDiagram blendMs={b.blendMs} durationMs={b.durationMs} cooldownMs={b.cooldownMs} />

                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-eyebrow">Blend (ms)</span>
                    <NumberInput
                      step={100}
                      value={b.blendMs}
                      onChange={(v) =>
                        set((x) => {
                          x.blendMs = clampInt(v, 0, 10_000)
                        }, 'blend')
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-eyebrow">Clip (ms)</span>
                    <NumberInput
                      step={100}
                      value={b.durationMs}
                      onChange={(v) =>
                        set((x) => {
                          x.durationMs = clampInt(v, 1, 600_000)
                        }, 'dur')
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-eyebrow">Cooldown (ms)</span>
                    <NumberInput
                      step={500}
                      value={b.cooldownMs}
                      onChange={(v) =>
                        set((x) => {
                          x.cooldownMs = clampInt(v, 0, 3_600_000)
                        }, 'cool')
                      }
                    />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}

/** Blend in → clip → blend back, then the cooldown before it may fire again. */
function TimingDiagram({ blendMs, durationMs, cooldownMs }: { blendMs: number; durationMs: number; cooldownMs: number }) {
  const total = 2 * blendMs + durationMs + cooldownMs || 1
  const w = (ms: number) => `${(ms / total) * 100}%`
  const seg = (ms: number, label: string, cls: string) =>
    ms > 0 && (
      <div className={cn('relative flex h-full min-w-0 items-center justify-center overflow-hidden', cls)} style={{ width: w(ms) }}>
        <span className="truncate px-1 font-mono text-[10px]">
          {label} {(ms / 1000).toFixed(1)}s
        </span>
      </div>
    )
  return (
    <div className="flex h-7 overflow-hidden rounded-md border bg-sidebar">
      {seg(blendMs, 'blend', 'bg-gradient-to-r from-primary/5 to-primary/30 text-primary')}
      {seg(durationMs, 'clip', 'bg-primary/45 font-medium text-primary-foreground')}
      {seg(blendMs, 'back', 'bg-gradient-to-r from-primary/30 to-primary/5 text-primary')}
      {seg(cooldownMs, 'cooldown', 'bg-[repeating-linear-gradient(45deg,transparent_0_6px,oklch(1_0_0/5%)_6px_12px)] text-muted-foreground')}
    </div>
  )
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
