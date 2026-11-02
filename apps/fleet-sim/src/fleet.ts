import { type ProvisioningResponse, ProvisioningResponse as ProvisioningSchema, refKey } from '@studio/schema'
import { LocalBus, LocalShowController } from './bus.ts'
import { type DeviceFaults, SimDevice } from './device.ts'

export interface FleetOptions {
  apiUrl: string
  environmentId: string
  provisioningToken: string
  dataDir?: string
  faults?: Record<string, DeviceFaults>
  log?: (msg: string) => void
}

export interface SimFleet {
  provisioning: ProvisioningResponse
  devices: SimDevice[]
  device(id: string): SimDevice
  stop(): void
}

/** Provision an attraction and boot one simulated controller per device. */
export async function startFleet(opts: FleetOptions): Promise<SimFleet> {
  const res = await fetch(`${opts.apiUrl}/api/v1/fleet/provisioning/${opts.environmentId}`, {
    headers: { 'x-provisioning-token': opts.provisioningToken },
  })
  if (!res.ok) throw new Error(`Provisioning failed: HTTP ${res.status} ${await res.text()}`)
  const provisioning = ProvisioningSchema.parse(await res.json())

  const bus = new LocalBus()
  new LocalShowController(bus, (m) => opts.log?.(`[show-controller] ${m}`))
  const devices = provisioning.devices.map((device) => {
    const definition = device.characterRef ? provisioning.characters[refKey(device.characterRef)] : undefined
    const sim = new SimDevice({
      apiUrl: opts.apiUrl,
      environmentId: opts.environmentId,
      device,
      localLimits:
        definition?.joints.map(({ name, type, min, max, home, maxVelocity }) => ({
          name,
          type,
          min,
          max,
          home,
          maxVelocity,
        })) ?? null,
      publicKeyPem: provisioning.signingPublicKeyPem,
      bus,
      ...(opts.dataDir ? { dataDir: opts.dataDir } : {}),
      ...(opts.faults?.[device.deviceId] ? { faults: opts.faults[device.deviceId] } : {}),
      ...(opts.log ? { log: opts.log } : {}),
    })
    sim.start()
    return sim
  })
  return {
    provisioning,
    devices,
    device: (id) => {
      const d = devices.find((x) => x.id === id)
      if (!d) throw new Error(`No simulated device "${id}"`)
      return d
    },
    stop: () => {
      for (const d of devices) d.stop()
    },
  }
}
