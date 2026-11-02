import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from './security.ts'

/** Content-addressed blob storage. Production swaps this for S3/GCS behind the same interface. */
export interface BlobStore {
  put(bytes: Uint8Array): string
  get(sha256: string): Buffer | null
}

export class FsBlobStore implements BlobStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  put(bytes: Uint8Array): string {
    const sha = sha256Hex(bytes)
    const file = join(this.dir, sha)
    if (!existsSync(file)) {
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, bytes)
      renameSync(tmp, file) // atomic: readers never see a partial blob
    }
    return sha
  }

  get(sha256: string): Buffer | null {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null
    const file = join(this.dir, sha256)
    return existsSync(file) ? readFileSync(file) : null
  }
}
