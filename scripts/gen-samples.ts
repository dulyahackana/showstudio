/**
 * Generates the JSON joint definitions of the sample figures (the import demo). The models
 * are CC0 assets prepared by scripts/prepare-assets.ts and the sounds are CC0 / public-domain
 * recordings cut by scripts/prepare-audio.ts. Run with `bun run gen:samples`. Output is
 * byte-identical on every run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FIGURES } from './samples.ts'

const out = resolve(import.meta.dirname, '../samples')
mkdirSync(out, { recursive: true })

for (const f of FIGURES) {
  const file = join(out, `${f.id}.json`)
  writeFileSync(file, `${JSON.stringify({ joints: f.joints }, null, 2)}\n`)
  console.log('wrote', file)
}
