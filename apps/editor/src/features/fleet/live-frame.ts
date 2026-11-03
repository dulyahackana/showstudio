import { compileBundle, type ShowFrame, sampleFrame } from '@studio/playback'
import type { EnvironmentStatus } from '@studio/schema'
import { useMemo } from 'react'
import { useRevision, useShowContext } from '@/lib/queries'

/** The run in progress (scheduled or running), if any. */
export const activeRun = (status: EnvironmentStatus | undefined) =>
  status?.run && ['scheduled', 'running'].includes(status.run.status) ? status.run : null

/**
 * What the attraction is outputting right now, sampled in the browser from the same
 * immutable revision the devices play (main timeline only: sensor responses are
 * decided in the park and never reach the cloud).
 */
export function useLiveFrame(status: EnvironmentStatus | undefined, serverNow: number): ShowFrame | null {
  const run = activeRun(status)
  const show = useRevision<'show'>(run ? { id: run.showId, revision: run.revision } : null)
  const { environment, characters } = useShowContext(show.data?.content.environment)
  // Status polls return a new run object every second; recompile only when the show changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by show id and revision on purpose
  const bundle = useMemo(() => {
    if (!run || !show.data || !environment) return null
    try {
      return compileBundle({
        show: { id: run.showId, revision: run.revision },
        definition: show.data.content,
        environment,
        characters,
        assetPath: (a) => a,
      })
    } catch {
      return null
    }
  }, [run?.showId, run?.revision, show.data, environment, characters])
  if (!run || !bundle) return null
  const t = serverNow - run.startAt
  return t < 0 || t > run.durationMs ? null : sampleFrame(bundle, t, [])
}
