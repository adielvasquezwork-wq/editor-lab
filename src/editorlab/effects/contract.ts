import type { PassNode } from "@/renderer/pass-node"
import type { ParameterDefinitions } from "@/types/editor"
import type { EditorLabEffectLayerType } from "./ids"

export type EffectCategory = "lens" | "light" | "texture" | "colour" | "frame"

/**
 * The Editor Lab effect module contract (handoff EFFECTS.md). Every effect
 * is its own module with a typed, keyframable param schema; the inspector UI,
 * the MCP bridge and `editorlab effects describe` are all generated from it.
 */
export interface EffectSchema {
  /** camelCase id used in JSON stacks and the CLI (e.g. "splitTone"). */
  id: string
  /** The editor layer type it registers as (kebab-case). */
  layerType: EditorLabEffectLayerType
  version: number
  category: EffectCategory
  label: string
  description: string
  params: ParameterDefinitions
  /** True when output depends on previous frames (blocked for HyperFrames). */
  stateful: boolean
  /** True when it takes a `seed` and varies only with (seed, frame). */
  seeded: boolean
}

export interface EffectModule extends EffectSchema {
  createPass: (layerId: string) => PassNode
}

export function defineEffectSchema<const T extends EffectSchema>(schema: T): T {
  return schema
}
