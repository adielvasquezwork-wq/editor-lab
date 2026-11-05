import {
  normalizeFreeze,
  normalizeTimeStep,
} from "@/editorlab/timing/time-step"
import { useLayerStore } from "@/store/layer-store"
import type { LayerFreeze, LayerTimeStep } from "@/types/editor"

/** Sets (or clears, with null) a layer's stepped timing. */
export function setLayerTimeStep(
  layerId: string,
  step: LayerTimeStep | null
): void {
  const next = step ? normalizeTimeStep(step) : null

  useLayerStore.setState((state) => ({
    layers: state.layers.map((layer) => {
      if (layer.id !== layerId) {
        return layer
      }

      if (next) {
        return { ...layer, timeStep: next }
      }

      const { timeStep: _removed, ...rest } = layer
      return rest
    }),
  }))
}

/** Sets (or clears, with null) a layer's freeze frame. */
export function setLayerFreeze(
  layerId: string,
  freeze: LayerFreeze | null
): void {
  const next = freeze ? normalizeFreeze(freeze) : null

  useLayerStore.setState((state) => ({
    layers: state.layers.map((layer) => {
      if (layer.id !== layerId) {
        return layer
      }

      if (next) {
        return { ...layer, freeze: next }
      }

      const { freeze: _removed, ...rest } = layer
      return rest
    }),
  }))
}
