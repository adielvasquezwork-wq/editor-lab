#!/usr/bin/env bun
/**
 * Editor Lab CLI.
 *
 *   bun run editorlab effects list            JSON list of every effect
 *   bun run editorlab effects describe <id>   JSON schema of one effect
 *
 * <id> is an Editor Lab effect id ("vignette", "splitTone") or any effect
 * layer type ("split-tone", "focus-blur", "grain"...).
 */
import {
  EDITORLAB_EFFECTS,
  getEffectSchema,
} from "@/editorlab/effects/registry"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"
import { EFFECT_LAYER_TYPES, type LayerType } from "@/types/editor"

/** Upstream effects whose output depends on previous frames. */
const STATEFUL_UPSTREAM = new Set([
  "blob-tracking",
  "crt",
  "pixel-trail",
  "smear",
])

function describe(idOrType: string) {
  const effect = getEffectSchema(idOrType)

  if (effect) {
    return { ...effect, source: "editorlab" }
  }

  if ((EFFECT_LAYER_TYPES as readonly string[]).includes(idOrType)) {
    const definition = getLayerDefinition(idOrType as LayerType)
    return {
      description: LAYER_CATALOG[idOrType as LayerType]?.description ?? "",
      id: idOrType,
      label: definition.defaultName,
      layerType: idOrType,
      params: definition.params,
      source: "upstream",
      stateful: STATEFUL_UPSTREAM.has(idOrType),
    }
  }

  return null
}

function list() {
  const editorLabTypes = new Set<string>(
    EDITORLAB_EFFECTS.map((effect) => effect.layerType)
  )
  return [
    ...EDITORLAB_EFFECTS.map((effect) => ({
      category: effect.category,
      id: effect.id,
      label: effect.label,
      layerType: effect.layerType,
      seeded: effect.seeded,
      source: "editorlab",
      stateful: effect.stateful,
    })),
    ...EFFECT_LAYER_TYPES.filter((type) => !editorLabTypes.has(type)).map(
      (type) => ({
        id: type,
        label: getLayerDefinition(type).defaultName,
        layerType: type,
        source: "upstream",
        stateful: STATEFUL_UPSTREAM.has(type),
      })
    ),
  ]
}

const [group, command, arg] = process.argv.slice(2)
const print = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

if (group === "effects" && command === "list") {
  print(list())
} else if (group === "effects" && command === "describe" && arg) {
  const result = describe(arg)
  if (!result) {
    process.stderr.write(`Unknown effect: ${arg}\n`)
    process.exit(1)
  }
  print(result)
} else {
  process.stderr.write(
    "Usage:\n  editorlab effects list\n  editorlab effects describe <id>\n"
  )
  process.exit(group ? 1 : 0)
}
