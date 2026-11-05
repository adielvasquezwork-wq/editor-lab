import type { LayerFreeze, LayerTimeStep } from "@/types/editor"

/**
 * Stepped timing ("posterize time"). A layer on n evaluates at
 * t' = floor(t·fps/n)·n/fps, so each pose holds for exactly n frames when the
 * export runs at the same fps. Groups pass their step to everything inside,
 * so a graphic can sit on threes over a full-rate plate (style ref B5).
 */

export const TIME_STEP_FRAME_OPTIONS = [2, 3, 4, 8] as const
export const TIME_STEP_FPS_OPTIONS = [24, 25, 30] as const

export const DEFAULT_TIME_STEP: LayerTimeStep = { fps: 24, n: 2, offset: 0 }

// Export times are frameIndex / fps; guard against 0.99999… flooring down.
const FRAME_EPSILON = 1e-6

export function normalizeTimeStep(value: unknown): LayerTimeStep | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const { fps, n, offset } = value as Record<string, unknown>

  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    typeof fps !== "number" ||
    !Number.isFinite(fps)
  ) {
    return null
  }

  const frames = Math.round(n)

  if (frames < 2) {
    return null
  }

  return {
    fps: Math.min(240, Math.max(1, fps)),
    n: Math.min(120, frames),
    offset:
      typeof offset === "number" && Number.isFinite(offset)
        ? Math.round(offset)
        : 0,
  }
}

/** Holds `time` on the step grid. Never returns a negative time. */
export function stepTime(time: number, step: LayerTimeStep): number {
  if (!Number.isFinite(time) || step.n < 2 || step.fps <= 0) {
    return time
  }

  const frame = Math.floor(time * step.fps + FRAME_EPSILON)
  const held = Math.floor((frame - step.offset) / step.n) * step.n + step.offset

  return Math.max(0, held) / step.fps
}

export function normalizeFreeze(value: unknown): LayerFreeze | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const { from, length } = value as Record<string, unknown>

  if (
    typeof from !== "number" ||
    !Number.isFinite(from) ||
    typeof length !== "number" ||
    !Number.isFinite(length) ||
    length <= 0
  ) {
    return null
  }

  return { from: Math.max(0, from), length }
}

/**
 * Freeze frame: time stops at `from` for `length` seconds, then resumes from
 * where it paused (so a clip plays its full content, `length` later).
 */
export function freezeTime(time: number, freeze: LayerFreeze): number {
  if (!Number.isFinite(time) || freeze.length <= 0) {
    return time
  }

  if (time < freeze.from) {
    return time
  }

  if (time < freeze.from + freeze.length) {
    return freeze.from
  }

  return time - freeze.length
}

export type LayerTimeModifier =
  | ({ kind: "step" } & LayerTimeStep)
  | ({ kind: "freeze" } & LayerFreeze)

export function applyTimeModifier(
  time: number,
  modifier: LayerTimeModifier
): number {
  return modifier.kind === "freeze"
    ? freezeTime(time, modifier)
    : stepTime(time, modifier)
}

/** Applies a chain of modifiers in order (outermost group first). */
export function applyTimeModifiers(
  time: number,
  modifiers: readonly LayerTimeModifier[] | undefined
): number {
  if (!modifiers || modifiers.length === 0) {
    return time
  }

  let result = time

  for (const modifier of modifiers) {
    result = applyTimeModifier(result, modifier)
  }

  return result
}

interface TimedLayer {
  freeze?: LayerFreeze | null | undefined
  id: string
  parentId?: string | null | undefined
  timeStep?: LayerTimeStep | null | undefined
}

/**
 * For each layer, the time modifiers that apply to it: its ancestors'
 * (outermost first), then its own freeze, then its own step. Layers with no
 * modifier anywhere are omitted.
 */
export function collectLayerTimeModifiers(
  layers: readonly TimedLayer[]
): Map<string, LayerTimeModifier[]> {
  const result = new Map<string, LayerTimeModifier[]>()

  if (!layers.some((layer) => layer.timeStep || layer.freeze)) {
    return result
  }

  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const resolving = new Set<string>()
  const resolved = new Map<string, LayerTimeModifier[]>()

  const resolve = (layer: TimedLayer): LayerTimeModifier[] => {
    const cached = resolved.get(layer.id)

    if (cached) {
      return cached
    }

    if (resolving.has(layer.id)) {
      return []
    }

    resolving.add(layer.id)
    const parent = layer.parentId ? byId.get(layer.parentId) : undefined
    const own: LayerTimeModifier[] = []
    const freeze = normalizeFreeze(layer.freeze)
    const step = normalizeTimeStep(layer.timeStep)
    if (freeze) own.push({ kind: "freeze", ...freeze })
    if (step) own.push({ kind: "step", ...step })
    const modifiers = [...(parent ? resolve(parent) : []), ...own]
    resolving.delete(layer.id)
    resolved.set(layer.id, modifiers)
    return modifiers
  }

  for (const layer of layers) {
    const modifiers = resolve(layer)

    if (modifiers.length > 0) {
      result.set(layer.id, modifiers)
    }
  }

  return result
}
