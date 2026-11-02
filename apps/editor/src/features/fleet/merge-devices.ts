import type { Device, EnvironmentStatus } from '@studio/schema'

/** Expected devices (from the environment) merged with what is actually connected. */
export function mergeDevices(status: EnvironmentStatus | undefined): Device[] {
  if (!status) return []
  const byId = new Map(status.devices.map((d) => [d.id, d]))
  const expected = status.expectedDevices.map(
    (e): Device =>
      byId.get(e.deviceId) ?? {
        id: e.deviceId,
        environmentId: status.environmentId,
        kind: e.kind,
        online: false,
        state: 'idle',
        firmware: '—',
        characterRef: null,
        staged: [],
        active: null,
        fault: null,
        lastSeenAt: null,
      },
  )
  const extra = status.devices.filter((d) => !status.expectedDevices.some((e) => e.deviceId === d.id))
  return [...expected, ...extra]
}
