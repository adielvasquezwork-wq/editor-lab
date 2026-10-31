"use client"

import { LINEAR_EASING } from "@/lib/easing-curve"
import { useLayerStore } from "@/store/layer-store"
import { createParamBinding, useTimelineStore } from "@/store/timeline-store"

export interface KenBurnsOptions {
  /** End scale relative to the start (1.12 = 12% push-in). */
  zoom?: number
  /** Offset drift over the move, in frame fractions. */
  pan?: [number, number]
  /** Zoom out instead of in. */
  reverse?: boolean
}

const DIRECTIONS: [number, number][] = [
  [0.035, 0.02],
  [-0.035, 0.02],
  [0.03, -0.025],
  [-0.03, -0.025],
]

/**
 * Adds a slow scale + pan ("Ken Burns") to an image/video layer across its
 * clip (or the whole timeline), with linear keyframes for a constant drift.
 * Returns false when the layer has no scale/offset params.
 */
export function applyKenBurns(
  layerId: string,
  options: KenBurnsOptions = {}
): boolean {
  const layer = useLayerStore.getState().getLayerById(layerId)

  if (!(layer && (layer.type === "image" || layer.type === "video"))) {
    return false
  }

  const scaleBinding = createParamBinding(layer, "scale")
  const offsetBinding = createParamBinding(layer, "offset")

  if (!(scaleBinding && offsetBinding)) {
    return false
  }

  const timeline = useTimelineStore.getState()
  const start = layer.clip?.start ?? 0
  const end = layer.clip?.end ?? timeline.duration
  const baseScale =
    typeof layer.params.scale === "number" ? layer.params.scale : 1
  const baseOffset = Array.isArray(layer.params.offset)
    ? [Number(layer.params.offset[0]) || 0, Number(layer.params.offset[1]) || 0]
    : [0, 0]
  // Deterministic per layer so re-applying keeps the same direction.
  const seed = [...layer.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const pan = options.pan ??
    DIRECTIONS[seed % DIRECTIONS.length] ?? [0.03, 0.02]
  const zoom = Math.max(1, options.zoom ?? 1.12)
  // Never show the frame edge: the zoomed start covers the pan.
  const from = { offset: baseOffset, scale: baseScale * 1.04 }
  const to = {
    offset: [baseOffset[0]! + pan[0], baseOffset[1]! + pan[1]],
    scale: baseScale * 1.04 * zoom,
  }
  const [first, last] = options.reverse ? [to, from] : [from, to]

  for (const [time, values] of [
    [start, first],
    [end, last],
  ] as const) {
    timeline.upsertKeyframe({
      binding: scaleBinding,
      layerId,
      time,
      value: values.scale,
    })
    timeline.upsertKeyframe({
      binding: offsetBinding,
      layerId,
      time,
      value: [values.offset[0]!, values.offset[1]!] as [number, number],
    })
  }

  // Constant drift: linear easing on the new keyframes of both tracks.
  const state = useTimelineStore.getState()
  for (const track of state.tracks) {
    if (
      track.layerId === layerId &&
      track.binding.kind === "param" &&
      (track.binding.key === "scale" || track.binding.key === "offset")
    ) {
      for (const keyframe of track.keyframes) {
        if (
          Math.abs(keyframe.time - start) < 1e-3 ||
          Math.abs(keyframe.time - end) < 1e-3
        ) {
          state.setKeyframeEasing(track.id, keyframe.id, LINEAR_EASING)
        }
      }
    }
  }

  return true
}
