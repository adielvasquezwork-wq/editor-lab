"use client"

/**
 * Editor operations on layer clips (video-editing workflow). These compose
 * the layer/timeline stores; undo history is recorded automatically by the
 * store-diffing history system.
 */

import {
  createClip,
  getClipDuration,
  getClipsEnd,
  isTimeInClip,
  type LayerClip,
  moveClip,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from "@/lib/editor/clip"
import { duplicateLayers } from "@/lib/editor/duplicate-layers"
import type { SubtitleCue } from "@/lib/editor/subtitles"
import { MAX_DURATION } from "@/lib/editor/timeline-duration"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { EditorLayer } from "@/types/editor"

function getPlaybackRate(layer: EditorLayer): number {
  const rate = layer.params.playbackRate
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : 1
}

/** Source duration in seconds for video/audio-backed layers, else null. */
export function getLayerSourceDuration(layer: EditorLayer): number | null {
  if (!layer.assetId) {
    return null
  }

  const asset = useAssetStore.getState().getAssetById(layer.assetId)
  const duration = asset?.duration

  return (asset?.kind === "video" || asset?.kind === "audio") &&
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
    ? duration
    : null
}

/** Grows the timeline so every clip fits (never shrinks it). */
export function ensureTimelineCoversClips(): void {
  const end = getClipsEnd(useLayerStore.getState().layers)
  const timeline = useTimelineStore.getState()

  if (end > timeline.duration) {
    timeline.setDuration(Math.min(MAX_DURATION, end))
  }
}

/**
 * The clip a layer effectively has: its own, or, for legacy layers, one
 * spanning the whole timeline (what the layer shows today).
 */
export function getEffectiveClip(layer: EditorLayer): LayerClip {
  if (layer.clip) {
    return layer.clip
  }

  return createClip(0, useTimelineStore.getState().duration, 0)
}

/**
 * Gives a layer a clip. Video/audio layers get their source length starting
 * at the playhead; others span from the playhead to the timeline end.
 */
export function addClipToLayer(layerId: string): LayerClip | null {
  const layer = useLayerStore.getState().getLayerById(layerId)

  if (!layer || layer.kind === "group") {
    return null
  }

  const timeline = useTimelineStore.getState()
  const sourceDuration = getLayerSourceDuration(layer)
  const start = sourceDuration === null ? 0 : timeline.currentTime
  const duration =
    sourceDuration === null
      ? timeline.duration
      : sourceDuration / getPlaybackRate(layer)
  const clip = createClip(start, duration, 0)

  useLayerStore.getState().setLayerClip(layerId, clip)
  ensureTimelineCoversClips()
  return clip
}

export function removeClipFromLayer(layerId: string): void {
  useLayerStore.getState().setLayerClip(layerId, null)
}

export function updateLayerClip(
  layerId: string,
  update: (clip: LayerClip, layer: EditorLayer) => LayerClip
): void {
  const layer = useLayerStore.getState().getLayerById(layerId)

  if (!layer) {
    return
  }

  useLayerStore
    .getState()
    .setLayerClip(layerId, update(getEffectiveClip(layer), layer))
  ensureTimelineCoversClips()
}

export function moveLayerClip(layerId: string, start: number): void {
  updateLayerClip(layerId, (clip) => moveClip(clip, start))
}

export function trimLayerClipStart(layerId: string, start: number): void {
  updateLayerClip(layerId, (clip, layer) =>
    trimClipStart(clip, start, getPlaybackRate(layer))
  )
}

export function trimLayerClipEnd(layerId: string, end: number): void {
  updateLayerClip(layerId, (clip, layer) =>
    trimClipEnd(
      clip,
      end,
      getLayerSourceDuration(layer),
      getPlaybackRate(layer)
    )
  )
}

/**
 * Cuts each given layer at `time` (the "blade" tool): the layer keeps the
 * left part and a duplicate (with its keyframes and audio links) takes the
 * right part. Layers not under the playhead are skipped. Returns new ids.
 */
export function splitLayersAt(
  layerIds: readonly string[],
  time: number
): string[] {
  const created: string[] = []

  for (const id of layerIds) {
    const layer = useLayerStore.getState().getLayerById(id)

    if (!layer || layer.kind === "group" || layer.locked) {
      continue
    }

    const clip = getEffectiveClip(layer)
    const parts = isTimeInClip(clip, time)
      ? splitClip(clip, time, getPlaybackRate(layer))
      : null

    if (!parts) {
      continue
    }

    const [duplicateId] = duplicateLayers([id])

    if (!duplicateId) {
      continue
    }

    const store = useLayerStore.getState()
    store.setLayerClip(id, parts[0])
    store.setLayerClip(duplicateId, parts[1])
    store.renameLayer(duplicateId, layer.name)
    created.push(duplicateId)
  }

  return created
}

/**
 * Removes the layers and closes the gaps they leave: clips starting at or
 * after a removed clip's end move left by its duration.
 */
export function rippleDeleteLayers(layerIds: readonly string[]): void {
  const store = useLayerStore.getState()
  const removed = layerIds
    .map((id) => store.getLayerById(id))
    .filter((layer): layer is EditorLayer => Boolean(layer?.clip))
    .map((layer) => layer.clip as LayerClip)
    .sort((a, b) => b.start - a.start)

  store.removeLayers([...layerIds])

  if (removed.length === 0) {
    return
  }

  const removedIds = new Set(layerIds)

  for (const layer of useLayerStore.getState().layers) {
    if (!layer.clip || removedIds.has(layer.id)) {
      continue
    }

    let shift = 0

    for (const gap of removed) {
      if (layer.clip.start >= gap.end - 1e-6) {
        shift += getClipDuration(gap)
      }
    }

    if (shift > 0) {
      useLayerStore
        .getState()
        .setLayerClip(layer.id, moveClip(layer.clip, layer.clip.start - shift))
    }
  }
}

/** Seconds a new lower third stays on screen. */
const LOWER_THIRD_SECONDS = 4
const TITLE_FADE_SECONDS = 0.3

function addTextLayer(name: string, params: Record<string, unknown>): string {
  const store = useLayerStore.getState()
  const id = store.addLayer("text", 0)

  store.renameLayer(id, name)

  for (const [key, value] of Object.entries(params)) {
    store.updateLayerParam(id, key, value as never)
  }

  return id
}

/**
 * Adds a name/role lower third at the playhead: a bottom-left text layer on
 * a translucent plate that fades in and out.
 */
export function addLowerThird(text = "Name Surname\nRole, Place"): string {
  const id = addTextLayer("Lower third", {
    align: "left",
    anchor: "bottom-left",
    backgroundAlpha: 0.55,
    backgroundColor: "#000000",
    fontSize: 40,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: 1.25,
    offset: [0.06, 0.1],
    text,
    textColor: "#ffffff",
  })
  const start = useTimelineStore.getState().currentTime

  useLayerStore.getState().setLayerClip(id, {
    ...createClip(start, LOWER_THIRD_SECONDS),
    fadeIn: TITLE_FADE_SECONDS,
    fadeOut: TITLE_FADE_SECONDS,
  })
  ensureTimelineCoversClips()
  return id
}

/** Adds a bottom-centred caption layer driven by the given cues. */
export function addCaptionLayer(cues: SubtitleCue[]): string {
  const id = addTextLayer("Captions", {
    align: "center",
    anchor: "bottom-center",
    backgroundAlpha: 0.5,
    backgroundColor: "#000000",
    fontSize: 36,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1.25,
    offset: [0, 0.06],
    textColor: "#ffffff",
  })

  useLayerStore.getState().setLayerSubtitles(id, cues)

  const lastEnd = cues.reduce((end, cue) => Math.max(end, cue.end), 0)
  const timeline = useTimelineStore.getState()
  if (lastEnd > timeline.duration) {
    timeline.setDuration(Math.min(MAX_DURATION, lastEnd))
  }

  return id
}
