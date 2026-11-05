/** Project frame rate: frame stepping, timecode and stepped-timing defaults. */

export const FRAME_RATE_OPTIONS = [24, 25, 30] as const
export const DEFAULT_FRAME_RATE = 24

export function normalizeFrameRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(240, Math.max(1, value))
    : DEFAULT_FRAME_RATE
}

// Export times are frameIndex / fps; guard against 0.99999… flooring down.
const FRAME_EPSILON = 1e-6

/** Frame index that is showing at `time`. */
export function timeToFrame(time: number, fps: number): number {
  return Math.max(0, Math.floor(time * fps + FRAME_EPSILON))
}

export function frameToTime(frame: number, fps: number): number {
  return Math.max(0, frame) / fps
}

/** Time of the frame `delta` frames away from the one showing at `time`. */
export function stepFrameTime(
  time: number,
  fps: number,
  delta: number
): number {
  return frameToTime(timeToFrame(time, fps) + delta, fps)
}

/** `m:ss:ff` timecode (hours added above 59 minutes). */
export function formatTimecode(time: number, fps: number): string {
  const frame = timeToFrame(Math.max(0, time), fps)
  const framesPerSecond = Math.max(1, Math.round(fps))
  const totalSeconds = Math.floor(frame / framesPerSecond)
  const frames = frame - totalSeconds * framesPerSecond
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, "0")
  const base = `${minutes}:${pad(seconds)}:${pad(frames)}`
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
    : base
}
