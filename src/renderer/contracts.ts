import { buildCompositionTree } from "./layer-hierarchy"
import {
  applyAudioModulation,
  type AudioModulationInput,
} from "@/lib/editor/audio/links"
import {
  applyMaskOverrides,
  stripMaskParams,
} from "@/lib/editor/mask-animation"
import { cloneParameterValues } from "@/lib/editor/parameter-schema"
import { getClipFadeFactor, isTimeInClip } from "@/lib/editor/clip"
import { getActiveSubtitleText } from "@/lib/editor/subtitles"
import {
  applyTimeSteps,
  collectLayerTimeSteps,
} from "@/editorlab/timing/time-step"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { createProjectClock } from "@/renderer/project-clock"
import type { CompositionNode } from "@/renderer/composition-tree"
import type {
  EditorAsset,
  EditorLayer,
  LayerParameterValues,
  LayerTimeStep,
  SceneConfig,
  Size,
  TimelineStateSnapshot,
} from "@/types/editor"

export interface ProjectClock {
  delta: number
  duration: number
  isPlaying: boolean
  loop: boolean
  timelineTime: number
  time: number
}

export interface RenderableLayerPass {
  asset: EditorAsset | null
  depthAsset: EditorAsset | null
  environmentAsset: EditorAsset | null
  layer: EditorLayer
  params: LayerParameterValues
  patternAssets?: EditorAsset[]
  /** Stepped-timing chain for this layer (outermost group first). */
  timeSteps?: LayerTimeStep[]
}

export interface RendererFrame {
  clock: ProjectClock
  cropAspectRatio: number | null
  layers: CompositionNode<RenderableLayerPass>[]
  logicalSize: Size
  outputSize: Size
  pixelRatio: number
  sceneConfig: SceneConfig
  viewportSize: Size
}

export interface EditorRenderer {
  destroyDevice(): Promise<void>
  dispose(): void
  exportFrame(frame: RendererFrame, renderSize: Size): HTMLCanvasElement
  hasPendingCompilations(): boolean
  hasPendingResources(): boolean
  initialize(): Promise<void>
  isDeviceLost(): boolean
  prepareForExportFrame(time: number, loop: boolean): Promise<void>
  render(frame: RendererFrame): void
  resize(size: Size, pixelRatio: number): void
  setPreviewFrozen(frozen: boolean): void
  waitForGpuIdle(): Promise<boolean>
}

export type BuildRendererFrameInput = {
  assets: EditorAsset[]
  audio?: AudioModulationInput | null
  clockTime?: number
  cropAspectRatio?: number | null
  delta: number
  layers: EditorLayer[]
  logicalSize?: Size
  outputSize: Size
  pixelRatio: number
  sceneConfig: SceneConfig
  timeline: TimelineStateSnapshot
  viewportSize: Size
}

const paramsCloneCache = new WeakMap<
  LayerParameterValues,
  LayerParameterValues
>()

function getCachedClone(params: LayerParameterValues): LayerParameterValues {
  let cached = paramsCloneCache.get(params)
  if (!cached) {
    cached = cloneParameterValues(params)
    paramsCloneCache.set(params, cached)
  }
  return cached
}

/** Keyframes evaluated per layer time (stepped layers hold their poses). */
function evaluateSteppedTimeline(
  layers: EditorLayer[],
  tracks: TimelineStateSnapshot["tracks"],
  timeOf: (layer: EditorLayer) => number
) {
  const buckets = new Map<number, EditorLayer[]>()

  for (const layer of layers) {
    const time = timeOf(layer)
    const bucket = buckets.get(time)
    if (bucket) bucket.push(layer)
    else buckets.set(time, [layer])
  }

  if (buckets.size <= 1) {
    const [time = 0] = buckets.keys()
    return evaluateTimelineForLayers(layers, tracks, time)
  }

  return [...buckets].flatMap(([time, bucket]) =>
    evaluateTimelineForLayers(bucket, tracks, time)
  )
}

