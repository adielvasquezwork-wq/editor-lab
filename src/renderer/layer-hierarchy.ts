import {
  type CompositionNode,
  MAX_COMPOSITION_GROUP_DEPTH,
} from "./composition-tree"

export interface HierarchyLayer {
  unavailableLayer?: Record<string, unknown>
  id: string
  kind: string
  parentId?: string | null | undefined
}

/** Inert placeholders retain the structural kind of their original layer. */
export function isLayerGroup(layer: HierarchyLayer): boolean {
  return (
    layer.kind === "group" &&
    (!layer.unavailableLayer || layer.unavailableLayer.kind === "group")
  )
}

/** A flat, top-first preorder keeps subtrees contiguous for selection and moves. */
export function validateLayerHierarchy(
  layers: readonly HierarchyLayer[]
): void {
  const ids = new Set<string>()
  const ancestors: string[] = []
  for (const layer of layers) {
    if (ids.has(layer.id)) throw new Error(`Duplicate layer ID: ${layer.id}`)
    ids.add(layer.id)
    const parent = layer.parentId ?? null
    while (ancestors.length && ancestors.at(-1) !== parent) ancestors.pop()
    if (parent !== null && ancestors.at(-1) !== parent) {
      throw new Error("Group children must follow their parent in layer order.")
    }
    if (isLayerGroup(layer)) {
      if (ancestors.length >= MAX_COMPOSITION_GROUP_DEPTH) {
        throw new Error(
          `Groups support at most ${MAX_COMPOSITION_GROUP_DEPTH} levels.`
        )
      }
      ancestors.push(layer.id)
    }
  }
}

export function buildCompositionTree<
  Layer extends HierarchyLayer & {
    blendMode: string
    mask?: unknown
    opacity: number
    visible: boolean
  },
  Leaf,
>(
  layers: Layer[],
  leaf: (layer: Layer) => Leaf,
  /**
   * Hidden leaves for which this returns true stay in the tree (disabled)
   * instead of being dropped, so their passes and loaded media survive.
   * Used for clips outside their time range: dropping them would dispose and
   * reload the video at every cut.
   */
  retainHidden?: (layer: Layer) => boolean
): CompositionNode<Leaf>[] {
  validateLayerHierarchy(layers)
  const root: CompositionNode<Leaf>[] = []
  const children = new Map<string, CompositionNode<Leaf>[]>()
  const hidden = new Set<string>()
  for (const layer of layers) {
    const parentHidden = Boolean(layer.parentId && hidden.has(layer.parentId))
    if (
      !(layer.visible || parentHidden || isLayerGroup(layer)) &&
      retainHidden?.(layer)
    ) {
      const target = layer.parentId ? children.get(layer.parentId)! : root
      target.push(leaf(layer))
      continue
    }
    if (!layer.visible || parentHidden) {
      hidden.add(layer.id)
      continue
    }
    const target = layer.parentId ? children.get(layer.parentId)! : root
    if (isLayerGroup(layer)) {
      const nested: CompositionNode<Leaf>[] = []
      target.push({
        id: layer.id,
        kind: "group",
        blendMode: layer.blendMode,
        mask: layer.mask ?? null,
        opacity: layer.opacity,
        visible: true,
        children: nested,
      })
      children.set(layer.id, nested)
    } else {
      target.push(leaf(layer))
    }
  }
  return root
}
