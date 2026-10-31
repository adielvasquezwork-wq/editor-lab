/**
 * Plans the timeline audio mix: which source plays when, from where, and at
 * what gain (volume x fades x ducking). Pure, so preview playback and export
 * render the same mix.
 */

import {
  type AudioClip,
  type AudioClipRole,
  type AudioDucking,
  dbToGain,
} from "@/lib/editor/audio-clips"
import { getClipFadeFactor, type LayerClip } from "@/lib/editor/clip"
import type { EditorAsset, EditorLayer } from "@/types/editor"

export interface MixSegment {
  fadeIn: number
  fadeOut: number
  /** Stable identity (clip or layer id) for scheduling diffs. */
  key: string
  playbackRate: number
  role: AudioClipRole
  sourceIn: number
  timelineEnd: number
  timelineStart: number
  url: string
  volume: number
}

export interface GainPoint {
  gain: number
  time: number
}

export function planAudioMix(input: {
  assets: readonly EditorAsset[]
  audioClips?: readonly AudioClip[] | null
  layers: readonly EditorLayer[]
}): MixSegment[] {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const segments: MixSegment[] = []

  for (const clip of input.audioClips ?? []) {
    const asset = assetById.get(clip.assetId)

    if (!asset?.url || clip.volume <= 0 || asset.status === "error") {
      continue
    }

    segments.push({
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      key: `audio:${clip.id}`,
      playbackRate: 1,
      role: clip.role,
      sourceIn: clip.sourceIn,
      timelineEnd: clip.end,
      timelineStart: clip.start,
      url: asset.url,
      volume: clip.volume,
    })
  }

  for (const layer of input.layers) {
    const clip = layer.clip
    // Only clipped video layers carry audio: legacy (looping) video layers
    // stay silent exactly as before.
    if (
      !clip ||
      layer.type !== "video" ||
      !layer.visible ||
      layer.unavailableLayer ||
      !layer.assetId ||
      clip.audioRole === "mute"
    ) {
      continue
    }

    const asset = assetById.get(layer.assetId)
    const volume = clip.volume ?? 1

    if (!asset?.url || asset.kind !== "video" || volume <= 0) {
      continue
    }

    const rate = layer.params.playbackRate

    segments.push({
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      key: `layer:${layer.id}`,
      playbackRate: typeof rate === "number" && rate > 0 ? rate : 1,
      role: clip.audioRole ?? "ambience",
      sourceIn: clip.sourceIn,
      timelineEnd: clip.end,
      timelineStart: clip.start,
      url: asset.url,
      volume,
    })
  }

  return segments.sort((a, b) => a.timelineStart - b.timelineStart)
}

/** Merged [start, end) intervals where any dialogue segment plays. */
export function getDialogueIntervals(
  segments: readonly MixSegment[]
): [number, number][] {
  const intervals = segments
    .filter((segment) => segment.role === "dialogue")
    .map(
      (segment) =>
        [segment.timelineStart, segment.timelineEnd] as [number, number]
    )
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []

  for (const interval of intervals) {
    const last = merged.at(-1)

    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1])
    } else {
      merged.push([...interval])
    }
  }

  return merged
}

function asLayerClip(segment: MixSegment): LayerClip {
  return {
    end: segment.timelineEnd,
    fadeIn: segment.fadeIn,
    fadeOut: segment.fadeOut,
    sourceIn: segment.sourceIn,
    start: segment.timelineStart,
  }
}

/** Duck multiplier at `time` (1 = no duck). */
function getDuckFactor(
  time: number,
  intervals: readonly [number, number][],
  ducking: AudioDucking
): number {
  const floor = dbToGain(ducking.amountDb)
  const ramp = ducking.rampSeconds
  let depth = 0 // 0 = no duck, 1 = full duck

  for (const [start, end] of intervals) {
    if (time >= start && time < end) {
      return floor
    }

    if (time >= start - ramp && time < start) {
      depth = Math.max(depth, 1 - (start - time) / ramp)
    } else if (time >= end && time < end + ramp) {
      depth = Math.max(depth, 1 - (time - end) / ramp)
    }
  }

  return 1 + (floor - 1) * depth
}

export function getSegmentGain(
  segment: MixSegment,
  time: number,
  intervals: readonly [number, number][],
  ducking: AudioDucking | null
): number {
  const base = segment.volume * getClipFadeFactor(asLayerClip(segment), time)

  if (!ducking?.enabled || segment.role === "dialogue" || base === 0) {
    return base
  }

  return base * getDuckFactor(time, intervals, ducking)
}

/**
 * Gain automation for a segment as breakpoints (linear ramps between them),
 * sampled at every fade and duck edge so the curve is exact at the corners.
 */
export function buildGainEnvelope(
  segment: MixSegment,
  intervals: readonly [number, number][],
  ducking: AudioDucking | null
): GainPoint[] {
  const start = segment.timelineStart
  const end = segment.timelineEnd
  const times = new Set<number>([
    start,
    end,
    start + segment.fadeIn,
    end - segment.fadeOut,
  ])

  if (ducking?.enabled && segment.role !== "dialogue") {
    for (const [dStart, dEnd] of intervals) {
      for (const t of [
        dStart - ducking.rampSeconds,
        dStart,
        dEnd,
        dEnd + ducking.rampSeconds,
      ]) {
        times.add(t)
      }
    }
  }

  const sorted = [...times]
    .filter((t) => t >= start && t <= end)
    .sort((a, b) => a - b)

  return sorted.map((time) => ({
    // The clip's end is exclusive; ramp to its final value just before it.
    gain: getSegmentGain(
      segment,
      time === end ? end - 1e-6 : time,
      intervals,
      ducking
    ),
    time,
  }))
}
