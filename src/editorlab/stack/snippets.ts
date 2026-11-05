import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { getParameterDefinition } from "@/lib/editor/parameter-schema"
import type { EditorLayer, LayerType, ParameterValue } from "@/types/editor"

/**
 * Snippets: one effect's saved settings, named by the user (handoff T4:
 * "their choice, not shipped looks"). Stored in this browser; export the
 * JSON to move them.
 */

export interface EffectSnippet {
  createdAt: string
  effect: LayerType
  id: string
  name: string
  params: Record<string, ParameterValue>
}

export const SNIPPET_STORAGE_KEY = "editorlab.snippets.v1"

export interface SnippetStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): SnippetStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function isSnippet(value: unknown): value is EffectSnippet {
  if (!value || typeof value !== "object") return false
  const snippet = value as Record<string, unknown>
  return (
    typeof snippet.id === "string" &&
    typeof snippet.name === "string" &&
    typeof snippet.effect === "string" &&
    typeof snippet.params === "object" &&
    snippet.params !== null
  )
}

export function readSnippets(storage = defaultStorage()): EffectSnippet[] {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(SNIPPET_STORAGE_KEY) ?? "[]"
    )
    return Array.isArray(parsed) ? parsed.filter(isSnippet) : []
  } catch {
    return []
  }
}

function writeSnippets(
  snippets: EffectSnippet[],
  storage = defaultStorage()
): void {
  storage?.setItem(SNIPPET_STORAGE_KEY, JSON.stringify(snippets))
}

/** Saves the layer's current params (defaults included) under `name`. */
export function saveSnippet(
  name: string,
  layer: EditorLayer,
  storage = defaultStorage()
): EffectSnippet {
  const definition = getLayerDefinition(layer.type)
  const params: Record<string, ParameterValue> = {}
  for (const param of definition.params) {
    const value = layer.params[param.key]
    if (value !== undefined) params[param.key] = structuredClone(value)
  }
  const snippet: EffectSnippet = {
    createdAt: new Date().toISOString(),
    effect: layer.type,
    id: crypto.randomUUID(),
    name: name.trim() || definition.defaultName,
    params,
  }
  writeSnippets([...readSnippets(storage), snippet], storage)
  return snippet
}

export function deleteSnippet(id: string, storage = defaultStorage()): void {
  writeSnippets(
    readSnippets(storage).filter((snippet) => snippet.id !== id),
    storage
  )
}

export function snippetsForEffect(
  effect: LayerType,
  storage = defaultStorage()
): EffectSnippet[] {
  return readSnippets(storage).filter((snippet) => snippet.effect === effect)
}

/** The snippet's params that still exist on the effect, ready to apply. */
export function snippetParamUpdates(
  snippet: EffectSnippet,
  effect: LayerType
): [string, ParameterValue][] {
  const definition = getLayerDefinition(effect)
  return Object.entries(snippet.params).filter(([key]) =>
    getParameterDefinition(definition.params, key)
  )
}

export function importSnippets(
  json: string,
  storage = defaultStorage()
): number {
  const parsed: unknown = JSON.parse(json)
  const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(isSnippet)
  const existing = readSnippets(storage)
  const ids = new Set(existing.map((snippet) => snippet.id))
  const added = incoming.filter((snippet) => !ids.has(snippet.id))
  writeSnippets([...existing, ...added], storage)
  return added.length
}
