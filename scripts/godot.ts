/**
 * Runs the Godot simulator (apps/godot-sim) or its conformance tests.
 * Finds Godot 4 via $GODOT, `godot`/`godot4` on PATH, or the default macOS app.
 *
 *   bun run sim:godot                                  # window, against http://localhost:4000
 *   bun run sim:godot --env dragons-lair --api http://host:4000
 *   bun run sim:godot --env dragons-lair --env burrow-hollow   # one window per attraction
 *   bun run sim:godot --headless                       # no window (CI, servers)
 *   bun run test:godot                                 # conformance vectors, headless
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const godotProject = resolve(import.meta.dirname, '../apps/godot-sim')

export function findGodot(): string {
  const candidates = [
    process.env.GODOT,
    Bun.which('godot'),
    Bun.which('godot4'),
    '/Applications/Godot.app/Contents/MacOS/Godot',
  ]
  const found = candidates.find((c): c is string => !!c && existsSync(c))
  if (!found) {
    throw new Error(
      'Godot 4 not found. Install it (https://godotengine.org/download, or `brew install --cask godot`) ' +
        'or point GODOT at the binary.',
    )
  }
  return found
}

const ENGINE_FLAGS = new Set(['--headless', '--verbose'])
const ENGINE_OPTIONS = new Set(['--position', '--resolution'])

/** Engine flags go before `--`; everything else is a simulator option (see apps/godot-sim/scripts/main.gd). */
export function godotArgs(mode: 'run' | 'test', options: string[] = []): string[] {
  if (mode === 'test') return ['--headless', '--path', godotProject, '--script', 'res://tests/run_tests.gd']
  const engine: string[] = []
  const sim: string[] = []
  for (let i = 0; i < options.length; i++) {
    const a = options[i] as string
    if (ENGINE_FLAGS.has(a)) engine.push(a)
    else if (ENGINE_OPTIONS.has(a)) engine.push(a, options[++i] ?? '')
    else if (a !== '--') sim.push(a)
  }
  return [...engine, '--path', godotProject, '--', ...sim]
}

/** Pulls every `--env` out of the options (repeatable or comma-separated): one Godot runs per attraction. */
export function splitEnvironments(options: string[]): { environments: string[]; rest: string[] } {
  const environments: string[] = []
  const rest: string[] = []
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--env') environments.push(...(options[++i] ?? '').split(',').filter(Boolean))
    else rest.push(options[i] as string)
  }
  return { environments, rest }
}

/** Prefixes every line of a child's output, so several simulators can share one terminal. */
function prefixLines(stream: NodeJS.ReadableStream, prefix: string, out: NodeJS.WriteStream) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) out.write(`${prefix} ${line}\n`)
  })
}

if (import.meta.main) {
  const [mode = 'run', ...options] = process.argv.slice(2)
  if (mode !== 'run' && mode !== 'test') throw new Error(`Unknown mode "${mode}" (use run or test)`)
  const { environments, rest } = mode === 'run' ? splitEnvironments(options) : { environments: [], rest: options }
  const runs = environments.length ? environments : [null]
  const several = runs.length > 1
  const children = runs.map((env, i) => {
    // Cascade the windows so every title bar (named after its attraction) stays visible.
    const window = several && !rest.includes('--headless') ? ['--position', `${60 + i * 60},${60 + i * 60}`] : []
    const args = godotArgs(mode, [...window, ...rest, ...(env ? ['--env', env] : [])])
    const child = spawn(findGodot(), args, { stdio: several ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
    if (several && child.stdout && child.stderr) {
      prefixLines(child.stdout, `[${env}]`, process.stdout)
      prefixLines(child.stderr, `[${env}]`, process.stderr)
    }
    return child
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      for (const c of children) c.kill(signal)
    })
  // Stay up while any simulator runs; exit with the first failure.
  let running = children.length
  let failure = 0
  for (const child of children)
    child.on('exit', (code, signal) => {
      if (!failure && (code || signal)) failure = code || 1
      if (--running === 0) process.exit(failure)
    })
}
