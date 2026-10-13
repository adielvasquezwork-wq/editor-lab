import { create } from "zustand"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  dropLayer,
  insertGroup,
  type LayerDropTarget,
  moveLayerToGroup,
  reorderSiblingLayers,
  subtreeLayers,
  visibleLayerRows,
} from "@/lib/editor/layer-groups"
import {
  clampLayerAdjustments,
  cloneLayer,
  createLayer,
  resetLayerParameters,
} from "@/lib/editor/layers"
import {
  cloneParameterValue,
  getParameterDefinition,
} from "@/lib/editor/parameter-schema"
import { normalizeTextFontWeight } from "@/lib/editor/text-fonts"
import { isLayerGroup, validateLayerHierarchy } from "@/renderer/layer-hierarchy"
import { useAudioStore } from "@/store/audio-store"
import { meshGradientPresetParams, shuffleMeshGradient } from "@/lib/editor/mesh-gradient"
import { useEditorStore } from "@/store/editor-store"
import { useTimelineStore } from "@/store/timeline-store"
import type {
  BlendMode,
  EditorLayer,
  FluidInteractionEvent,
  LayerCompositeMode,
  LayerType,
  MaskConfig,
  ParameterValue,
  LayerMask,
} from "@/types/editor"
import { DEFAULT_LAYER_MASK, DEFAULT_MASK_CONFIG } from "@/types/editor"

export interface LayerStoreState {
  hoveredLayerId: string | null
  layers: EditorLayer[]
  recordingFluidLayerId: string | null
  selectedLayerIds: string[]
  selectedLayerId: string | null
  selectionAnchorId: string | null
}

export interface LayerStoreActions {
  groupLayers: (ids: string[]) => string | null
  ungroupLayer: (id: string) => void
  moveLayer: (id: string, parentId: string | null) => void
  dropLayer: (id: string, target: LayerDropTarget) => void
  reorderSiblings: (parentId: string | null, ids: string[]) => void
  addLayer: (type: LayerType, insertIndex?: number) => string
  duplicateLayer: (id: string) => string | null
  getLayerById: (id: string) => EditorLayer | null
  getRenderableLayers: () => EditorLayer[]
  getSelectedLayer: () => EditorLayer | null
  removeLayer: (id: string) => void
  removeLayers: (ids: string[]) => void
  renameLayer: (id: string, name: string) => void
  replaceState: (
    layers: EditorLayer[],
    selectedLayerId?: string | null,
    hoveredLayerId?: string | null,
    selectedLayerIds?: string[]
  ) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  resetLayerParams: (id: string) => void
  selectLayer: (id: string | null) => void
  selectLayerRange: (id: string) => void
  selectLayerWithModifiers: (
    id: string,
    options?: { additive?: boolean; range?: boolean }
  ) => void
  setHoveredLayer: (id: string | null) => void
  setLayerAsset: (id: string, assetId: string | null) => void
  setLayerDepthAsset: (id: string, assetId: string | null) => void
  setLayerEnvironmentAsset: (id: string, assetId: string | null) => void
  setLayerPatternAssets: (id: string, assetIds: string[]) => void
  setLayerBlendMode: (id: string, blendMode: BlendMode) => void
  setLayerCompositeMode: (id: string, compositeMode: LayerCompositeMode) => void
  setLayerMaskConfig: (id: string, updates: Partial<MaskConfig>) => void
  setLayerMask: (id: string, updates: Partial<LayerMask>) => void
  setLayerExpanded: (id: string, expanded: boolean) => void
  setFluidInteractionEvents: (
    id: string,
    events: FluidInteractionEvent[]
  ) => void
  setRecordingFluidLayer: (id: string | null) => void
  setLayerHue: (id: string, hue: number) => void
  setLayerLocked: (id: string, locked: boolean) => void
  setLayerOpacity: (id: string, opacity: number) => void
  setLayerRuntimeError: (id: string, error: string | null) => void
  setLayerSaturation: (id: string, saturation: number) => void
  setLayerVisibility: (id: string, visible: boolean) => void
  setLayersVisibility: (ids: string[], visible: boolean) => void
  randomizeGradientParams: (id: string) => void
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}

