import { MemorySink, ZipWriter } from "./zip"

/** Where exported frames go: a folder on disk or a ZIP. */
export interface FrameSink {
  /** Writes one frame; `index` is the frame number from the export start. */
  write(index: number, blob: Blob): Promise<void>
  /** Finishes writing. Returns a Blob only for in-memory results. */
  finish(): Promise<Blob | null>
  abort(): Promise<void>
}

/** `frame_0000.png`: zero-padded frame index, so name order is time order. */
export function frameFileName(
  prefix: string,
  index: number,
  digits = 4
): string {
  const safe =
    prefix.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "frame"
  return `${safe}_${String(index).padStart(digits, "0")}.png`
}

export interface DirectoryHandleLike {
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<{ createWritable(): Promise<FileSystemWritableFileStream> }>
}

/** Writes each frame as its own file into a picked folder (Chromium). */
export function createDirectorySink(
  directory: DirectoryHandleLike,
  prefix: string
): FrameSink {
  return {
    abort: () => Promise.resolve(),
    finish: () => Promise.resolve(null),
    write: async (index, blob) => {
      const handle = await directory.getFileHandle(
        frameFileName(prefix, index),
        {
          create: true,
        }
      )
      const writable = await handle.createWritable()
      try {
        await writable.write(blob)
      } finally {
        await writable.close()
      }
    },
  }
}

/**
 * Streams a stored ZIP to a file (showSaveFilePicker) or, with no stream,
 * builds it in memory and returns the Blob from finish().
 */
export function createZipSink(
  prefix: string,
  stream: FileSystemWritableFileStream | null
): FrameSink {
  const memory = stream ? null : new MemorySink()
  const writer = new ZipWriter(
    memory ?? {
      write: async (bytes) => {
        // Copy into a plain ArrayBuffer: the stream API rejects SharedArrayBuffer-backed views.
        await stream!.write(new Blob([bytes as BlobPart]))
      },
    }
  )
  return {
    abort: async () => {
      await stream?.abort().catch(() => undefined)
    },
    finish: async () => {
      await writer.finish()
      if (stream) {
        await stream.close()
        return null
      }
      return memory!.toBlob()
    },
    write: async (index, blob) => {
      const buffer = await blob.arrayBuffer()
      await writer.addFile(
        frameFileName(prefix, index),
        new Uint8Array(buffer as ArrayBuffer)
      )
    },
  }
}
