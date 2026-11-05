import { HOUSE_EASING, LINEAR_EASING, STEP_EASING } from "@/lib/easing-curve"
import type { KeyframeEasing } from "@/lib/easing-curve"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import {
  getParameterDefinition,
  isParameterAnimatable,
} from "@/lib/editor/parameter-schema"
import {
  createLayerPropertyBinding,
  createParamBinding,
} from "@/store/timeline-store"
import {
  EFFECT_LAYER_TYPES,
  type EditorLayer,
  type LayerFreeze,
  type LayerTimeStep,
  type LayerType,
  type ParameterValue,
  type SceneConfig,
  type TimelineKeyframe,
  type TimelineTrack,
} from "@/types/editor"
import { normalizeFreeze, normalizeTimeStep } from "../timing/time-step"

/**
 * Effect stack as plain JSON (handoff T4): the same thing you build in the
 * UI, written by hand or by an agent, and what `editorlab render` reads.
 *
 * {
 *   "format": "editorlab-stack", "version": 1, "fps": 24,
 *   "layers": [                       // top first, like the sidebar
 *     { "id": "vignette", "params": { "amount": 2 },
 *       "keys": { "amount": [{ "t": 0, "v": 0 }, { "t": 1, "v": 2, "easing": "house" }] } }
 *   ]
 * }
 */

export const STACK_FORMAT = "editorlab-stack"
export const STACK_VERSION = 1

export type StackEasing =
  | "house"
  | "linear"
  | "step"
  | [number, number, number, number]

export interface StackKeyframe {
  easing?: StackEasing
  t: number
  v: ParameterValue
}

export interface StackLayer {
  blendMode?: string
  freeze?: LayerFreeze
  id: LayerType
  keys?: Record<string, StackKeyframe[]>
  name?: string
  opacity?: number
  params?: Record<string, ParameterValue>
  timeStep?: LayerTimeStep
  visible?: boolean
}

export interface EffectStack {
  format: typeof STACK_FORMAT
  fps?: number
  layers: StackLayer[]
  /** Optional scene settings (e.g. letterbox) applied after the layers. */
  scene?: Partial<SceneConfig>
  version: typeof STACK_VERSION
}

const EFFECT_TYPES = new Set<string>(EFFECT_LAYER_TYPES)

function easingToStack(easing: KeyframeEasing): StackEasing {
  if (easing.type === "step") return "step"
  const [a, b, c, d] = easing.controlPoints
  if (a === 0.16 && b === 1 && c === 0.3 && d === 1) return "house"
  if (a === 0 && b === 0 && c === 1 && d === 1) return "linear"
  return [a, b, c, d]
}

export function easingFromStack(
  easing: StackEasing | undefined
): KeyframeEasing {
  if (easing === "step") return STEP_EASING
  if (easing === "linear") return LINEAR_EASING
  if (
    Array.isArray(easing) &&
    easing.length === 4 &&
    easing.every(Number.isFinite)
  ) {
    return {
      controlPoints: [...easing] as [number, number, number, number],
      type: "bezier",
    }
  }
  return HOUSE_EASING
}

/**
 * The top-level effect layers (and their keyframes) as a stack. Groups,
 * sources and layers inside groups are left out: a stack is what sits on
 * top of a plate.
 */
export function buildEffectStack(
  layers: readonly EditorLayer[],
  tracks: readonly TimelineTrack[],
  fps: number
): EffectStack {
  const stackLayers: StackLayer[] = []

  for (const layer of layers) {
    if (
      layer.parentId ||
      !EFFECT_TYPES.has(layer.type) ||
      layer.unavailableLayer
    ) {
      continue
    }

    const definition = getLayerDefinition(layer.type)
    const params: Record<string, ParameterValue> = {}

    for (const param of definition.params) {
      const value = layer.params[param.key]
      if (
        value !== undefined &&
        JSON.stringify(value) !== JSON.stringify(param.defaultValue)
      ) {
        params[param.key] = structuredClone(value)
      }
    }

    const keys: Record<string, StackKeyframe[]> = {}

    for (const track of tracks) {
      if (
        track.layerId !== layer.id ||
        !track.enabled ||
        track.keyframes.length === 0
      ) {
        continue
      }

      const key =
        track.binding.kind === "param"
          ? track.binding.key
          : track.binding.property
      keys[key] = track.keyframes.map((keyframe) => {
        const easing = easingToStack(keyframe.easing)
        return {
          // House easing is the default, so it is left implicit.
          ...(easing === "house" ? {} : { easing }),
          t: keyframe.time,
          v: structuredClone(keyframe.value),
        }
      })
    }

    const entry: StackLayer = { id: layer.type }
    if (layer.name !== definition.defaultName) entry.name = layer.name
    if (Object.keys(params).length > 0) entry.params = params
    if (Object.keys(keys).length > 0) entry.keys = keys
    if (layer.opacity !== 1) entry.opacity = layer.opacity
    if (layer.blendMode !== "normal") entry.blendMode = layer.blendMode
    if (!layer.visible) entry.visible = false
    if (layer.timeStep) entry.timeStep = { ...layer.timeStep }
    if (layer.freeze) entry.freeze = { ...layer.freeze }
    stackLayers.push(entry)
  }

  return {
    format: STACK_FORMAT,
    fps,
    layers: stackLayers,
    version: STACK_VERSION,
  }
}

