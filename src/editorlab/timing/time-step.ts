import type { LayerTimeStep } from "@/types/editor"

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

/** Applies nested steps, outermost group first. */
export function applyTimeSteps(
  time: number,
  steps: readonly LayerTimeStep[] | undefined
): number {
  if (!steps || steps.length === 0) {
    return time
  }

  let result = time

  for (const step of steps) {
    result = stepTime(result, step)
  }

  return result
}

interface SteppableLayer {
  id: string
  parentId?: string | null | undefined
  timeStep?: LayerTimeStep | null | undefined
}

/**
 * For each layer, the steps that apply to it: its ancestors' (outermost
 * first) and then its own. Layers with no step anywhere are omitted.
 */
export function collectLayerTimeSteps(
  layers: readonly SteppableLayer[]
): Map<string, LayerTimeStep[]> {
  const result = new Map<string, LayerTimeStep[]>()

  if (!layers.some((layer) => layer.timeStep)) {
    return result
  }

  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const resolving = new Set<string>()
  const resolved = new Map<string, LayerTimeStep[]>()

  const resolve = (layer: SteppableLayer): LayerTimeStep[] => {
    const cached = resolved.get(layer.id)

    if (cached) {
      return cached
    }

    if (resolving.has(layer.id)) {
      return []
    }

    resolving.add(layer.id)
    const parent = layer.parentId ? byId.get(layer.parentId) : undefined
    const inherited = parent ? resolve(parent) : []
    const own = normalizeTimeStep(layer.timeStep)
    const steps = own ? [...inherited, own] : inherited
    resolving.delete(layer.id)
    resolved.set(layer.id, steps)
    return steps
  }

  for (const layer of layers) {
    const steps = resolve(layer)

    if (steps.length > 0) {
      result.set(layer.id, steps)
    }
  }

  return result
}
