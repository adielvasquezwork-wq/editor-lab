import { create } from "zustand"
import { useLayerStore } from "@/store/layer-store"

const HANDLE_PARAMS: Partial<Record<string, ReadonlySet<string>>> = {
  annotations: new Set(["targetCenter", "targetSize"]),
  gradient: new Set(
    [1, 2, 3, 4, 5].flatMap((point) => [
      `point${point}Position`,
      `point${point}Weight`,
    ])
  ),
  model: new Set(["elevation", "location", "orbit", "rotation", "scale", "shift"]),
  shape: new Set(["center", "rotation", "size"]),
  text: new Set(["fontSize", "offset", "rotation"]),
}

type CanvasHandlesState = {
  peeking: boolean
}

export const useCanvasHandlesStore = create<CanvasHandlesState>(() => ({
  peeking: false,
}))

function stopPeeking() {
  useCanvasHandlesStore.setState({ peeking: false })
}

export function peekCanvasHandles(): void {
  if (useCanvasHandlesStore.getState().peeking) return
  useCanvasHandlesStore.setState({ peeking: true })
  window.addEventListener("pointerup", stopPeeking, { once: true })
  window.addEventListener("pointercancel", stopPeeking, { once: true })
}

export function drivesCanvasHandles(layerId: string, key: string): boolean {
  const layer = useLayerStore
    .getState()
    .layers.find((item) => item.id === layerId)
  return layer ? (HANDLE_PARAMS[layer.type]?.has(key) ?? false) : false
}