export function buildRendererFrame(
  input: BuildRendererFrameInput
): RendererFrame {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]))
  const timeSteps = collectLayerTimeSteps(input.layers)
  const layerTime = (layer: EditorLayer) =>
    applyTimeSteps(input.timeline.currentTime, timeSteps.get(layer.id))
  const keyframeStates = evaluateSteppedTimeline(
    input.layers,
    input.timeline.tracks,
    layerTime
  )
  const evaluatedLayers = input.audio
    ? applyAudioModulation(
        input.layers,
        keyframeStates,
        input.audio,
        input.timeline.currentTime
      )
    : keyframeStates
  const evaluatedById = new Map(
    evaluatedLayers.map((state) => [state.layerId, state])
  )

  // Layers hidden only because the playhead is outside their clip (or
  // between subtitle cues). They are kept in the tree, disabled.
  const timedOutIds = new Set<string>()
  const layers = input.layers.map((layer) => {
    const evaluation = evaluatedById.get(layer.id)
    const time = layerTime(layer)
    const steps = timeSteps.get(layer.id)
    const evaluatedParams = evaluation
      ? stripMaskParams({ ...getCachedClone(layer.params), ...evaluation.params })
      : getCachedClone(layer.params)
    const subtitleText =
      layer.type === "text" && layer.subtitles
        ? getActiveSubtitleText(layer.subtitles, time)
        : null
    const timedOut =
      !isTimeInClip(layer.clip, time) ||
      subtitleText === ""

    if (
      timedOut &&
      !layer.unavailableLayer &&
      (typeof evaluation?.properties.visible === "boolean"
        ? evaluation.properties.visible
        : layer.visible)
    ) {
      timedOutIds.add(layer.id)
    }
    const params =
      subtitleText === null
        ? evaluatedParams
        : { ...evaluatedParams, text: subtitleText }
    const mask =
      evaluation && layer.mask
        ? applyMaskOverrides(layer.mask, evaluation.params)
        : layer.mask

    return {
      asset: layer.assetId ? (assetById.get(layer.assetId) ?? null) : null,
      depthAsset: layer.depthAssetId
        ? (assetById.get(layer.depthAssetId) ?? null)
        : null,
      environmentAsset: layer.environmentAssetId
        ? (assetById.get(layer.environmentAssetId) ?? null)
        : null,
      ...(layer.patternAssetIds
        ? {
            patternAssets: layer.patternAssetIds.flatMap((id) => {
              const asset = assetById.get(id)
              return asset ? [asset] : []
            }),
          }
        : {}),
      layer: {
        ...layer,
        ...(mask !== layer.mask ? { mask } : {}),
        hue:
          typeof evaluation?.properties.hue === "number"
            ? evaluation.properties.hue
            : layer.hue,
        opacity:
          (typeof evaluation?.properties.opacity === "number"
            ? evaluation.properties.opacity
            : layer.opacity) *
          getClipFadeFactor(layer.clip, time),
        saturation:
          typeof evaluation?.properties.saturation === "number"
            ? evaluation.properties.saturation
            : layer.saturation,
        visible:
          !(layer.unavailableLayer || timedOut) &&
          (typeof evaluation?.properties.visible === "boolean"
            ? evaluation.properties.visible
            : layer.visible),
      },
      params,
      ...(steps ? { timeSteps: steps } : {}),
    }
  })

  const entryById = new Map(layers.map((entry) => [entry.layer.id, entry]))
  return {
    clock: createProjectClock(input.timeline, input.delta, input.clockTime),
    cropAspectRatio: input.cropAspectRatio ?? null,
    layers: buildCompositionTree(
      layers.map((entry) => entry.layer),
      (layer) => entryById.get(layer.id)!,
      (layer) => timedOutIds.has(layer.id)
    ),
    logicalSize: input.logicalSize ?? input.viewportSize,
    outputSize: input.outputSize,
    pixelRatio: input.pixelRatio,
    sceneConfig: input.sceneConfig,
    viewportSize: input.viewportSize,
  }
}
