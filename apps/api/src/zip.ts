import { crc32 } from 'node:zlib'

/*
 * Minimal zip (stored entries, no compression): enough for offline packages, whose
 * largest files are already-compressed audio. Deterministic: fixed timestamps, so the
 * same files always produce the same bytes.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const DOS_DATE = (1 << 5) | 1 // 1980-01-01
const UTF8 = 1 << 11

export function zip(entries: readonly ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = Buffer.from(e.data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(UTF8, 6)
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, data)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4) // made by
    dir.writeUInt16LE(20, 6) // version needed
    dir.writeUInt16LE(UTF8, 8)
    dir.writeUInt16LE(0, 10)
    dir.writeUInt16LE(0, 12)
    dir.writeUInt16LE(DOS_DATE, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(data.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)
    offset += local.length + name.length + data.length
  }
  const dirBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dirBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dirBytes, end])
}

/** Reads a zip written by `zip` (stored entries only); checks every CRC. */
export function unzip(bytes: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(bytes)
  const out = new Map<string, Buffer>()
  let at = 0
  while (buf.readUInt32LE(at) === 0x04034b50) {
    if (buf.readUInt16LE(at + 8) !== 0) throw new Error('compressed entries are not supported')
    const crc = buf.readUInt32LE(at + 14)
    const size = buf.readUInt32LE(at + 18)
    const nameLength = buf.readUInt16LE(at + 26)
    const extra = buf.readUInt16LE(at + 28)
    const name = buf.toString('utf8', at + 30, at + 30 + nameLength)
    const start = at + 30 + nameLength + extra
    const data = buf.subarray(start, start + size)
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`)
    out.set(name, data)
    at = start + size
  }
  return out
}
