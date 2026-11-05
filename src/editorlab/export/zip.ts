/**
 * Minimal streaming ZIP writer (stored, no compression): PNG frames are
 * already compressed, and "stored" keeps the output byte-identical between
 * runs. Entries carry a fixed timestamp for the same reason.
 */

export interface ByteSink {
  write(bytes: Uint8Array): Promise<void>
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// 2024-01-01 00:00:00 in DOS date/time format.
const DOS_TIME = 0
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1

interface Entry {
  crc: number
  nameBytes: Uint8Array
  offset: number
  size: number
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true)
}

export class ZipWriter {
  private readonly entries: Entry[] = []
  private offset = 0
  private closed = false

  constructor(private readonly sink: ByteSink) {}

  /** Adds one file. Data must be complete (sizes go in the local header). */
  async addFile(name: string, data: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("ZIP already finished.")
    const nameBytes = new TextEncoder().encode(name)
    const crc = crc32(data)
    const header = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(header.buffer)
    u32(view, 0, 0x04034b50)
    u16(view, 4, 20) // version needed
    u16(view, 6, 0x0800) // UTF-8 names
    u16(view, 8, 0) // stored
    u16(view, 10, DOS_TIME)
    u16(view, 12, DOS_DATE)
    u32(view, 14, crc)
    u32(view, 18, data.length)
    u32(view, 22, data.length)
    u16(view, 26, nameBytes.length)
    u16(view, 28, 0)
    header.set(nameBytes, 30)
    this.entries.push({
      crc,
      nameBytes,
      offset: this.offset,
      size: data.length,
    })
    await this.sink.write(header)
    await this.sink.write(data)
    this.offset += header.length + data.length
  }

  /** Writes the central directory. Returns the total size in bytes. */
  async finish(): Promise<number> {
    if (this.closed) throw new Error("ZIP already finished.")
    this.closed = true
    const centralStart = this.offset
    let centralSize = 0

    for (const entry of this.entries) {
      const record = new Uint8Array(46 + entry.nameBytes.length)
      const view = new DataView(record.buffer)
      u32(view, 0, 0x02014b50)
      u16(view, 4, 20)
      u16(view, 6, 20)
      u16(view, 8, 0x0800)
      u16(view, 10, 0)
      u16(view, 12, DOS_TIME)
      u16(view, 14, DOS_DATE)
      u32(view, 16, entry.crc)
      u32(view, 20, entry.size)
      u32(view, 24, entry.size)
      u16(view, 28, entry.nameBytes.length)
      u16(view, 30, 0)
      u16(view, 32, 0)
      u16(view, 34, 0)
      u16(view, 36, 0)
      u32(view, 38, 0)
      u32(view, 42, entry.offset)
      record.set(entry.nameBytes, 46)
      await this.sink.write(record)
      centralSize += record.length
    }

    const end = new Uint8Array(22)
    const view = new DataView(end.buffer)
    u32(view, 0, 0x06054b50)
    u16(view, 4, 0)
    u16(view, 6, 0)
    u16(view, 8, this.entries.length)
    u16(view, 10, this.entries.length)
    u32(view, 12, centralSize)
    u32(view, 16, centralStart)
    u16(view, 20, 0)
    await this.sink.write(end)
    this.offset = centralStart + centralSize + end.length
    return this.offset
  }
}

/** Collects written bytes in memory (for a Blob download). */
export class MemorySink implements ByteSink {
  private readonly chunks: Uint8Array[] = []

  async write(bytes: Uint8Array): Promise<void> {
    this.chunks.push(bytes)
  }

  toBlob(type = "application/zip"): Blob {
    return new Blob(this.chunks as BlobPart[], { type })
  }

  toBytes(): Uint8Array {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of this.chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
}
