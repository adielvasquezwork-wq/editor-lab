/**
 * Layer types of the Editor Lab effects (src/editorlab/effects/<id>/).
 * Dependency-free so src/types/editor.ts can include them in the LayerType
 * union. Keep in sync with EDITORLAB_EFFECTS in ./registry.ts (a test
 * checks it).
 */
export const EDITORLAB_EFFECT_LAYER_TYPES = [
  "vignette",
  "split-tone",
  "exposure",
  "leave-color",
] as const

export type EditorLabEffectLayerType =
  (typeof EDITORLAB_EFFECT_LAYER_TYPES)[number]
