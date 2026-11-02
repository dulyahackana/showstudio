import { audioEventsBetween, BehaviorScheduler, canonicalJson, type ShowFrame, sampleFrame } from '@studio/playback'
import type { SensorEvent, ShowBundle } from '@studio/schema'
import { Store } from '@tanstack/react-store'
import { useEffect, useMemo } from 'react'
import { assetUrl } from '@/lib/api'
import { clamp, dbToGain } from './timeline-math'

interface PlaybackState {
  t: number
  playing: boolean
  loop: boolean
  activeSensors: string[]
  activeBehaviors: string[]
}

/**
 * Editor preview transport. Plays the compiled bundle through the same
 * deterministic runtime the devices use, including sensor responses decided by
 * the same scheduler, so what you see here is what the attraction does.
 */
export class Playback {
  readonly store = new Store<PlaybackState>({
    t: 0,
    playing: false,
    loop: false,
    activeSensors: [],
    activeBehaviors: [],
  })
  private bundle: ShowBundle | null = null
  private behaviorsKey = ''
  private scheduler = new BehaviorScheduler([])
  private raf = 0
  private last = 0
  private audioT = -1
  private audio: HTMLAudioElement[] = []

  setBundle(bundle: ShowBundle | null) {
    this.bundle = bundle
    const key = bundle ? canonicalJson(bundle.behaviors) : ''
    if (key !== this.behaviorsKey) {
      this.behaviorsKey = key
      this.scheduler = new BehaviorScheduler(bundle?.behaviors ?? [])
    }
    if (bundle && this.store.state.t > bundle.durationMs) this.seek(bundle.durationMs)
  }

  get durationMs() {
    return this.bundle?.durationMs ?? 0
  }

  get t() {
    return this.store.state.t
  }

  frame(): ShowFrame | null {
    return this.bundle ? sampleFrame(this.bundle, this.store.state.t, this.scheduler.history) : null
  }

  play() {
    if (!this.bundle || this.store.state.playing) return
    if (this.store.state.t >= this.durationMs) this.seek(0)
    this.audioT = this.store.state.t - 1
    this.last = performance.now()
    this.store.setState((s) => ({ ...s, playing: true }))
    this.raf = requestAnimationFrame(this.tick)
  }

  pause() {
    cancelAnimationFrame(this.raf)
    this.stopAudio()
    this.store.setState((s) => ({ ...s, playing: false }))
  }

  toggle() {
    if (this.store.state.playing) this.pause()
    else this.play()
  }

  setLoop(loop: boolean) {
    this.store.setState((s) => ({ ...s, loop }))
  }

  seek(t: number) {
    const next = clamp(t, 0, this.durationMs)
    if (next < this.store.state.t) this.scheduler.truncate(next)
    this.stopAudio()
    this.audioT = next
    this.publish(next)
  }

  /** Sensor responses started during this preview (newest last). */
  get started() {
    return this.scheduler.history
  }

  /** Simulate a sensor event at the playhead; returns the behaviors that started. */
  trigger(sensorId: string, event: SensorEvent): string[] {
    const started = this.scheduler.trigger(sensorId, event, this.store.state.t).map((s) => s.id)
    this.store.setState((s) => ({ ...s, activeSensors: [...s.activeSensors, sensorId] }))
    setTimeout(() => {
      this.store.setState((s) => ({ ...s, activeSensors: s.activeSensors.filter((x) => x !== sensorId) }))
    }, 700)
    if (!this.store.state.playing) this.publish(this.store.state.t)
    return started
  }

  dispose() {
    this.pause()
  }

  private publish(t: number) {
    const active = this.bundle ? sampleFrame(this.bundle, t, this.scheduler.history).activeBehaviors : []
    this.store.setState((s) => ({
      ...s,
      t,
      activeBehaviors: active.join() === s.activeBehaviors.join() ? s.activeBehaviors : active,
    }))
  }

  private tick = (now: number) => {
    const s = this.store.state
    let t = s.t + (now - this.last)
    this.last = now
    if (t >= this.durationMs) {
      if (s.loop) {
        this.scheduler.reset()
        this.seek(0)
        this.audioT = -1
        this.raf = requestAnimationFrame(this.tick)
        return
      }
      t = this.durationMs
      this.publish(t)
      this.pause()
      return
    }
    this.playAudio(this.audioT, t)
    this.audioT = t
    this.publish(t)
    this.raf = requestAnimationFrame(this.tick)
  }

  private playAudio(from: number, to: number) {
    const bundle = this.bundle
    if (!bundle) return
    for (const payload of Object.values(bundle.devices)) {
      if (payload.kind !== 'audio') continue
      for (const e of audioEventsBetween(payload, bundle, from, to, this.scheduler.history)) {
        const el = new Audio(assetUrl(e.cue.assetId))
        el.volume = dbToGain(e.cue.volumeDb)
        el.currentTime = Math.max(0, (to - e.at) / 1000)
        void el.play().catch(() => {})
        this.audio.push(el)
      }
    }
  }

  private stopAudio() {
    for (const el of this.audio) el.pause()
    this.audio = []
  }
}

export function usePlayback(bundle: ShowBundle | null): Playback {
  const playback = useMemo(() => new Playback(), [])
  useEffect(() => playback.setBundle(bundle), [playback, bundle])
  useEffect(() => () => playback.dispose(), [playback])
  return playback
}
