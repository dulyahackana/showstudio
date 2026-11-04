import { EventEmitter } from 'node:events'
import { BehaviorScheduler, standbyBundle } from '@studio/playback'
import type { SensorEvent, ShowBundle } from '@studio/schema'

/*
 * The park-local network. Sensor events, behavior decisions and console e-stops
 * travel here, never through the cloud: a guest walking in must get a reaction,
 * and an e-stop must stop everything, even when the fleet manager is unreachable.
 */

export interface BusEvents {
  sensor: [{ sensorId: string; event: SensorEvent }]
  run: [{ sha256: string; bundle: ShowBundle; startAtLocal: number }]
  /** completed: the show reached its end (standby may follow); otherwise stopped, e-stopped or replaced. */
  runEnd: [{ sha256: string; completed: boolean }]
  behaviorStart: [{ sha256: string; id: string; startAt: number }]
  /** An operator console's E-STOP: every controller latches at once (the hardwired stop circuit). */
  estop: [{ by: string; reason: string }]
  /** A reset the fleet manager accepted, relayed by a console so controllers cut off from the cloud clear too. */
  reset: [{ by: string }]
}

export class LocalBus extends EventEmitter<BusEvents> {
  constructor() {
    super()
    // One listener per device; attractions routinely have more than Node's default of 10.
    this.setMaxListeners(0)
  }
}

/**
 * Local show controller: the single arbiter of sensor -> behavior decisions for
 * the attraction, so every device starts the same response at the same show time.
 * During a run the clock is show time; in standby (after a show completes) it is
 * the time since the show ended.
 */
export class LocalShowController {
  private run: { sha256: string; startAtLocal: number; bundle: ShowBundle; scheduler: BehaviorScheduler } | null = null
  private standby: { sha256: string; startAtLocal: number; scheduler: BehaviorScheduler } | null = null

  constructor(
    bus: LocalBus,
    private readonly log: (msg: string) => void = () => {},
  ) {
    bus.on('run', ({ sha256, bundle, startAtLocal }) => {
      if (this.run?.sha256 === sha256 && this.run.startAtLocal === startAtLocal) return
      this.run = { sha256, startAtLocal, bundle, scheduler: new BehaviorScheduler(bundle.behaviors) }
      this.standby = null
    })
    bus.on('runEnd', ({ sha256, completed }) => {
      const run = this.run
      if (run?.sha256 === sha256) {
        this.run = null
        const standby = completed ? standbyBundle(run.bundle) : null
        if (standby) {
          this.standby = {
            sha256,
            startAtLocal: run.startAtLocal + run.bundle.durationMs,
            scheduler: new BehaviorScheduler(standby.behaviors),
          }
          this.log(`standby: ${standby.behaviors.length} responses still answer guests`)
        }
      } else if (!completed && this.standby?.sha256 === sha256) {
        this.standby = null
        this.log('standby ended')
      }
    })
    bus.on('sensor', ({ sensorId, event }) => {
      const live = this.run ?? this.standby
      if (!live) return this.log(`sensor ${sensorId}:${event} ignored (no show running, no standby)`)
      const t = Date.now() - live.startAtLocal
      if (t < 0) return
      const started = live.scheduler.trigger(sensorId, event, t)
      const when = this.run ? `at ${t} ms` : 'in standby'
      if (started.length === 0) this.log(`sensor ${sensorId}:${event} ${when}: no behavior eligible`)
      for (const s of started) {
        this.log(`sensor ${sensorId}:${event} ${when} -> behavior "${s.id}"`)
        bus.emit('behaviorStart', { sha256: live.sha256, id: s.id, startAt: s.startAt })
      }
    })
  }
}
