import chuppl from "@/editorlab/presets/chuppl.json"
import fern from "@/editorlab/presets/fern.json"
import jani from "@/editorlab/presets/jani.json"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import {
  DEFAULT_SCENE_CONFIG,
  type LayerType,
  type ParameterValue,
  type SceneConfig,
} from "@/types/editor"

export interface LookPresetLayer {
  name: string
  params: Record<string, ParameterValue>
  type: LayerType
}

export interface LookPreset {
  description: string
  id: string
  label: string
  /** Effect layers, listed top-first (index 0 is applied last). */
  layers: LookPresetLayer[]
  scene: Partial<SceneConfig>
}

/** Name prefix that marks layers added by a look preset. */
export const LOOK_LAYER_PREFIX = "Look · "

export const LOOK_PRESETS: readonly LookPreset[] = [
  jani as LookPreset,
  chuppl as LookPreset,
  fern as LookPreset,
]

/**
 * Every scene field any preset sets. Applying a preset first resets these
 * to their defaults, so switching looks never leaves a previous look's
 * vignette or black point behind.
 */
export const LOOK_SCENE_KEYS: readonly (keyof SceneConfig)[] = [
  ...new Set(
    LOOK_PRESETS.flatMap(
      (preset) => Object.keys(preset.scene) as (keyof SceneConfig)[]
    )
  ),
].sort()

export function getLookPreset(id: string): LookPreset | null {
  return LOOK_PRESETS.find((preset) => preset.id === id) ?? null
}

export function isLookLayerName(name: string): boolean {
  return name.startsWith(LOOK_LAYER_PREFIX)
}

function lookSceneReset(): Partial<SceneConfig> {
  const reset: Record<string, unknown> = {}

  for (const key of LOOK_SCENE_KEYS) {
    reset[key] = DEFAULT_SCENE_CONFIG[key]
  }

  return reset as Partial<SceneConfig>
}

/** Removes look layers and resets the scene fields looks control. */
export function clearLookPreset(): void {
  const layerStore = useLayerStore.getState()
  const lookLayerIds = layerStore.layers
    .filter((layer) => isLookLayerName(layer.name))
    .map((layer) => layer.id)

  if (lookLayerIds.length > 0) {
    layerStore.removeLayers(lookLayerIds)
  }

  useEditorStore.getState().updateSceneConfig(lookSceneReset())
}

/**
 * Applies a look: replaces earlier look layers with this preset's effect
 * layers at the top of the stack and merges its scene settings. Returns the
 * ids of the added layers (top-first).
 */
export function applyLookPreset(id: string): string[] {
  const preset = getLookPreset(id)

  if (!preset) {
    return []
  }

  clearLookPreset()

  const layerStore = useLayerStore.getState()
  const { selectedLayerId, selectedLayerIds, selectionAnchorId } = layerStore
  const added: string[] = []

  // Insert bottom-most first at index 0 so the final order matches the file.
  for (const entry of [...preset.layers].reverse()) {
    const definition = getLayerDefinition(entry.type)
    const layerId = layerStore.addLayer(entry.type, 0)

    for (const [key, value] of Object.entries(entry.params)) {
      if (definition.params.some((param) => param.key === key)) {
        layerStore.updateLayerParam(layerId, key, value)
      }
    }

    layerStore.renameLayer(layerId, `${LOOK_LAYER_PREFIX}${entry.name}`)
    added.unshift(layerId)
  }

  // addLayer selects each new layer, which would also switch the sidebar from
  // Scene to Properties. Keep the user's selection (and panel) as it was.
  const exists = (id: string | null) =>
    id !== null && layerStore.getLayerById(id) !== null
  useLayerStore.setState({
    selectedLayerId: exists(selectedLayerId) ? selectedLayerId : null,
    selectedLayerIds: selectedLayerIds.filter(exists),
    selectionAnchorId: exists(selectionAnchorId) ? selectionAnchorId : null,
  })

  useEditorStore.getState().updateSceneConfig(preset.scene)

  return added
}

/** The id of the look whose layers are in the stack, if exactly one matches. */
export function detectAppliedLook(
  layerNames: readonly string[]
): string | null {
  const lookNames = new Set(layerNames.filter(isLookLayerName))

  if (lookNames.size === 0) {
    return null
  }

  for (const preset of LOOK_PRESETS) {
    const names = preset.layers.map(
      (layer) => `${LOOK_LAYER_PREFIX}${layer.name}`
    )

    if (
      names.length === lookNames.size &&
      names.every((name) => lookNames.has(name))
    ) {
      return preset.id
    }
  }

  return null
}