export type LayerStore = LayerStoreState & LayerStoreActions

function getGradientNoiseDefaults(noiseType: string): {
  warpAmount: number
  warpScale: number
} | null {
  switch (noiseType) {
    case "perlin":
      return {
        warpAmount: 0.64,
        warpScale: 5.56,
      }
    case "value":
      return {
        warpAmount: 0.06,
        warpScale: 0.35,
      }
    case "voronoi":
      return {
        warpAmount: 0.3,
        warpScale: 3.0,
      }
    case "ridge":
      return {
        warpAmount: 0.18,
        warpScale: 2.35,
      }
    case "turbulence":
      return {
        warpAmount: 0.04,
        warpScale: 0.28,
      }
    case "simplex":
      return {
        warpAmount: 0.64,
        warpScale: 5.56,
      }
    default:
      return null
  }
}

function getDitheringPresetDefaults(
  preset: string
): Record<string, ParameterValue> | null {
  switch (preset) {
    case "gameboy":
      return {
        algorithm: "bayer-2x2",
        colorMode: "duo-tone",
        highlightColor: "#9bbc0f",
        levels: 4,
        pixelSize: 3,
        shadowColor: "#0f380f",
        spread: 0.5,
      }
    default:
      return null
  }
}

function getHalftonePresetDefaults(
  preset: string
): Record<string, ParameterValue> | null {
  switch (preset) {
    case "process":
      return {
        inkCyan: "#00AEEF",
        inkMagenta: "#EC008C",
        inkYellow: "#FFF200",
        inkKey: "#1a1a1a",
        paperColor: "#F5F5F0",
      }
    case "risograph":
      return {
        inkCyan: "#0078BF",
        inkMagenta: "#FF48B0",
        inkYellow: "#FFE800",
        inkKey: "#000000",
        paperColor: "#F2F0E6",
      }
    case "newspaper":
      return {
        inkCyan: "#1A6B8A",
        inkMagenta: "#8C3A5E",
        inkYellow: "#C4A832",
        inkKey: "#2B2B2B",
        paperColor: "#F0E6D0",
      }
    case "vintage":
      return {
        inkCyan: "#3A7CA5",
        inkMagenta: "#A0506A",
        inkYellow: "#D4A843",
        inkKey: "#3C3228",
        paperColor: "#EDE4D4",
      }
    default:
      return null
  }
}

export function cloneLayerList(layers: EditorLayer[]): EditorLayer[] {
  return layers.map((layer) => ({
    ...layer,
    params: { ...layer.params },
  }))
}

function countLayersOfType(layers: EditorLayer[], type: LayerType): number {
  return layers.filter((layer) => layer.type === type).length
}

function getNeighborSelection(
  layers: EditorLayer[],
  removedIndex: number
): string | null {
  const nextIndex = Math.min(removedIndex, layers.length - 1)
  const nextLayer = layers[nextIndex]

  return nextLayer?.id ?? null
}

function getSelectionAfterRemoval(
  layers: EditorLayer[],
  removedIndices: number[]
): string | null {
  if (layers.length === 0 || removedIndices.length === 0) {
    return null
  }

  return getNeighborSelection(layers, Math.min(...removedIndices))
}

