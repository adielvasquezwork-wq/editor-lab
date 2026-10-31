import type { PassNode } from "@/renderer/pass-node"
import { ExposurePass } from "./exposure/pass"
import {
  EDITORLAB_EFFECT_LAYER_TYPES,
  type EditorLabEffectLayerType,
} from "./ids"
import { LeaveColorPass } from "./leave-color/pass"
import { SplitTonePass } from "./split-tone/pass"
import { VignettePass } from "./vignette/pass"

const FACTORIES: Record<EditorLabEffectLayerType, (id: string) => PassNode> = {
  exposure: (id) => new ExposurePass(id),
  "leave-color": (id) => new LeaveColorPass(id),
  "split-tone": (id) => new SplitTonePass(id),
  vignette: (id) => new VignettePass(id),
}

export function isEditorLabEffectType(
  type: string
): type is EditorLabEffectLayerType {
  return (EDITORLAB_EFFECT_LAYER_TYPES as readonly string[]).includes(type)
}

/** Creates the pass for an Editor Lab effect layer, or null for other types. */
export function createEditorLabPass(
  type: string,
  layerId: string
): PassNode | null {
  return isEditorLabEffectType(type) ? FACTORIES[type](layerId) : null
}
