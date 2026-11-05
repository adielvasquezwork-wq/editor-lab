import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { buildEffectStack, type EffectStack, stackToLayers } from "./stack-json"

/** The current project's top-level effect layers as a stack. */
export function currentEffectStack(): EffectStack {
  const timeline = useTimelineStore.getState()
  return buildEffectStack(
    useLayerStore.getState().layers,
    timeline.tracks,
    timeline.frameRate
  )
}

/**
 * Puts a stack on the project. `replace` removes the current top-level
 * effect layers first (sources, groups and their contents stay); `add`
 * puts the stack on top of everything. Returns the new layer ids.
 */
export function applyEffectStack(
  stack: EffectStack,
  mode: "add" | "replace"
): string[] {
  const layerStore = useLayerStore.getState()
  const timelineStore = useTimelineStore.getState()
  const { layers, tracks } = stackToLayers(stack)

  const kept =
    mode === "replace"
      ? layerStore.layers.filter(
          (layer) =>
            layer.parentId ||
            layer.kind !== "effect" ||
            Boolean(layer.unavailableLayer)
        )
      : layerStore.layers
  const nextLayers = [...layers, ...kept]
  const keptIds = new Set(kept.map((layer) => layer.id))

  layerStore.replaceState(nextLayers, layers[0]?.id ?? null)
  useTimelineStore.setState((state) => ({
    tracks: [
      ...state.tracks.filter((track) => keptIds.has(track.layerId)),
      ...tracks,
    ],
  }))
  timelineStore.pruneTracks(nextLayers)

  if (typeof stack.fps === "number") {
    timelineStore.setFrameRate(stack.fps)
  }

  return layers.map((layer) => layer.id)
}
