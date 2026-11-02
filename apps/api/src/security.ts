import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
  timingSafeEqual,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Role, type User } from '@studio/schema'
import { z } from 'zod'

export const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

// ---- user sessions (HMAC-signed, stateless; stand-in for OIDC tokens) ------------

const Session = z.object({ name: z.string(), roles: z.array(Role), exp: z.number() })

export function issueSession(secret: string, user: User, ttlMs = 12 * 3600_000): string {
  const payload = b64url(JSON.stringify({ ...user, exp: Date.now() + ttlMs }))
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

export function verifySession(secret: string, token: string): User | null {
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null
  if (!safeEqual(mac, createHmac('sha256', secret).update(payload).digest('base64url'))) return null
  const parsed = Session.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  if (!parsed.success || parsed.data.exp < Date.now()) return null
  return { name: parsed.data.name, roles: parsed.data.roles }
}

// ---- device credentials ------------------------------------------------------------

export const deviceToken = (secret: string, environmentId: string, deviceId: string): string =>
  createHmac('sha256', secret).update(`${environmentId}/${deviceId}`).digest('base64url')

export const verifyDeviceToken = (secret: string, environmentId: string, deviceId: string, token: string): boolean =>
  safeEqual(token, deviceToken(secret, environmentId, deviceId))

export const verifySecret = safeEqual

// ---- bundle signing ----------------------------------------------------------------

export interface Signer {
  publicKeyPem: string
  /** Base64 RSA-SHA256 (PKCS#1 v1.5) signature, verifiable by Node, .NET and Godot's Crypto. */
  sign(bytes: Uint8Array): string
}

export function loadSigner(opts: { pem?: string; dataDir: string; ephemeral?: boolean }): Signer {
  let key: KeyObject
  if (opts.pem) {
    key = createPrivateKey(opts.pem)
  } else if (opts.ephemeral) {
    key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  } else {
    const dir = join(opts.dataDir, 'keys')
    const file = join(dir, 'signing.pem')
    if (!existsSync(file)) {
      mkdirSync(dir, { recursive: true })
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
      writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
    }
    key = createPrivateKey(readFileSync(file))
  }
  const publicKeyPem = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
  return { publicKeyPem, sign: (bytes) => sign('sha256', bytes, key).toString('base64') }
}
