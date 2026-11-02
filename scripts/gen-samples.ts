/**
 * Generates the procedural parts of /samples: audio clips and the JSON joint definitions
 * of the sample figures (the import demo). The models themselves are CC0 assets prepared by
 * scripts/prepare-assets.ts. Run with `bun run gen:samples`. Output is byte-identical
 * on every run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FIGURES } from './samples.ts'

const out = resolve(import.meta.dirname, '../samples')
mkdirSync(join(out, 'audio'), { recursive: true })

for (const f of FIGURES) {
  const file = join(out, `${f.id}.json`)
  writeFileSync(file, `${JSON.stringify({ joints: f.joints }, null, 2)}\n`)
  console.log('wrote', file)
}

const RATE = 22050

function writeWav(name: string, seconds: number, sample: (t: number) => number) {
  const n = Math.floor(seconds * RATE)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, sample(i / RATE)))
    buf.writeInt16LE(Math.round(v * 30000), 44 + i * 2)
  }
  const file = join(out, 'audio', name)
  writeFileSync(file, buf)
  console.log('wrote', file)
}

// Deterministic pseudo-noise so regenerated files are byte-identical.
let seed = 42
const noise = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed / 0x7fffffff) * 2 - 1
}
const sin = (f: number, t: number) => Math.sin(2 * Math.PI * f * t)
/** Plucked string: harmonics with a fast decay (harp / lute). */
const pluck = (f: number, t: number) =>
  t < 0 ? 0 : (sin(f, t) + 0.5 * sin(2 * f, t) + 0.25 * sin(3 * f, t)) * Math.exp(-t * 2.6) * 0.28

// Dragon roar: a low growl that rises into a breathy rumble.
let lp = 0
writeWav('roar.wav', 2.4, (t) => {
  const env = Math.min(1, t * 5) * Math.exp(-t * 1.1)
  const f = 55 + 35 * Math.sin(t * 3.2) + 20 * t
  const growl = Math.sign(sin(f, t)) * 0.4 + sin(f * 0.5, t) * 0.4
  lp += (noise() - lp) * 0.08
  return env * (0.6 * growl + 0.9 * lp) * (1 + 0.3 * sin(23, t))
})

// Coins: a spill of short, bright metallic clinks.
writeWav('coins.wav', 1.6, (t) => {
  let v = 0
  for (let k = 0; k < 14; k++) {
    const s = t - (0.05 + k * 0.09 + 0.03 * Math.sin(k * 7.3))
    if (s < 0 || s > 0.25) continue
    const f = 2400 + 900 * Math.sin(k * 3.7)
    v += (sin(f, s) + 0.6 * sin(f * 2.76, s) + 0.3 * sin(f * 5.4, s)) * Math.exp(-s * 28) * 0.18
  }
  return v
})

// Wizard's staff: a shimmering upward sweep with a soft bell on top.
writeWav('magic.wav', 2.2, (t) => {
  const env = Math.min(1, t * 3) * Math.exp(-t * 1.2)
  const sweep = sin(300 + 900 * Math.min(1, t / 1.2) ** 2, t) * 0.25
  const shimmer = [1046.5, 1318.5, 1568, 2093].reduce(
    (a, f, i) => a + sin(f, t) * 0.08 * (1 + Math.sin(t * (9 + i * 2))),
    0,
  )
  return env * (sweep + shimmer) + pluck(1568, t - 0.9) * 0.8
})

// Theme: a D-minor harp ballad over a low drone.
const melody = [62, 65, 69, 67, 65, 64, 62, 60, 62, 65, 69, 72, 70, 69, 67, 69]
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)
writeWav('theme.wav', 16, (t) => {
  const beat = 0.5
  const i = Math.floor(t / beat)
  const note = melody[i % melody.length] ?? 62
  const prev = melody[(i - 1 + melody.length) % melody.length] ?? 62
  const drone = 0.08 * sin(midi(38), t) + 0.05 * sin(midi(45), t) + 0.03 * sin(midi(50), t)
  const harp = pluck(midi(note), t - i * beat) + 0.35 * pluck(midi(note - 12), t - i * beat)
  const echo = 0.3 * pluck(midi(prev), t - i * beat + 0.25)
  const swell = 0.06 * sin(midi(50 + (Math.floor(t / 4) % 2 ? 3 : 0)), t) * (0.5 + 0.5 * Math.sin(t * 0.8))
  const fade = Math.min(1, t / 1.5, (16 - t) / 2)
  return fade * (drone + harp + echo + swell)
})

// Chime: three bell strikes (the guest bell).
writeWav('chime.wav', 1.6, (t) =>
  [659.25, 783.99, 1046.5].reduce((acc, f, k) => {
    const s = t - k * 0.2
    return s < 0 ? acc : acc + 0.3 * (sin(f, s) + 0.4 * sin(f * 2.4, s)) * Math.exp(-s * 2.8)
  }, 0),
)
