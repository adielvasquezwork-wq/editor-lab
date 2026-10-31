import type { LayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import type { LayerDefinition } from "@/types/editor"
import type { EffectSchema } from "./contract"
import { exposureSchema } from "./exposure"
import type { EditorLabEffectLayerType } from "./ids"
import { leaveColorSchema } from "./leave-color"
import { splitToneSchema } from "./split-tone"
import { vignetteSchema } from "./vignette"

/** Every Editor Lab effect schema (no GPU code; safe for the CLI). */
export const EDITORLAB_EFFECTS: readonly EffectSchema[] = [
  vignetteSchema,
  splitToneSchema,
  exposureSchema,
  leaveColorSchema,
]

export function getEffectSchema(idOrLayerType: string): EffectSchema | null {
  return (
    EDITORLAB_EFFECTS.find(
      (effect) =>
        effect.id === idOrLayerType || effect.layerType === idOrLayerType
    ) ?? null
  )
}

export const EDITORLAB_LAYER_DEFINITIONS = Object.fromEntries(
  EDITORLAB_EFFECTS.map((effect) => [
    effect.layerType,
    {
      defaultName: effect.label,
      kind: "effect",
      params: effect.params,
      type: effect.layerType,
    } satisfies LayerDefinition,
  ])
) as Record<EditorLabEffectLayerType, LayerDefinition>

export const EDITORLAB_LAYER_CATALOG = Object.fromEntries(
  EDITORLAB_EFFECTS.map((effect) => [
    effect.layerType,
    {
      category: "core",
      description: effect.description,
      label: effect.label,
    } satisfies LayerCatalogEntry,
  ])
) as Record<EditorLabEffectLayerType, LayerCatalogEntry>

export const EDITORLAB_PICKER_ORDER: readonly EditorLabEffectLayerType[] =
  EDITORLAB_EFFECTS.map((effect) => effect.layerType)
