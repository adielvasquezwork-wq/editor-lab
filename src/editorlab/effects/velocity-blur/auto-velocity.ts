import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import type { EditorLayer, Size, TimelineTrack } from "@/types/editor"

/**
 * Speed of the content under a velocity-blur layer, in composition pixels
 * per frame, from the keyframed Offset of the source layers below it in
 * the same group. An Offset of 1 moves the picture by one frame width (or
 * height), so velocity = dOffset/dt × frame size. The fastest layer wins.
 */
export function autoVelocity(
  blurLayer: EditorLayer,
  layers: readonly EditorLayer[],
  tracks: readonly TimelineTrack[],
  time: number,
  fps: number,
  logicalSize: Size
): [number, number] {
  const index = layers.findIndex((layer) => layer.id === blurLayer.id)
  if (index === -1) return [0, 0]
  const parentId = blurLayer.parentId ?? null
  const offsetLayers = new Set(
    tracks
      .filter(
        (track) =>
          track.enabled &&
          track.binding.kind === "param" &&
          track.binding.key === "offset" &&
          track.keyframes.length > 1
      )
      .map((track) => track.layerId)
  )
  const candidates = layers
    .slice(index + 1)
    .filter(
      (layer) =>
        (layer.parentId ?? null) === parentId &&
        layer.visible &&
        offsetLayers.has(layer.id)
    )
  if (candidates.length === 0) return [0, 0]

  const dt = 1 / fps / 2
  const before = new Map(
    evaluateTimelineForLayers(
      candidates,
      [...tracks],
      Math.max(0, time - dt)
    ).map((state) => [state.layerId, state.params.offset])
  )
  const after = new Map(
    evaluateTimelineForLayers(candidates, [...tracks], time + dt).map(
      (state) => [state.layerId, state.params.offset]
    )
  )
  let best: [number, number] = [0, 0]
  let bestMagnitude = 0
  for (const layer of candidates) {
    const a = before.get(layer.id)
    const b = after.get(layer.id)
    if (!(Array.isArray(a) && Array.isArray(b))) continue
    const elapsed = time - dt < 0 ? time + dt : 2 * dt
    if (elapsed <= 0) continue
    const vx =
      (((Number(b[0]) - Number(a[0])) / elapsed) * logicalSize.width) / fps
    const vy =
      (((Number(b[1]) - Number(a[1])) / elapsed) * logicalSize.height) / fps
    const magnitude = Math.hypot(vx, vy)
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude
      best = [vx, vy]
    }
  }
  return best
}
