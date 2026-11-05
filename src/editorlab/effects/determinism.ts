import type { EditorLayer, LayerType } from "@/types/editor"

/**
 * Determinism lint (handoff T9). HyperFrames renders frames in any order
 * and re-renders on retries, so a frame must depend on its time only.
 * These layer types don't: their output depends on previous frames, the
 * pointer, or a live source.
 */

export interface DeterminismIssue {
  layerId: string
  layerName: string
  reason: string
  type: LayerType
}

type Rule = {
  reason: string
  /** Only flags when this returns true (default: always). */
  when?: (layer: EditorLayer) => boolean
}

const RULES: Partial<Record<LayerType, Rule>> = {
  "blob-tracking": {
    reason:
      "tracks blobs across frames, so each frame depends on the ones before it",
  },
  crt: {
    reason:
      "phosphor persistence keeps previous frames (set Persistence to 0 to export it safely)",
    when: (layer) =>
      typeof layer.params.persistence === "number" &&
      layer.params.persistence > 0,
  },
  fluid: {
    reason: "a pointer-driven simulation; every run is different",
  },
  live: {
    reason: "live camera input",
  },
  "magnify-lens": {
    reason: "follows the pointer",
  },
  "pixel-trail": {
    reason: "builds up from previous frames and follows the pointer",
  },
}

/** Layer types whose output can depend on previous frames or live input. */
export const STATEFUL_LAYER_TYPES: readonly LayerType[] = Object.keys(
  RULES
) as LayerType[]

export function isStatefulLayerType(type: string): boolean {
  return type in RULES
}

/** Issues for the layers that will render (hidden layers are skipped). */
export function findDeterminismIssues(
  layers: readonly EditorLayer[]
): DeterminismIssue[] {
  const hiddenIds = new Set<string>()
  const issues: DeterminismIssue[] = []

  for (const layer of layers) {
    const parentHidden = Boolean(
      layer.parentId && hiddenIds.has(layer.parentId)
    )

    if (!layer.visible || parentHidden || layer.unavailableLayer) {
      hiddenIds.add(layer.id)
      continue
    }

    const rule = RULES[layer.type]

    if (rule && (!rule.when || rule.when(layer))) {
      issues.push({
        layerId: layer.id,
        layerName: layer.name,
        reason: rule.reason,
        type: layer.type,
      })
    }
  }

  return issues
}

/** One line per issue, for the export dialog and the CLI. */
export function describeDeterminismIssues(issues: DeterminismIssue[]): string {
  return issues
    .map((issue) => `“${issue.layerName}” ${issue.reason}`)
    .join("; ")
}
