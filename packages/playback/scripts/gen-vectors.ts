import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalJson } from '../src/canonical.ts'
import { compileBundle } from '../src/compile.ts'
import { characters, lab, makeShow } from '../src/fixtures.ts'
import { buildVectors } from '../src/vectors.ts'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-vectors')
const file = resolve(dir, 'playback.json')
writeFileSync(file, `${JSON.stringify(buildVectors(), null, 1)}\n`)
console.log('wrote', file)

/*
 * Signature interop vector: real bundle bytes signed exactly like the studio signs
 * them (RSA-SHA256, PKCS#1 v1.5, SPKI PEM public key). RSA keys are random, so the
 * file is generated once and kept while it still verifies; the private key is discarded.
 */
const sigFile = resolve(dir, 'signature.json')
const current = existsSync(sigFile) ? JSON.parse(readFileSync(sigFile, 'utf8')) : null
const stillValid =
  current &&
  verify(
    'sha256',
    Buffer.from(current.message, 'base64'),
    current.publicKeyPem,
    Buffer.from(current.signature, 'base64'),
  )
if (!stillValid) {
  const message = Buffer.from(
    canonicalJson(
      compileBundle({
        show: { id: 'demo', revision: 1 },
        definition: makeShow(),
        environment: lab,
        characters,
        assetPath: (id) => `/api/v1/assets/${id}`,
      }),
    ),
  )
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const vector = {
    description: 'RSA-SHA256 (PKCS#1 v1.5) over bundle bytes. Every device implementation must accept it.',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    message: message.toString('base64'),
    signature: sign('sha256', message, privateKey).toString('base64'),
  }
  writeFileSync(sigFile, `${JSON.stringify(vector, null, 1)}\n`)
  console.log('wrote', sigFile)
}
