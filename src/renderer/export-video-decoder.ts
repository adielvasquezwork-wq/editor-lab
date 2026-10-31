"use client"

/**
 * Sequential WebCodecs frame source for offline (export) rendering.
 *
 * The legacy export path seeks an HTMLVideoElement for every output frame.
 * Each seek makes the browser decode forward from the nearest keyframe, so
 * long-GOP camera/phone footage costs O(GOP) decodes per output frame. This
 * source decodes the track once, in presentation order, and hands back the
 * frame covering each requested time.
 *
 * It is deliberately conservative: anything that could make its output differ
 * from what the video element shows (rotation/flip metadata, HDR transfer,
 * size mismatch, unsupported codec, decode error) makes `open` return null or
 * `frameAt` throw, and the caller falls back to the seek path.
 */

import type {
  Input,
  InputVideoTrack,
  VideoSample,
  VideoSampleSink,
} from "mediabunny"

/** Frames whose timestamp is within this distance after `t` still count. */
const TIMESTAMP_EPSILON_SECONDS = 0.001
/** Jumping further than this forward restarts decoding instead of decoding through. */
const MAX_DECODE_THROUGH_SECONDS = 2

export type ExportVideoFrameSource = {
  dispose: () => void
  /** Returns a frame owned by the caller (close it when done). */
  frameAt: (time: number) => Promise<VideoFrame>
}

type ExpectedSize = { height: number; width: number }

function isHdrTransfer(sample: VideoSample): boolean {
  const transfer = sample.colorSpace?.transfer as string | null | undefined
  return transfer === "pq" || transfer === "hlg"
}

function isCompatibleSample(sample: VideoSample, expected: ExpectedSize) {
  return (
    sample.rotation === 0 &&
    !sample.flip &&
    !isHdrTransfer(sample) &&
    sample.displayWidth === expected.width &&
    sample.displayHeight === expected.height
  )
}

/**
 * Untagged streams are converted with a size-dependent guess (BT.601 vs
 * BT.709) by the <video> element but not necessarily by WebCodecs, which
 * shifts colors visibly. Only take the fast path when the container declares
 * the matrix, so both paths agree exactly; untagged files use the seek path.
 */
async function isTaggedSdrColor(track: InputVideoTrack): Promise<boolean> {
  if (await track.hasHighDynamicRange()) {
    return false
  }

  const colorSpace = await track.getColorSpace()
  return Boolean(
    colorSpace.matrix && colorSpace.primaries && colorSpace.transfer
  )
}

export async function openExportVideoFrameSource(
  url: string,
  expected: ExpectedSize
): Promise<ExportVideoFrameSource | null> {
  if (
    typeof VideoDecoder === "undefined" ||
    typeof VideoFrame === "undefined" ||
    !(expected.width > 0 && expected.height > 0)
  ) {
    return null
  }

  let input: Input | null = null

  try {
    const mediabunny = await import("mediabunny")
    input = new mediabunny.Input({
      formats: mediabunny.ALL_FORMATS,
      source: new mediabunny.UrlSource(url),
    })
    const track = await input.getPrimaryVideoTrack()

    if (
      !track ||
      track.rotation !== 0 ||
      track.displayWidth !== expected.width ||
      track.displayHeight !== expected.height ||
      !(await isTaggedSdrColor(track)) ||
      !(await track.canDecode())
    ) {
      input.dispose()
      return null
    }

    return createSource(new mediabunny.VideoSampleSink(track), input, expected)
  } catch {
    input?.dispose()
    return null
  }
}

function createSource(
  sink: VideoSampleSink,
  input: Input,
  expected: ExpectedSize
): ExportVideoFrameSource {
  let iterator: AsyncGenerator<VideoSample, void, unknown> | null = null
  let current: VideoSample | null = null
  let next: VideoSample | null = null
  let exhausted = false
  let disposed = false

  const closeSample = (sample: VideoSample | null) => {
    try {
      sample?.close()
    } catch {
      // already closed
    }
  }

  const resetIterator = () => {
    const previous = iterator
    iterator = null
    void previous?.return(undefined).catch(() => undefined)
    closeSample(current)
    closeSample(next)
    current = null
    next = null
    exhausted = false
  }

  const restart = (time: number) => {
    resetIterator()
    iterator = sink.samples(Math.max(0, time))
  }

  const pull = async (): Promise<VideoSample | null> => {
    if (exhausted || !iterator) {
      return null
    }

    const result = await iterator.next()

    if (result.done) {
      exhausted = true
      return null
    }

    if (!isCompatibleSample(result.value, expected)) {
      closeSample(result.value)
      throw new Error("Decoded frame does not match the video element.")
    }

    return result.value
  }

  return {
    dispose() {
      disposed = true
      resetIterator()
      input.dispose()
    },

    async frameAt(time) {
      if (disposed) {
        throw new Error("Export video source is disposed.")
      }

      const target = Number.isFinite(time) ? Math.max(0, time) : 0
      const movedBackwards =
        current !== null &&
        target + TIMESTAMP_EPSILON_SECONDS < current.timestamp
      const jumpedForward =
        current !== null &&
        target - current.timestamp > MAX_DECODE_THROUGH_SECONDS

      if (!iterator || movedBackwards || jumpedForward) {
        // samples(t) begins with the frame covering t, so this is exact.
        restart(target)
      }

      for (;;) {
        if (!next) {
          next = await pull()
        }

        if (!next) {
          break
        }

        if (next.timestamp <= target + TIMESTAMP_EPSILON_SECONDS) {
          closeSample(current)
          current = next
          next = null
          continue
        }

        break
      }

      // Target precedes the first decodable frame: show the first frame, as
      // the video element does when seeking before the first timestamp.
      const chosen = current ?? next

      if (!chosen) {
        throw new Error("No decodable frame for the requested time.")
      }

      return chosen.toVideoFrame()
    },
  }
}
