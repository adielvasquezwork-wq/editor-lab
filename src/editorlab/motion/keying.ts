import {
  HOUSE_EASING,
  type KeyframeEasing,
  LINEAR_EASING,
} from "@/lib/easing-curve"
import { frameToTime, timeToFrame } from "@/editorlab/timing/frame-rate"
import { useLayerStore } from "@/store/layer-store"
import { createParamBinding, useTimelineStore } from "@/store/timeline-store"
import type { ParameterValue } from "@/types/editor"

/**
 * Motion keying helpers (handoff T7): one click writes the keyframes for a
 * whip blur or a light-leak transition around the playhead, at the project
 * frame rate. Everything stays ordinary keyframes you can edit afterwards.
 */

interface KeySpec {
  easing: KeyframeEasing
  frame: number
  value: ParameterValue
}

function writeKeys(layerId: string, paramKey: string, keys: KeySpec[]): number {
  const layer = useLayerStore.getState().getLayerById(layerId)
  if (!layer) return 0
  const binding = createParamBinding(layer, paramKey)
  if (!binding) return 0
  const timeline = useTimelineStore.getState()
  const fps = timeline.frameRate
  let written = 0

  for (const key of keys) {
    const time = frameToTime(Math.max(0, key.frame), fps)
    if (time > timeline.duration) continue
    timeline.upsertKeyframe({ binding, layerId, time, value: key.value })
    const track = useTimelineStore
      .getState()
      .getTrackForBinding(layerId, binding)
    const keyframe = track?.keyframes.find(
      (entry) => Math.abs(entry.time - time) <= 1 / 240
    )
    if (track && keyframe) {
      useTimelineStore
        .getState()
        .setKeyframeEasing(track.id, keyframe.id, key.easing)
      written += 1
    }
  }

  return written
}

export interface WhipOptions {
  /** Peak blur strength (directional-blur `strength`, 0-96). */
  peak?: number
  /** Frames from zero to the peak and from the peak back to zero. */
  rampFrames?: number
}

/**
 * Whip blur around the playhead: 0 → peak → 0 on a directional-blur
 * layer. The peak lands one frame before the playhead, so a cut placed on
 * the playhead "lands on the frame after the peak" (ref C1).
 */
export function keyWhipAtPlayhead(
  layerId: string,
  options: WhipOptions = {}
): number {
  const peak = Math.min(96, Math.max(0, options.peak ?? 40))
  const ramp = Math.max(1, Math.round(options.rampFrames ?? 6))
  const timeline = useTimelineStore.getState()
  const cut = timeToFrame(timeline.currentTime, timeline.frameRate)
  const peakFrame = Math.max(0, cut - 1)
  return writeKeys(layerId, "strength", [
    { easing: HOUSE_EASING, frame: Math.max(0, peakFrame - ramp), value: 0 },
    { easing: HOUSE_EASING, frame: peakFrame, value: peak },
    { easing: HOUSE_EASING, frame: peakFrame + ramp, value: 0 },
  ])
}

export interface LeakOptions {
  /** Total frames for progress 0 → 1, centred on the playhead. */
  frames?: number
}

/** Light-leak transition centred on the playhead: progress 0 → 1, linear. */
export function keyLeakAtPlayhead(
  layerId: string,
  options: LeakOptions = {}
): number {
  const frames = Math.max(2, Math.round(options.frames ?? 16))
  const timeline = useTimelineStore.getState()
  const centre = timeToFrame(timeline.currentTime, timeline.frameRate)
  const start = Math.max(0, centre - Math.floor(frames / 2))
  return writeKeys(layerId, "progress", [
    { easing: LINEAR_EASING, frame: start, value: 0 },
    { easing: LINEAR_EASING, frame: start + frames, value: 1 },
  ])
}