function pruneRemovedLayerDependencies(layers: EditorLayer[]): void {
  useTimelineStore.getState().pruneTracks(layers)
  const ids = new Set(layers.map((layer) => layer.id))
  const audio = useAudioStore.getState().getSnapshot()
  const links = audio.links.filter((link) => ids.has(link.layerId))
  const source =
    audio.source?.kind === "video-layer" && !ids.has(audio.source.layerId)
      ? null
      : audio.source
  if (links.length !== audio.links.length || source !== audio.source) {
    useAudioStore.getState().restoreSnapshot({ ...audio, links, source })
  }
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  hoveredLayerId: null,
  layers: [],
  recordingFluidLayerId: null,
  selectedLayerIds: [],
  selectedLayerId: null,
  selectionAnchorId: null,

  addLayer: (type, insertIndex) => {
    const existingLayers = get().layers
    const nextLayer = createLayer(type, countLayersOfType(existingLayers, type))

    set((state) => {
      const layers = [...state.layers]

      const selected = state.layers.find(
        (layer) => layer.id === state.selectedLayerId
      )
      let index = insertIndex
      if (index === undefined && selected && isLayerGroup(selected)) {
        nextLayer.parentId = selected.id
        index = state.layers.indexOf(selected) + 1
        layers[state.layers.indexOf(selected)] = { ...selected, expanded: true }
      } else if (index === undefined && selected?.parentId) {
        nextLayer.parentId = selected.parentId
        index = state.layers.indexOf(selected)
      } else if (index !== undefined && layers[index]?.parentId) {
        nextLayer.parentId = layers[index]!.parentId ?? null
      }
      layers.splice(
        Math.max(0, Math.min(index ?? 0, layers.length)),
        0,
        nextLayer
      )
      validateLayerHierarchy(layers)

      return {
        layers,
        selectedLayerIds: [nextLayer.id],
        selectedLayerId: nextLayer.id,
        selectionAnchorId: nextLayer.id,
      }
    })

    useEditorStore.getState().dismissStartupPreview()

    return nextLayer.id
  },

  removeLayer: (id) => {
    get().removeLayers([id])
  },

  removeLayers: (ids) => {
    const idSet = new Set(
      ids.flatMap((id) =>
        subtreeLayers(get().layers, id).map((layer) => layer.id)
      )
    )

    if (idSet.size === 0) {
      return
    }

    set((state) => {
      const removedIndices = state.layers.flatMap((layer, index) =>
        idSet.has(layer.id) ? [index] : []
      )

      if (removedIndices.length === 0) {
        return state
      }

      const layers = state.layers.filter((layer) => !idSet.has(layer.id))
      const selectedLayerIds = state.selectedLayerIds.filter(
        (selectedId) => !idSet.has(selectedId)
      )

      const nextSelectedLayerId =
        selectedLayerIds.find(
          (selectedId) => selectedId === state.selectedLayerId
        ) ??
        selectedLayerIds.at(-1) ??
        getSelectionAfterRemoval(layers, removedIndices)
      let nextSelectedLayerIds: string[] = []

      if (nextSelectedLayerId) {
        nextSelectedLayerIds =
          selectedLayerIds.length > 0 ? selectedLayerIds : [nextSelectedLayerId]
      }

      return {
        hoveredLayerId:
          state.hoveredLayerId && idSet.has(state.hoveredLayerId)
            ? null
            : state.hoveredLayerId,
        layers,
        selectedLayerIds: nextSelectedLayerIds,
        selectedLayerId: nextSelectedLayerId,
        selectionAnchorId:
          state.selectionAnchorId && idSet.has(state.selectionAnchorId)
            ? nextSelectedLayerId
            : state.selectionAnchorId,
      }
    })
    pruneRemovedLayerDependencies(get().layers)
  },

  duplicateLayer: (id) => {
    const sourceLayer = get().layers.find((layer) => layer.id === id)

    if (!sourceLayer) {
      return null
    }

    const originals = subtreeLayers(get().layers, id)
    const clones = originals.map(cloneLayer)
    const mapping = new Map(
      originals.map((layer, i) => [layer.id, clones[i]!.id])
    )
    const duplicated = clones.map((layer, i) => ({
      ...layer,
      name: i === 0 ? layer.name : originals[i]!.name,
      parentId: layer.parentId
        ? (mapping.get(layer.parentId) ?? layer.parentId)
        : null,
    }))
    const duplicatedId = duplicated[0]!.id
    set((state) => {
      const layers = [...state.layers]
      const sourceIndex = layers.findIndex((layer) => layer.id === id)
      layers.splice(sourceIndex + originals.length, 0, ...duplicated)
      return {
        layers,
        selectedLayerIds: [duplicatedId],
        selectedLayerId: duplicatedId,
        selectionAnchorId: duplicatedId,
      }
    })
    return duplicatedId
  },

  groupLayers: (ids) => {
    if (!ids.length) return get().addLayer("group", 0)
    const group = createLayer("group", countLayersOfType(get().layers, "group"))
    const layers = insertGroup(get().layers, ids, group)
    if (!layers) return null
    set({
      layers,
      selectedLayerId: group.id,
      selectedLayerIds: [group.id],
      selectionAnchorId: group.id,
    })
    return group.id
  },

  ungroupLayer: (id) => {
    const group = get().layers.find(
      (layer) => layer.id === id && isLayerGroup(layer)
    )
    if (!group || group.locked) return
    const children = get()
      .layers.filter((layer) => layer.parentId === id)
      .map((layer) => layer.id)
    const layers = get()
      .layers.filter((layer) => layer.id !== id)
      .map((layer) =>
        layer.parentId === id
          ? { ...layer, parentId: group.parentId ?? null }
          : layer
      )
    get().replaceState(
      layers,
      children[0] ?? group.parentId ?? null,
      null,
      children
    )
    pruneRemovedLayerDependencies(layers)
  },

  moveLayer: (id, parentId) => {
    const layers = moveLayerToGroup(get().layers, id, parentId)
    if (layers) set({ layers })
  },

  dropLayer: (id, target) => {
    const layers = dropLayer(get().layers, id, target)
    if (layers && layers !== get().layers) set({ layers })
  },

  reorderSiblings: (parentId, ids) => {
    set((state) => ({
      layers: reorderSiblingLayers(state.layers, parentId, ids),
    }))
  },

  reorderLayers: (fromIndex, toIndex) => {
    const layers = get().layers
    const source = layers[fromIndex]
    const target = layers[toIndex]
    if (
      !(source && target) ||
      (source.parentId ?? null) !== (target.parentId ?? null)
    )
      return
    const siblings = layers
      .filter((layer) => (layer.parentId ?? null) === (source.parentId ?? null))
      .map((layer) => layer.id)
    const from = siblings.indexOf(source.id)
    const to = siblings.indexOf(target.id)
    siblings.splice(from, 1)
    siblings.splice(to, 0, source.id)
    get().reorderSiblings(source.parentId ?? null, siblings)
  },

  selectLayer: (selectedLayerId) => {
    set({
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
      selectedLayerId,
      selectionAnchorId: selectedLayerId,
    })
  },

  selectLayerRange: (selectedLayerId) => {
    get().selectLayerWithModifiers(selectedLayerId, { range: true })
  },

  selectLayerWithModifiers: (selectedLayerId, options = {}) => {
    const { additive = false, range = false } = options

    set((state) => {
      const rows = visibleLayerRows(state.layers)
      const targetIndex = rows.findIndex(
        (layer) => layer.id === selectedLayerId
      )

      if (targetIndex === -1) {
        return state
      }

      if (range) {
        const anchorId =
          state.selectionAnchorId ?? state.selectedLayerId ?? selectedLayerId
        const anchorIndex = rows.findIndex((layer) => layer.id === anchorId)

        if (anchorIndex === -1) {
          return {
            selectedLayerIds: [selectedLayerId],
            selectedLayerId,
            selectionAnchorId: selectedLayerId,
          }
        }

        const rangeIds = rows
          .slice(
            Math.min(anchorIndex, targetIndex),
            Math.max(anchorIndex, targetIndex) + 1
          )
          .map((layer) => layer.id)

        return {
          selectedLayerIds: additive
            ? Array.from(new Set([...state.selectedLayerIds, ...rangeIds]))
            : rangeIds,
          selectedLayerId,
          selectionAnchorId: anchorId,
        }
      }

      if (additive) {
        const isSelected = state.selectedLayerIds.includes(selectedLayerId)
        const selectedLayerIds = isSelected
          ? state.selectedLayerIds.filter((id) => id !== selectedLayerId)
          : [...state.selectedLayerIds, selectedLayerId]
        let nextSelectedLayerId: string | null = selectedLayerId

        if (isSelected) {
          nextSelectedLayerId =
            state.selectedLayerId === selectedLayerId
              ? (selectedLayerIds.at(-1) ?? null)
              : state.selectedLayerId
        }

        return {
          selectedLayerIds,
          selectedLayerId: nextSelectedLayerId,
          selectionAnchorId: selectedLayerId,
        }
      }

      return {
        selectedLayerIds: [selectedLayerId],
        selectedLayerId,
        selectionAnchorId: selectedLayerId,
      }
    })
  },

  setHoveredLayer: (hoveredLayerId) => {
    set({ hoveredLayerId })
  },

  renameLayer: (id, name) => {
    const nextName = name.trim()

    if (!nextName) {
      return
    }

    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, name: nextName } : layer
      ),
    }))
  },

  setLayerVisibility: (id, visible) => {
    get().setLayersVisibility([id], visible)
  },

  setLayersVisibility: (ids, visible) => {
    const idSet = new Set(ids)

    if (idSet.size === 0) {
      return
    }

    set((state) => ({
      layers: state.layers.map((layer) =>
        idSet.has(layer.id) ? { ...layer, visible } : layer
      ),
    }))
  },

  setLayerLocked: (id, locked) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, locked } : layer
      ),
    }))
  },

  setLayerExpanded: (id, expanded) => {
    const hiddenIds = new Set(
      subtreeLayers(get().layers, id)
        .slice(1)
        .map((layer) => layer.id)
    )
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, expanded } : layer
      ),
      ...(!expanded &&
      state.selectedLayerIds.some((selected) => hiddenIds.has(selected))
        ? { selectedLayerId: id, selectedLayerIds: [id], selectionAnchorId: id }
        : {}),
    }))
  },

  setFluidInteractionEvents: (id, events) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id &&
        (layer.type === "fluid" ||
          layer.type === "pixel-trail" ||
          layer.type === "magnify-lens")
          ? { ...layer, fluidInteractionEvents: structuredClone(events) }
          : layer
      ),
    }))
  },

  setRecordingFluidLayer: (id) => {
    set({ recordingFluidLayerId: id })
  },

  setLayerOpacity: (id, opacity) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue: layer.hue,
            opacity,
            saturation: layer.saturation,
          }),
        }
      }),
    }))
  },

  setLayerHue: (id, hue) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue,
            opacity: layer.opacity,
            saturation: layer.saturation,
          }),
        }
      }),
    }))
  },

  setLayerSaturation: (id, saturation) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue: layer.hue,
            opacity: layer.opacity,
            saturation,
          }),
        }
      }),
    }))
  },

  setLayerBlendMode: (id, blendMode) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, blendMode } : layer
      ),
    }))
  },

  setLayerCompositeMode: (id, compositeMode) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id && layer.kind !== "group"
          ? { ...layer, compositeMode }
          : layer
      ),
    }))
  },

  setLayerMaskConfig: (id, updates) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, maskConfig: { ...layer.maskConfig, ...updates } }
          : layer
      ),
    }))
  },

  setLayerMask: (id, updates) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              mask: { ...DEFAULT_LAYER_MASK, ...(layer.mask ?? {}), ...updates },
            }
          : layer
      ),
    }))
  },

  setLayerAsset: (id, assetId) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, assetId, runtimeError: null } : layer
      ),
    }))
  },

  setLayerDepthAsset: (id, assetId) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, depthAssetId: assetId, runtimeError: null }
          : layer
      ),
    }))
  },

  setLayerEnvironmentAsset: (id, assetId) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, environmentAssetId: assetId, runtimeError: null }
          : layer
      ),
    }))
  },

  setLayerPatternAssets: (id, assetIds) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, patternAssetIds: [...assetIds], runtimeError: null }
          : layer
      ),
    }))
  },

  randomizeGradientParams: (id) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id && layer.type === "gradient"
          ? {
              ...layer,
              params: { ...layer.params, ...shuffleMeshGradient() },
              runtimeError: null,
            }
          : layer
      ),
    }))
  },

  updateLayerParam: (id, key, value) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        const definition = getParameterDefinition(
          getLayerDefinition(layer.type).params,
          key
        )

        if (!definition) {
          return layer
        }

        const nextParams = {
          ...layer.params,
          [key]: cloneParameterValue(value),
        }

        if (layer.type === "text") {
          if (key === "fontFamily" && typeof value === "string") {
            nextParams.fontWeight = normalizeTextFontWeight(
              value,
              nextParams.fontWeight
            )
          }

          if (key === "fontWeight") {
            const fontFamily =
              typeof nextParams.fontFamily === "string"
                ? nextParams.fontFamily
                : "display-serif"

            nextParams.fontWeight = normalizeTextFontWeight(fontFamily, value)
          }
        }

        if (
          layer.type === "gradient" &&
          key === "noiseType" &&
          typeof value === "string"
        ) {
          const defaults = getGradientNoiseDefaults(value)

          if (defaults) {
            nextParams.warpAmount = defaults.warpAmount
            nextParams.warpScale = defaults.warpScale
          }
        }

        if (
          layer.type === "gradient" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = meshGradientPresetParams(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        if (
          layer.type === "dithering" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = getDitheringPresetDefaults(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        if (
          layer.type === "halftone" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = getHalftonePresetDefaults(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        return {
          ...layer,
          params: nextParams,
          runtimeError: null,
        }
      }),
    }))
  },

  resetLayerParams: (id) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              params: resetLayerParameters(layer.type),
              runtimeError: null,
            }
          : layer
      ),
    }))
  },

  setLayerRuntimeError: (id, runtimeError) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, runtimeError } : layer
      ),
    }))
  },

  replaceState: (
    layers,
    selectedLayerId = null,
    hoveredLayerId = null,
    selectedLayerIds = []
  ) => {
    validateLayerHierarchy(layers)
    const normalizedSelectedLayerIds = (selectedLayerIds ?? []).filter((id) =>
      layers.some((layer) => layer.id === id)
    )
    let nextSelectedLayerIds: string[] = []

    if (normalizedSelectedLayerIds.length > 0) {
      nextSelectedLayerIds = normalizedSelectedLayerIds
    } else if (selectedLayerId) {
      nextSelectedLayerIds = [selectedLayerId]
    }

    set({
      hoveredLayerId,
      layers: cloneLayerList(layers).map((layer) => ({
        ...layer,
        maskConfig: layer.maskConfig ?? { ...DEFAULT_MASK_CONFIG },
      })),
      selectedLayerIds: nextSelectedLayerIds,
      selectedLayerId:
        (selectedLayerId &&
          nextSelectedLayerIds.find((id) => id === selectedLayerId)) ??
        nextSelectedLayerIds.at(-1) ??
        null,
      selectionAnchorId:
        (selectedLayerId &&
          nextSelectedLayerIds.find((id) => id === selectedLayerId)) ??
        nextSelectedLayerIds.at(-1) ??
        null,
      recordingFluidLayerId: null,
    })
  },

  getSelectedLayer: () => {
    const state = get()

    return (
      state.layers.find((layer) => layer.id === state.selectedLayerId) ?? null
    )
  },

  getLayerById: (id) => {
    return get().layers.find((layer) => layer.id === id) ?? null
  },

  getRenderableLayers: () => {
    return get().layers
  },
}))
