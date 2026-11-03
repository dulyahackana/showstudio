import { parseArgs } from 'node:util'
import { startFleet } from './fleet.ts'

const { values } = parseArgs({
  options: {
    api: { type: 'string', default: process.env.STUDIO_API_URL ?? 'http://localhost:4000' },
    // Repeat --env to run several attractions side by side, each with its own controllers.
    env: { type: 'string', multiple: true, default: (process.env.STUDIO_ENVIRONMENT ?? 'dragons-lair').split(',') },
    token: { type: 'string', default: process.env.PROVISIONING_TOKEN ?? 'dev-provisioning-token' },
    data: { type: 'string', default: process.env.FLEET_DATA_DIR ?? './data/fleet-sim' },
    corrupt: { type: 'string', multiple: true, default: [] },
    'outdated-firmware': { type: 'string', multiple: true, default: [] },
    quiet: { type: 'boolean', default: false },
  },
})

const stamp = () => new Date().toISOString().slice(11, 23)
const log = (msg: string) => console.log(`${stamp()} ${msg}`)

const faults: Record<string, { corruptDownloads?: boolean; characterRef?: { id: string; revision: number } }> = {}
for (const id of values.corrupt) faults[id] = { ...faults[id], corruptDownloads: true }
for (const id of values['outdated-firmware'])
  faults[id] = { ...faults[id], characterRef: { id: 'outdated', revision: 1 } }

const fleets = await Promise.all(
  values.env.map(async (environmentId) => {
    const fleet = await startFleet({
      apiUrl: values.api,
      environmentId,
      provisioningToken: values.token,
      dataDir: values.data,
      faults,
      log: (msg) => log(values.env.length > 1 ? `{${environmentId}} ${msg}` : msg),
    })
    log(
      `simulating ${fleet.devices.length} devices for ${environmentId}@${fleet.provisioning.environment.revision}: ${fleet.devices
        .map((d) => `${d.id}(${d.kind})`)
        .join(', ')}`,
    )
    return fleet
  }),
)
const devices = fleets.flatMap((f) => f.devices)

if (!values.quiet) {
  setInterval(() => {
    const running = devices.filter((d) => d.state === 'running')
    if (running.length === 0) return
    const parts = running
      .filter((d) => d.kind === 'doll' || d.kind === 'light')
      .map((d) =>
        d.kind === 'doll'
          ? `${d.id} ${Object.entries(d.pose)
              .map(([j, v]) => `${j}=${v.toFixed(0)}`)
              .join(' ')}`
          : `${d.id} ${d.light ? `I=${d.light.intensity.toFixed(2)}` : 'off'}`,
      )
    log(`▶ ${parts.join(' | ')}`)
  }, 1000).unref()
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const f of fleets) f.stop()
    process.exit(0)
  })
}
