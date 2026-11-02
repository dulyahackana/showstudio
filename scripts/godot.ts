/**
 * Runs the Godot simulator (apps/godot-sim) or its conformance tests.
 * Finds Godot 4 via $GODOT, `godot`/`godot4` on PATH, or the default macOS app.
 *
 *   bun run sim:godot                                  # window, against http://localhost:4000
 *   bun run sim:godot --env dragons-lair --api http://host:4000
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

/** Engine flags go before `--`; everything else is a simulator option (see apps/godot-sim/scripts/main.gd). */
export function godotArgs(mode: 'run' | 'test', options: string[] = []): string[] {
  if (mode === 'test') return ['--headless', '--path', godotProject, '--script', 'res://tests/run_tests.gd']
  const engine = options.filter((a) => ENGINE_FLAGS.has(a))
  const sim = options.filter((a) => !ENGINE_FLAGS.has(a) && a !== '--')
  return [...engine, '--path', godotProject, '--', ...sim]
}

if (import.meta.main) {
  const [mode = 'run', ...options] = process.argv.slice(2)
  if (mode !== 'run' && mode !== 'test') throw new Error(`Unknown mode "${mode}" (use run or test)`)
  const child = spawn(findGodot(), godotArgs(mode, options), { stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal))
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}