export function parseEffectStack(input: unknown): EffectStack {
  const raw = typeof input === "string" ? JSON.parse(input) : input

  if (!raw || typeof raw !== "object") {
    throw new Error("The stack must be a JSON object.")
  }

  const candidate = raw as Partial<EffectStack> & { layers?: unknown }

  if (candidate.format !== STACK_FORMAT) {
    throw new Error(
      `Not an Editor Lab stack (format should be "${STACK_FORMAT}").`
    )
  }

  if (!Array.isArray(candidate.layers)) {
    throw new Error('The stack needs a "layers" array.')
  }

  const layers: StackLayer[] = candidate.layers.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Layer ${index + 1} is not an object.`)
    }
    const layer = entry as unknown as Record<string, unknown>
    if (typeof layer.id !== "string" || !EFFECT_TYPES.has(layer.id)) {
      throw new Error(
        `Layer ${index + 1}: unknown effect "${String(layer.id)}".`
      )
    }
    const result: StackLayer = { id: layer.id as LayerType }
    if (typeof layer.name === "string") result.name = layer.name
    if (layer.params && typeof layer.params === "object") {
      result.params = layer.params as Record<string, ParameterValue>
    }
    if (layer.keys && typeof layer.keys === "object") {
      result.keys = layer.keys as Record<string, StackKeyframe[]>
    }
    if (typeof layer.opacity === "number") result.opacity = layer.opacity
    if (typeof layer.blendMode === "string") result.blendMode = layer.blendMode
    if (typeof layer.visible === "boolean") result.visible = layer.visible
    const timeStep = normalizeTimeStep(layer.timeStep)
    if (timeStep) result.timeStep = timeStep
    const freeze = normalizeFreeze(layer.freeze)
    if (freeze) result.freeze = freeze
    return result
  })

  return {
    format: STACK_FORMAT,
    ...(typeof candidate.fps === "number" ? { fps: candidate.fps } : {}),
    layers,
    ...(candidate.scene && typeof candidate.scene === "object"
      ? { scene: candidate.scene as Partial<SceneConfig> }
      : {}),
    version: STACK_VERSION,
  }
}

/**
 * Editor layers and timeline tracks for a stack, with fresh ids. Unknown
 * params and keys are dropped; values are clamped by the normal param
 * update path when they reach the store.
 */
export function stackToLayers(stack: EffectStack): {
  layers: EditorLayer[]
  tracks: TimelineTrack[]
} {
  const layers: EditorLayer[] = []
  const tracks: TimelineTrack[] = []
  const counts = new Map<string, number>()

  for (const entry of stack.layers) {
    const count = counts.get(entry.id) ?? 0
    counts.set(entry.id, count + 1)
    const layer = createLayer(entry.id, count)
    const definition = getLayerDefinition(entry.id)

    for (const [key, value] of Object.entries(entry.params ?? {})) {
      if (getParameterDefinition(definition.params, key)) {
        layer.params[key] = structuredClone(value)
      }
    }

    if (entry.name) layer.name = entry.name
    if (typeof entry.opacity === "number") {
      layer.opacity = Math.min(1, Math.max(0, entry.opacity))
    }
    if (entry.blendMode)
      layer.blendMode = entry.blendMode as EditorLayer["blendMode"]
    if (entry.visible === false) layer.visible = false
    if (entry.timeStep) layer.timeStep = { ...entry.timeStep }
    if (entry.freeze) layer.freeze = { ...entry.freeze }
    layers.push(layer)

    for (const [key, keyframes] of Object.entries(entry.keys ?? {})) {
      if (!Array.isArray(keyframes) || keyframes.length === 0) continue
      const binding =
        key === "opacity" ||
        key === "visible" ||
        key === "hue" ||
        key === "saturation"
          ? createLayerPropertyBinding(key)
          : createParamBinding(layer, key)
      if (!binding) continue
      const paramDefinition = getParameterDefinition(definition.params, key)
      if (
        binding.kind === "param" &&
        (!(paramDefinition && isParameterAnimatable(paramDefinition)))
      ) {
        continue
      }
      const sorted = keyframes
        .filter(
          (keyframe) =>
            typeof keyframe?.t === "number" && keyframe.v !== undefined
        )
        .sort((a, b) => a.t - b.t)
        .map(
          (keyframe): TimelineKeyframe => ({
            easing: easingFromStack(keyframe.easing),
            id: crypto.randomUUID(),
            time: Math.max(0, keyframe.t),
            value: structuredClone(keyframe.v),
          })
        )
      if (sorted.length === 0) continue
      tracks.push({
        binding,
        enabled: true,
        id: crypto.randomUUID(),
        keyframes: sorted,
        layerId: layer.id,
      })
    }
  }

  return { layers, tracks }
}

export function stringifyEffectStack(stack: EffectStack): string {
  return `${JSON.stringify(stack, null, 2)}\n`
}
