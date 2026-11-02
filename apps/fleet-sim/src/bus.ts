import { EventEmitter } from 'node:events'
import { BehaviorScheduler } from '@studio/playback'
import type { SensorEvent, ShowBundle } from '@studio/schema'

/*
 * The park-local network. Sensor events and behavior decisions travel here,
 * never through the cloud: a guest walking in must get a reaction even when
 * the fleet manager is unreachable.
 */

export interface BusEvents {
  sensor: [{ sensorId: string; event: SensorEvent }]
  run: [{ sha256: string; bundle: ShowBundle; startAtLocal: number }]
  runEnd: [{ sha256: string }]
  behaviorStart: [{ sha256: string; id: string; startAt: number }]
}

export class LocalBus extends EventEmitter<BusEvents> {}

/**
 * Local show controller: the single arbiter of sensor -> behavior decisions for
 * the attraction, so every device starts the same response at the same show time.
 */
export class LocalShowController {
  private run: { sha256: string; startAtLocal: number; scheduler: BehaviorScheduler } | null = null

  constructor(
    bus: LocalBus,
    private readonly log: (msg: string) => void = () => {},
  ) {
    bus.on('run', ({ sha256, bundle, startAtLocal }) => {
      if (this.run?.sha256 === sha256 && this.run.startAtLocal === startAtLocal) return
      this.run = { sha256, startAtLocal, scheduler: new BehaviorScheduler(bundle.behaviors) }
    })
    bus.on('runEnd', ({ sha256 }) => {
      if (this.run?.sha256 === sha256) this.run = null
    })
    bus.on('sensor', ({ sensorId, event }) => {
      const run = this.run
      if (!run) return this.log(`sensor ${sensorId}:${event} ignored (no show running)`)
      const t = Date.now() - run.startAtLocal
      if (t < 0) return
      const started = run.scheduler.trigger(sensorId, event, t)
      if (started.length === 0) this.log(`sensor ${sensorId}:${event} at ${t} ms: no behavior eligible`)
      for (const s of started) {
        this.log(`sensor ${sensorId}:${event} at ${t} ms -> behavior "${s.id}"`)
        bus.emit('behaviorStart', { sha256: run.sha256, id: s.id, startAt: s.startAt })
      }
    })
  }
}
