/**
 * Writes the published contract artifacts to /contracts. CI regenerates them and
 * fails if the committed copies differ, so contract changes are always reviewed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAsyncApi, buildOpenApi, componentSchemas } from '../src/openapi.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts')
const write = (file: string, data: unknown) => {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
  console.log('wrote', path)
}

write('openapi.json', buildOpenApi())
write('asyncapi.json', buildAsyncApi())
const schemas = componentSchemas()
for (const id of ['CharacterDefinition', 'EnvironmentDefinition', 'ShowDefinition', 'ShowBundle']) {
  write(`json-schema/${id}.json`, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${id}.json`,
    ...schemas[id],
    components: { schemas },
  })
}
