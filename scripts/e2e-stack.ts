/**
 * Boots a throwaway stack for end-to-end tests: API on a fresh data dir, seed,
 * simulated fleet, editor dev server. Playwright waits for :5173 and kills this
 * process (and its children) when done.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dataDir = mkdtempSync(join(tmpdir(), 'studio-e2e-'))
const children: ChildProcess[] = []
const bun = process.execPath

const run = (cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (stopping || (code === 0 && args.includes('scripts/seed.ts'))) return
    console.error(`e2e stack: ${[cmd, ...args].join(' ')} exited (code ${code}, signal ${signal})`)
    stop(1)
  })
  return child
}

let stopping = false
const stop = (code = 0) => {
  stopping = true
  for (const c of children) c.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

async function waitFor(url: string, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${url} did not come up`)
}

run(bun, ['src/server.ts'], join(root, 'apps/api'), { DATA_DIR: dataDir, LOG_LEVEL: 'warn', LAUNCH_LEAD_MS: '1500' })
await waitFor('http://localhost:4000/api/v1/health')
await new Promise<void>((done, fail) =>
  run(bun, ['scripts/seed.ts'], root).on('exit', (code) =>
    code === 0 ? done() : fail(new Error(`seed exited ${code}`)),
  ),
)
run(
  bun,
  [
    'apps/fleet-sim/src/main.ts',
    '--env',
    'dragons-lair',
    '--env',
    'burrow-hollow',
    '--data',
    join(dataDir, 'fleet'),
    '--quiet',
  ],
  root,
)
run(bun, ['--bun', 'x', 'vite', '--port', '5173', '--strictPort'], join(root, 'apps/editor'))
await waitFor('http://localhost:5173')
console.log(`e2e stack ready (data: ${dataDir})`)
