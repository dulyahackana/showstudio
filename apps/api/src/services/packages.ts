import { createHash, createPublicKey } from 'node:crypto'
import { type PackageManifest, type RevisionDetail, ShowBundle } from '@studio/schema'
import { zip } from '../zip.ts'

/*
 * Offline install package of an approved show revision: what a field technician
 * carries to a controller the fleet manager cannot reach (or keeps as the release
 * archive). Deterministic: the same revision always gives the same bytes.
 */

export interface PackageInput {
  revision: Extract<RevisionDetail, { kind: 'show' }>
  /** Exact signed bundle bytes and their signature. */
  bundle: { body: string; signature: string }
  assets: { id: string; mime: string; bytes: Uint8Array }[]
  publicKeyPem: string
}

const EXTENSION: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' }

export const packageFileName = (showId: string, revision: number) => `${showId}-r${revision}.zip`

export function buildPackage({ revision, bundle, assets, publicKeyPem }: PackageInput): Buffer {
  const compiled = ShowBundle.parse(JSON.parse(bundle.body))
  const sha256 = createHash('sha256').update(bundle.body).digest('hex')
  const keyDer = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  const files = assets
    .map((a) => ({ ...a, path: `audio/${a.id}.${EXTENSION[a.mime] ?? 'bin'}` }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const manifest: PackageManifest = {
    format: 'show-studio-package',
    formatVersion: 1,
    show: compiled.show,
    environment: compiled.environment,
    bundle: {
      path: 'bundle.json',
      sha256,
      signaturePath: 'bundle.sig',
      signature: bundle.signature,
      signingKeySha256: createHash('sha256').update(keyDer).digest('hex'),
    },
    published: { by: revision.publishedBy, at: revision.publishedAt, note: revision.note },
    approved: { by: revision.reviewedBy ?? '', at: revision.reviewedAt ?? '', note: revision.reviewNote ?? '' },
    devices: Object.entries(compiled.devices)
      .map(([deviceId, p]) => ({ deviceId, kind: p.kind }))
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
    assets: files.map((f) => ({ id: f.id, path: f.path, mime: f.mime, size: f.bytes.length })),
  }
  const text = (s: string) => new TextEncoder().encode(s)
  return zip([
    { name: 'README.txt', data: text(readme(manifest)) },
    { name: 'manifest.json', data: text(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'bundle.json', data: text(bundle.body) },
    { name: 'bundle.sig', data: text(bundle.signature) },
    { name: 'show.json', data: text(`${JSON.stringify(revision.content, null, 2)}\n`) },
    ...files.map((f) => ({ name: f.path, data: f.bytes })),
  ])
}

function readme(m: PackageManifest): string {
  return `${m.show.name}, revision ${m.show.revision}
Offline install package from Show Studio, for ${m.environment.id} (layout r${m.environment.revision}).
Published by ${m.published.by} (${m.published.at}). Safety-approved by ${m.approved.by} (${m.approved.at}).

  bundle.json    the signed show bundle, byte for byte what the fleet manager deploys
  bundle.sig     the studio's RSA-SHA256 signature of bundle.json (base64), made at approval
  audio/         audio for the speakers, each file named by its SHA-256
  show.json      the show definition this revision was compiled from (for reference)
  manifest.json  what is in here: show, attraction, approval, devices, files

A controller installs it only after the same checks as a network deploy:
  1. SHA-256 of bundle.json is ${m.bundle.sha256}
  2. bundle.sig verifies with the studio key the controller has pinned
     (never with a key that comes with a package)
  3. bundle.json matches the ShowBundle schema, version 1
  4. the bundle has a payload for this controller, for the character revision it
     runs, within the joint limits the controller holds itself
  5. every audio file's SHA-256 matches its name
Then it stages the show atomically. While a controller is connected, the fleet
manager stays the source of truth and removes shows it did not deploy there.

Check by hand (macOS / Linux), with the studio public key saved as studio-key.pem
(GET /api/v1/fleet/signing-key, field publicKeyPem; its SPKI SHA-256 is
${m.bundle.signingKeySha256}):
  shasum -a 256 bundle.json
  base64 -d < bundle.sig > bundle.sig.bin
  openssl dgst -sha256 -verify studio-key.pem -signature bundle.sig.bin bundle.json
`
}
