import {
  type AudioClipRole,
  isAudioClipRole,
  MAX_CLIP_VOLUME,
} from "@/lib/editor/audio-clips"

/**
 * Clip timing for layers: a layer with a `clip` only exists on the timeline
 * between `start` and `end`, fades in/out at its edges, and (for video) plays
 * its source from `sourceIn` instead of looping from zero.
 *
 * Layers without a clip keep the legacy behaviour (always present, video
 * loops), so existing projects render exactly as before.
 */

export interface LayerClip {
  /** Timeline second at which the layer appears. */
  start: number
  /** Timeline second at which the layer disappears (exclusive). */
  end: number
  /** Source second shown at `start` (video/audio trim in-point). */
  sourceIn: number
  /** Seconds of opacity/volume ramp after `start`. */
  fadeIn: number
  /** Seconds of opacity/volume ramp before `end`. */
  fadeOut: number
  /** Video clips: linear gain of the source's own audio (default 1). */
  volume?: number
  /** Video clips: mix role of the source audio (default "ambience"). */
  audioRole?: AudioClipRole | "mute"
}

/** Shortest clip the editor will create by trimming or splitting. */
export const MIN_CLIP_DURATION = 1 / 30

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** Validates untrusted input (saved projects, imports). */
export function normalizeLayerClip(value: unknown): LayerClip | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const start = Math.max(0, finiteOr(record.start, 0))
  const end = finiteOr(record.end, Number.NaN)

  if (!(Number.isFinite(end) && end - start >= MIN_CLIP_DURATION / 2)) {
    return null
  }

  const duration = end - start
  const fadeIn = Math.min(Math.max(0, finiteOr(record.fadeIn, 0)), duration)
  const fadeOut = Math.min(
    Math.max(0, finiteOr(record.fadeOut, 0)),
    duration - fadeIn
  )

  const clip: LayerClip = {
    end,
    fadeIn,
    fadeOut,
    sourceIn: Math.max(0, finiteOr(record.sourceIn, 0)),
    start,
  }

  if (typeof record.volume === "number" && Number.isFinite(record.volume)) {
    clip.volume = Math.min(MAX_CLIP_VOLUME, Math.max(0, record.volume))
  }

  if (record.audioRole === "mute" || isAudioClipRole(record.audioRole)) {
    clip.audioRole = record.audioRole
  }

  return clip
}

export function getClipDuration(clip: LayerClip): number {
  return Math.max(0, clip.end - clip.start)
}

export function isTimeInClip(
  clip: LayerClip | null | undefined,
  time: number
): boolean {
  if (!clip) {
    return true
  }

  return time >= clip.start && time < clip.end
}

/** 0..1 multiplier for opacity (and audio gain) at `time`. */
export function getClipFadeFactor(
  clip: LayerClip | null | undefined,
  time: number
): number {
  if (!clip) {
    return 1
  }

  if (!isTimeInClip(clip, time)) {
    return 0
  }

  let factor = 1

  if (clip.fadeIn > 0) {
    factor = Math.min(factor, (time - clip.start) / clip.fadeIn)
  }

  if (clip.fadeOut > 0) {
    factor = Math.min(factor, (clip.end - time) / clip.fadeOut)
  }

  return Math.min(1, Math.max(0, factor))
}

/** Source media second shown at timeline `time`. */
export function getClipSourceTime(
  clip: LayerClip,
  time: number,
  playbackRate = 1
): number {
  const rate =
    playbackRate > 0 && Number.isFinite(playbackRate) ? playbackRate : 1
  return Math.max(0, clip.sourceIn + (time - clip.start) * rate)
}

export function createClip(
  start: number,
  duration: number,
  sourceIn = 0
): LayerClip {
  const safeStart = Math.max(0, start)

  return {
    end: safeStart + Math.max(MIN_CLIP_DURATION, duration),
    fadeIn: 0,
    fadeOut: 0,
    sourceIn: Math.max(0, sourceIn),
    start: safeStart,
  }
}

/**
 * Splits at `time`. The right half continues the source where the left half
 * stops, so playback across the cut is seamless. Fades stay on the outer
 * edges. Returns null when `time` is not strictly inside the clip.
 */
export function splitClip(
  clip: LayerClip,
  time: number,
  playbackRate = 1
): [LayerClip, LayerClip] | null {
  if (
    time - clip.start < MIN_CLIP_DURATION ||
    clip.end - time < MIN_CLIP_DURATION
  ) {
    return null
  }

  const left: LayerClip = {
    ...clip,
    end: time,
    fadeIn: Math.min(clip.fadeIn, time - clip.start),
    fadeOut: 0,
  }
  const right: LayerClip = {
    ...clip,
    fadeIn: 0,
    fadeOut: Math.min(clip.fadeOut, clip.end - time),
    sourceIn: getClipSourceTime(clip, time, playbackRate),
    start: time,
  }

  return [left, right]
}

/** Moves the whole clip; source trim is unchanged. */
export function moveClip(clip: LayerClip, start: number): LayerClip {
  const safeStart = Math.max(0, start)
  return { ...clip, end: safeStart + getClipDuration(clip), start: safeStart }
}

/**
 * Moves the in-point, keeping the out-point fixed and the footage anchored to
 * the timeline (trimming reveals or hides frames rather than sliding them).
 */
export function trimClipStart(
  clip: LayerClip,
  start: number,
  playbackRate = 1
): LayerClip {
  const rate =
    playbackRate > 0 && Number.isFinite(playbackRate) ? playbackRate : 1
  // Cannot reveal footage before source second 0.
  const earliest = Math.max(0, clip.start - clip.sourceIn / rate)
  const nextStart = Math.min(
    Math.max(earliest, start),
    clip.end - MIN_CLIP_DURATION
  )
  const shift = nextStart - clip.start

  return clampFades({
    ...clip,
    sourceIn: Math.max(0, clip.sourceIn + shift * rate),
    start: nextStart,
  })
}

/** Moves the out-point, keeping the in-point fixed. */
export function trimClipEnd(
  clip: LayerClip,
  end: number,
  maxSourceDuration: number | null = null,
  playbackRate = 1
): LayerClip {
  const rate =
    playbackRate > 0 && Number.isFinite(playbackRate) ? playbackRate : 1
  const latest =
    maxSourceDuration !== null && maxSourceDuration > 0
      ? clip.start + Math.max(0, maxSourceDuration - clip.sourceIn) / rate
      : Number.POSITIVE_INFINITY
  const nextEnd = Math.max(
    clip.start + MIN_CLIP_DURATION,
    Math.min(end, Math.max(latest, clip.start + MIN_CLIP_DURATION))
  )

  return clampFades({ ...clip, end: nextEnd })
}

export function setClipFades(
  clip: LayerClip,
  fadeIn: number,
  fadeOut: number
): LayerClip {
  return clampFades({ ...clip, fadeIn, fadeOut })
}

function clampFades(clip: LayerClip): LayerClip {
  const duration = getClipDuration(clip)
  const fadeIn = Math.min(Math.max(0, clip.fadeIn), duration)
  const fadeOut = Math.min(Math.max(0, clip.fadeOut), duration - fadeIn)
  return { ...clip, fadeIn, fadeOut }
}

/** Latest clip end among layers, or 0. */
export function getClipsEnd(
  layers: readonly { clip?: LayerClip | null }[]
): number {
  let end = 0

  for (const layer of layers) {
    if (layer.clip && layer.clip.end > end) {
      end = layer.clip.end
    }
  }

  return end
}
