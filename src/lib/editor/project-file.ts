import {
  getDocumentSize,
  normalizeCompositionForDocument,
} from "@/lib/editor/composition"
import {
  normalizeAudioClips,
  normalizeAudioDucking,
} from "@/lib/editor/audio-clips"
import { migrateSceneFilmToLayers } from "@/editorlab/effects/migrate-scene-film"
import { normalizeTimeStep } from "@/editorlab/timing/time-step"
import { normalizeLayerClip } from "@/lib/editor/clip"
import { normalizeSceneFilmFields } from "@/lib/editor/scene-film"
import { normalizeSubtitleCues } from "@/lib/editor/subtitles"
import { modelMaterialDefaults } from "@/lib/editor/config/model-options"
import { LEGACY_MESH_GRADIENT_PRESETS } from "@/lib/editor/mesh-gradient"
import { CURRENT_PROJECT_FILE_VERSION } from "./project-version"
import { isLayerGroup, validateLayerHierarchy } from "@/renderer/layer-hierarchy"
import { MISSING_DEPTH_ERROR_PREFIX } from "@/renderer/layer-media-error"
import { z } from "zod"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { createDefaultColorCurves } from "@/lib/color-curves"
import {
  clampBandConfig,
  createDefaultAudioBands,
} from "@/lib/editor/audio/bands"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
} from "@/lib/editor/custom-shader/shared"
import { collectRemoteAssets } from "@/lib/editor/remote-asset"
import type {
  EditorAsset,
  EditorAudioSnapshot,
  EditorLayer,
  LayerParameterValues,
  PresetAssetReference,
  ProjectPresetConfig,
  SceneConfig,
  Size,
  TimelineStateSnapshot,
} from "@/types/editor"
import {
  AUDIO_BAND_IDS,
  BLEND_MODES,
  DEFAULT_SCENE_CONFIG,
  EFFECT_LAYER_TYPES,
  LAYER_COMPOSITE_MODES,
  MASK_MODES,
  MASK_SOURCES,
  SOURCE_LAYER_TYPES,
  LAYER_MASK_SCOPES,
  LAYER_MASK_SHAPES,
} from "@/types/editor"

export interface LabProjectFile extends ProjectPresetConfig {
  audio?: EditorAudioSnapshot
  composition: Size
  format: "shader-lab"
  sceneConfig?: SceneConfig
}

function toAssetReference(asset: EditorAsset): PresetAssetReference {
  const reference: PresetAssetReference = {
    fileName: asset.fileName,
    id: asset.id,
    kind: asset.kind,
  }

  if (asset.source !== "remote") {
    return reference
  }

  return {
    ...reference,
    duration: asset.duration,
    height: asset.height,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url: asset.url,
    width: asset.width,
  }
}

export function collectReferencedAssetIds(input: {
  audioClips?: EditorAudioSnapshot["clips"]
  audioSource: EditorAudioSnapshot["source"]
  layers: readonly EditorLayer[]
}): Set<string> {
  const referenced = new Set<string>()

  for (const layer of input.layers) {
    if (layer.assetId) {
      referenced.add(layer.assetId)
    }

    if (layer.depthAssetId) {
      referenced.add(layer.depthAssetId)
    }

    if (layer.environmentAssetId) {
      referenced.add(layer.environmentAssetId)
    }

    for (const assetId of layer.patternAssetIds ?? []) {
      referenced.add(assetId)
    }
  }

  if (input.audioSource?.kind === "asset") {
    referenced.add(input.audioSource.assetId)
  }

  for (const clip of input.audioClips ?? []) {
    referenced.add(clip.assetId)
  }

  return referenced
}

export function buildPublishableProjectFile(
  file: LabProjectFile
): LabProjectFile {
  // Preserve unavailable data in drafts/exports; publishing reports it explicitly.
  if (file.layers.some((layer) => layer.unavailableLayer)) return file

  const audioSource = file.audio?.source ?? null
  const audioLayerId =
    audioSource?.kind === "video-layer" ? audioSource.layerId : null
  const layersById = new Map(file.layers.map((layer) => [layer.id, layer]))
  const isHiddenByAncestor = (layer: (typeof file.layers)[number]) => {
    const seen = new Set<string>()
    let parentId = layer.parentId ?? null
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = layersById.get(parentId)
      if (!parent) {
        return false
      }
      if (!parent.visible) {
        return true
      }
      parentId = parent.parentId ?? null
    }
    return false
  }
  const keptLayers = file.layers.filter((layer) =>
    layer.id === audioLayerId
      ? true
      : layer.visible && !isHiddenByAncestor(layer)
  )
  const keptLayerIds = new Set(keptLayers.map((layer) => layer.id))
  const layers = keptLayers.map((layer) => {
    const detached =
      layer.parentId && !keptLayerIds.has(layer.parentId)
        ? { ...layer, parentId: null }
        : layer
    return layer.id === audioLayerId &&
      layer.visible &&
      isHiddenByAncestor(layer)
      ? { ...detached, visible: false }
      : detached
  })

  if (layers.length === file.layers.length) {
    return file
  }

  const keptIds = new Set(layers.map((layer) => layer.id))
  const referenced = collectReferencedAssetIds({
    audioClips: file.audio?.clips,
    audioSource,
    layers,
  })

  return {
    ...file,
    assets: file.assets.filter((asset) => referenced.has(asset.id)),
    ...(file.audio
      ? {
          audio: {
            ...file.audio,
            links: file.audio.links.filter((link) => keptIds.has(link.layerId)),
          },
        }
      : {}),
    layers,
    selectedLayerId:
      file.selectedLayerId && keptIds.has(file.selectedLayerId)
        ? file.selectedLayerId
        : null,
    timeline: {
      ...file.timeline,
      tracks: file.timeline.tracks.filter((track) =>
        keptIds.has(track.layerId)
      ),
    },
  }
}

export function buildLabProjectFile(): LabProjectFile {
  const assets = useAssetStore.getState().assets
  const editorState = useEditorStore.getState()
  const layerState = useLayerStore.getState()
  const timelineState = useTimelineStore.getState()
  const audio = structuredClone(useAudioStore.getState().getSnapshot())
  const referenced = collectReferencedAssetIds({
    audioClips: audio.clips,
    audioSource: audio.source,
    layers: layerState.layers,
  })

  return {
    assets: assets
      .filter((asset) => referenced.has(asset.id))
      .map(toAssetReference),
    audio,
    composition: structuredClone(
      getDocumentSize(editorState.sceneConfig, editorState.outputSize) ??
        editorState.outputSize
    ),
    exportedAt: new Date().toISOString(),
    format: "shader-lab",
    layers: structuredClone(layerState.layers),
    sceneConfig: structuredClone(editorState.sceneConfig),
    selectedLayerId: layerState.selectedLayerId,
    timeline: structuredClone({
      duration: timelineState.duration,
      loop: timelineState.loop,
      tracks: timelineState.tracks,
    }),
    version: CURRENT_PROJECT_FILE_VERSION,
  }
}

function normalizeProjectAudio(audio: unknown): EditorAudioSnapshot {
  const defaults: EditorAudioSnapshot = {
    bands: createDefaultAudioBands(),
    links: [],
    offsetSeconds: 0,
    source: null,
  }

  if (!audio || typeof audio !== "object") {
    return defaults
  }

  const candidate = audio as Partial<EditorAudioSnapshot>
  const bands = createDefaultAudioBands()

  if (candidate.bands && typeof candidate.bands === "object") {
    for (const bandId of AUDIO_BAND_IDS) {
      const persisted = candidate.bands[bandId]

      if (persisted) {
        bands[bandId] = clampBandConfig({ ...bands[bandId], ...persisted })
      }
    }
  }

  const links = Array.isArray(candidate.links)
    ? candidate.links
        .filter(
          (link) =>
            typeof link?.id === "string" &&
            typeof link?.layerId === "string" &&
            AUDIO_BAND_IDS.includes(link.band) &&
            typeof link?.outMin === "number" &&
            typeof link?.outMax === "number"
        )
        .map((link) => ({ ...link, enabled: link.enabled !== false }))
    : []

  return {
    bands,
    links,
    offsetSeconds:
      typeof candidate.offsetSeconds === "number" &&
      Number.isFinite(candidate.offsetSeconds)
        ? candidate.offsetSeconds
        : 0,
    source: candidate.source ?? null,
    ...optionalAudioClipFields(candidate),
  }
}

function optionalAudioClipFields(
  candidate: Partial<EditorAudioSnapshot>
): Pick<EditorAudioSnapshot, "clips" | "ducking"> {
  const clips = normalizeAudioClips(candidate.clips)
  const ducking = normalizeAudioDucking(candidate.ducking)
  return {
    ...(clips && clips.length > 0 ? { clips } : {}),
    ...(ducking ? { ducking } : {}),
  }
}

const parameterValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
])

const maskConfigSchema = z.looseObject({
  invert: z.boolean(),
  mode: z.enum(MASK_MODES),
  source: z.enum(MASK_SOURCES),
})

const layerMaskSchema = z.looseObject({
  shape: z.enum(LAYER_MASK_SHAPES),
  scope: z.enum(LAYER_MASK_SCOPES),
  enabled: z.boolean(),
  invert: z.boolean(),
  center: z.tuple([z.number(), z.number()]),
  size: z.tuple([z.number(), z.number()]),
  rotation: z.number(),
  feather: z.number(),
  paint: z.string(),
})

const baseLayerShape = {
  parentId: z.string().nullable().optional(),
  assetId: z.string().nullable(),
  depthAssetId: z.string().nullable().optional(),
  environmentAssetId: z.string().nullable().optional(),
  patternAssetIds: z.array(z.string()).optional(),
  blendMode: z.enum(BLEND_MODES),
  compositeMode: z.enum(LAYER_COMPOSITE_MODES),
  expanded: z.boolean(),
  fluidInteractionEvents: z.array(z.looseObject({})).optional(),
  hue: z.number(),
  id: z.string(),
  locked: z.boolean(),
  mask: layerMaskSchema.nullable().optional(),
  maskConfig: maskConfigSchema.optional(),
  name: z.string(),
  opacity: z.number(),
  params: z.record(z.string(), parameterValueSchema),
  runtimeError: z.string().nullable().optional(),
  saturation: z.number(),
  visible: z.boolean(),
}

const knownLayerSchema = z.discriminatedUnion("kind", [
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("group"),
    type: z.literal("group"),
    compositeMode: z.literal("filter"),
  }),
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("effect"),
    type: z.enum(EFFECT_LAYER_TYPES),
  }),
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("model"),
    type: z.literal("model"),
  }),
  z.looseObject({
    ...baseLayerShape,
    kind: z.literal("source"),
    type: z.enum(SOURCE_LAYER_TYPES),
  }),
])

// Keep unknown types recoverable without letting malformed known layers bypass validation.
const unknownLayerSchema = z.looseObject({
  ...baseLayerShape,
  kind: z.string().min(1),
  type: z.string().min(1),
})
const knownLayerTypes = new Set<string>([
  ...SOURCE_LAYER_TYPES,
  ...EFFECT_LAYER_TYPES,
  "model",
  "group",
])

const layerSchema = z.preprocess((value) => {
  if (!(value && typeof value === "object")) return value
  const candidate = value as Record<string, unknown>
  const original = candidate.unavailableLayer ?? candidate
  const result = unknownLayerSchema.safeParse(original)
  if (!result.success) return candidate.unavailableLayer ? null : value
  const raw = result.data
  if (knownLayerTypes.has(raw.type)) {
    // A newer app can restore a formerly unavailable layer from its saved payload.
    return candidate.unavailableLayer
      ? { ...raw, id: candidate.id, parentId: candidate.parentId }
      : value
  }
  return {
    ...raw,
    id: candidate.id,
    parentId: candidate.parentId,
    kind: "group",
    type: "group",
    compositeMode: "filter",
    name: candidate.unavailableLayer
      ? candidate.name
      : `${raw.name} (Unavailable: ${raw.type})`,
    visible: false,
    locked: true,
    params: {},
    mask: null,
    runtimeError: `Layer type "${raw.type}" is unavailable. Its original data is preserved.`,
    unavailableLayer: raw,
  }
}, knownLayerSchema)

export function describeUnavailableLayers(file: LabProjectFile): string | null {
  const count = file.layers.filter((layer) => layer.unavailableLayer).length
  return count > 0
    ? `This scene contains ${count} unavailable layer(s). Remove or replace them before publishing; their original data is preserved in the project.`
    : null
}

const timelineKeyframeSchema = z.looseObject({
  id: z.string(),
  time: z.number(),
  value: parameterValueSchema,
})

const timelineTrackSchema = z.looseObject({
  binding: z.looseObject({}),
  enabled: z.boolean(),
  id: z.string(),
  keyframes: z.array(timelineKeyframeSchema),
  layerId: z.string(),
})

const assetReferenceSchema = z.looseObject({
  duration: z.number().nullable().optional(),
  fileName: z.string(),
  height: z.number().nullable().optional(),
  id: z.string(),
  kind: z.string(),
  mimeType: z.string().optional(),
  sha256: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  width: z.number().nullable().optional(),
})

const audioBandConfigSchema = z.looseObject({
  attackMs: z.number(),
  gainDb: z.number(),
  highHz: z.number(),
  lowHz: z.number(),
  releaseMs: z.number(),
})

const audioLinkSchema = z.looseObject({
  band: z.string(),
  binding: z.looseObject({}),
  enabled: z.boolean().optional(),
  id: z.string(),
  layerId: z.string(),
  outMax: z.number(),
  outMin: z.number(),
})

const projectAudioSchema = z.looseObject({
  bands: z.record(z.string(), audioBandConfigSchema).optional(),
  links: z.array(audioLinkSchema).optional(),
  offsetSeconds: z.number().optional(),
  source: z.looseObject({ kind: z.string() }).nullable().optional(),
})

export { CURRENT_PROJECT_FILE_VERSION } from "./project-version"

const labProjectFileSchema = z.looseObject({
  assets: z.array(assetReferenceSchema),
  audio: projectAudioSchema.optional(),
  composition: z.looseObject({
    height: z.number().positive(),
    width: z.number().positive(),
  }),
  exportedAt: z.string().optional(),
  format: z.literal("shader-lab"),
  layers: z.array(layerSchema),
  sceneConfig: z.looseObject({}).optional(),
  selectedLayerId: z.string().nullable().optional(),
  timeline: z.looseObject({
    duration: z.number(),
    loop: z.boolean(),
    tracks: z.array(timelineTrackSchema),
  }),
  version: z.number().int().positive().max(CURRENT_PROJECT_FILE_VERSION),
})

const PARSE_ISSUE_MESSAGES: {
  matches: (path: readonly PropertyKey[]) => boolean
  message: string
}[] = [
  {
    matches: (path) => path[0] === "format",
    message: "This file is not a Shader Lab `.lab` project.",
  },
  {
    matches: (path) => path[0] === "version",
    message: "Unsupported Shader Lab project version.",
  },
  {
    matches: (path) => path[0] === "layers",
    message: "Project file is missing a valid layer stack.",
  },
  {
    matches: (path) => path[0] === "timeline" && path[1] === "tracks",
    message: "Project file is missing valid timeline tracks.",
  },
  {
    matches: (path) => path[0] === "timeline",
    message: "Project file is missing timeline data.",
  },
  {
    matches: (path) => path[0] === "composition",
    message: "Project file is missing composition dimensions.",
  },
  {
    matches: (path) => path[0] === "audio",
    message: "Project file has an unreadable audio configuration.",
  },
  {
    matches: (path) => path[0] === "assets",
    message: "Project file has an unreadable asset list.",
  },
]

function toParseError(issues: readonly z.core.$ZodIssue[]): Error {
  for (const rule of PARSE_ISSUE_MESSAGES) {
    if (issues.some((issue) => rule.matches(issue.path))) {
      return new Error(rule.message)
    }
  }

  return new Error("The selected file is not a valid Shader Lab project.")
}

export function parseLabProjectFileValue(parsed: unknown): LabProjectFile {
  if (!(parsed && typeof parsed === "object")) {
    throw new Error("The selected file is not a valid Shader Lab project.")
  }

  const result = labProjectFileSchema.safeParse(parsed)

  if (!result.success) {
    throw toParseError(result.error.issues)
  }

  validateLayerHierarchy(result.data.layers)
  if (
    result.data.version < 7 &&
    result.data.layers.some((layer) =>
      isLayerGroup(layer) || layer.parentId
    )
  ) {
    throw new Error("Groups require project version 7 or later.")
  }
  return structuredClone(result.data) as unknown as LabProjectFile
}

export function parseLabProjectFile(input: string): LabProjectFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error("The selected file is not valid JSON.")
  }

  return parseLabProjectFileValue(parsed)
}

const CUSTOM_SHADER_STARTER_SOURCES = new Set<string>([
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_STARTER,
])

export function hasImportedCustomShaderCode(
  projectFile: LabProjectFile
): boolean {
  return projectFile.layers.some((layer) => {
    if (layer.type !== "custom-shader") {
      return false
    }

    const sourceCode = layer.params.sourceCode

    return (
      typeof sourceCode === "string" &&
      sourceCode.trim().length > 0 &&
      !CUSTOM_SHADER_STARTER_SOURCES.has(sourceCode)
    )
  })
}

function isAudioSourceResolvable(
  source: EditorAudioSnapshot["source"],
  assetIds: Set<string>,
  layers: EditorLayer[]
): boolean {
  if (!source) {
    return true
  }

  if (source.kind === "asset") {
    return assetIds.has(source.assetId)
  }

  return layers.some((layer) => layer.id === source.layerId)
}

export function applyLabProjectFile(
  projectFile: LabProjectFile,
  currentAssets: EditorAsset[]
): { missingAssetCount: number; missingAudioSource: boolean } {
  validateLayerHierarchy(projectFile.layers)
  const existingIds = new Set(currentAssets.map((asset) => asset.id))
  const remoteAssets = collectRemoteAssets(projectFile.assets, existingIds)

  if (remoteAssets.length > 0) {
    useAssetStore.getState().replaceAssets([...currentAssets, ...remoteAssets])
  }

  const assetIds = new Set([
    ...existingIds,
    ...remoteAssets.map((asset) => asset.id),
  ])
  const assetRefById = new Map(
    projectFile.assets.map((asset) => [asset.id, asset])
  )

  const migrated = migrateSceneFilmToLayers(
    projectFile.sceneConfig as Record<string, unknown> | undefined,
    projectFile.layers.map((layer) =>
      hydrateImportedLayer(layer, assetIds, assetRefById, projectFile.version)
    )
  )
  const nextLayers = migrated.layers
  const sceneConfig = migrated.scene

  const hasSelectedLayer = nextLayers.some(
    (layer) => layer.id === projectFile.selectedLayerId
  )

  useLayerStore
    .getState()
    .replaceState(
      nextLayers,
      hasSelectedLayer ? projectFile.selectedLayerId : null,
      null
    )

  useTimelineStore.getState().replaceState({
    currentTime: 0,
    duration: projectFile.timeline.duration,
    isPlaying: true,
    loop: projectFile.timeline.loop,
    selectedKeyframeId: null,
    selectedKeyframeIds: [],
    selectedTrackId: null,
    tracks: projectFile.timeline.tracks,
  })

  useTimelineStore.getState().pruneTracks(nextLayers)

  const audioSnapshot = normalizeProjectAudio(projectFile.audio)
  useAudioStore.getState().replaceState(audioSnapshot)

  const editorStore = useEditorStore.getState()
  if (projectFile.version >= 2 && sceneConfig) {
    editorStore.setOutputSize(
      projectFile.composition.width,
      projectFile.composition.height
    )
    editorStore.updateSceneConfig(
      normalizeCompositionForDocument(
        normalizeSceneConfig(sceneConfig as Partial<SceneConfig>),
        projectFile.composition
      )
    )
  } else {
    editorStore.updateSceneConfig(DEFAULT_SCENE_CONFIG)
  }

  editorStore.noteSceneReplaced()

  return {
    missingAssetCount: nextLayers.filter(
      (layer) =>
        Boolean(layer.assetId && layer.runtimeError) ||
        Boolean(layer.runtimeError?.startsWith("Missing motif:"))
    ).length,
    missingAudioSource: !isAudioSourceResolvable(
      audioSnapshot.source,
      assetIds,
      nextLayers
    ),
  }
}

export interface ViewerProjectState {
  /** Saved settings; renderer frame audio requires analyzed envelopes instead. */
  audioSnapshot: EditorAudioSnapshot
  assets: EditorAsset[]
  composition: Size
  layers: EditorLayer[]
  sceneConfig: SceneConfig
  timeline: TimelineStateSnapshot
}

export function buildViewerProjectState(
  projectFile: LabProjectFile
): ViewerProjectState {
  const assets = collectRemoteAssets(projectFile.assets, new Set())
  const assetIds = new Set(assets.map((asset) => asset.id))
  const assetRefById = new Map(
    projectFile.assets.map((asset) => [asset.id, asset])
  )
  const migrated = migrateSceneFilmToLayers(
    projectFile.sceneConfig as Record<string, unknown> | undefined,
    projectFile.layers.map((layer) =>
      hydrateImportedLayer(layer, assetIds, assetRefById, projectFile.version)
    )
  )
  const layers = migrated.layers
  const sceneConfig = migrated.scene

  return {
    assets,
    audioSnapshot: normalizeProjectAudio(projectFile.audio),
    composition: projectFile.composition,
    layers,
    sceneConfig:
      projectFile.version >= 2 && sceneConfig
        ? normalizeCompositionForDocument(
            normalizeSceneConfig(sceneConfig as Partial<SceneConfig>),
            projectFile.composition
          )
        : DEFAULT_SCENE_CONFIG,
    timeline: {
      currentTime: 0,
      duration: projectFile.timeline.duration,
      isPlaying: true,
      loop: projectFile.timeline.loop,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: projectFile.timeline.tracks,
    },
  }
}

function normalizeSceneConfig(sceneConfig: Partial<SceneConfig>): SceneConfig {
  const defaultCurves = createDefaultColorCurves()
  const colorCurves = sceneConfig.colorCurves
  const quantizeEnabled =
    typeof sceneConfig.quantizeEnabled === "boolean"
      ? sceneConfig.quantizeEnabled
      : typeof sceneConfig.quantizeLevels === "number" &&
        sceneConfig.quantizeLevels !== DEFAULT_SCENE_CONFIG.quantizeLevels

  return normalizeSceneFilmFields({
    ...DEFAULT_SCENE_CONFIG,
    ...sceneConfig,
    channelMixer: {
      ...DEFAULT_SCENE_CONFIG.channelMixer,
      ...sceneConfig.channelMixer,
    },
    colorCurves: {
      ...defaultCurves,
      ...colorCurves,
    },
    quantizeEnabled,
  })
}

const LEGACY_ASCII_FONT_WEIGHTS: Record<string, number> = {
  bold: 700,
  regular: 400,
  thin: 100,
}

export function migrateLayerParams(
  layer: EditorLayer,
  version: number
): LayerParameterValues {
  const params: LayerParameterValues = { ...layer.params }

  if (layer.type === "displaced-rings") {
    const previousDefaults: LayerParameterValues = {
      shape: "rings",
      count: 8,
      radius: 0.9,
      offset: [0.045, 0],
      rotationStep: 12,
      gap: 0.04,
    }
    for (const [key, value] of Object.entries(previousDefaults)) {
      if (params[key] === undefined) params[key] = value
    }
  }

  if (layer.type === "photographic-cells") {
    const previousDefaults: LayerParameterValues = {
      mode: "cells",
      outlineMode: "every-cell",
      selection: "light",
      threshold: 0.35,
      size: 0.1,
      irregularity: 0.35,
      gap: 0.08,
      outline: 0,
      outlineColor: "#e8e5dc",
    }
    for (const [key, value] of Object.entries(previousDefaults)) {
      if (params[key] === undefined) params[key] = value
    }
  }

  if (layer.type === "gradient") {
    if (params.distortionMode === undefined) params.distortionMode = "advanced"
    if (params.motionStyle === undefined)
      params.motionStyle = params.animate === false ? "off" : "original"
    if (
      typeof params.preset === "string" &&
      LEGACY_MESH_GRADIENT_PRESETS.has(params.preset)
    )
      params.preset = "custom"
  }

  if (layer.type === "text" && params.backgroundAlpha === undefined) {
    params.backgroundAlpha = 1
  }

  if (
    (layer.type === "image" || layer.type === "video") &&
    params.transparentBounds === undefined
  ) {
    params.transparentBounds = false
  }

  if (layer.type === "blob-tracking" && params.frameStyle === undefined) {
    params.frameStyle = params.showOutline === false ? "none" : "outline"
  }

  if (layer.type === "blob-tracking" && params.squareShapes === undefined) {
    params.squareShapes = false
  }

  if (layer.type === "ascii" && typeof params.fontWeight === "string") {
    params.fontWeight = LEGACY_ASCII_FONT_WEIGHTS[params.fontWeight] ?? 400
  }

  if (
    version < 6 &&
    layer.type === "blob-tracking" &&
    typeof params.sensitivity === "number"
  ) {
    params.sensitivity = 1 - params.sensitivity
  }

  if (layer.type === "model" && params.materialMetalness === undefined) {
    params.materialMetalness = modelMaterialDefaults(params.material)?.metalness ?? 1
  }

  for (const parameter of getLayerDefinition(layer.type).params) {
    if (params[parameter.key] === undefined) {
      params[parameter.key] = parameter.defaultValue
    }
  }

  return params
}

/**
 * Validates the optional editing fields (`clip`, `subtitles`, `timeStep`) from untrusted
 * project files. Absent fields stay absent so legacy projects round-trip
 * byte-for-byte; malformed ones are dropped rather than rejecting the file.
 */
export function normalizeLayerTiming(layer: EditorLayer): EditorLayer {
  if (!("clip" in layer || "subtitles" in layer || "timeStep" in layer)) {
    return layer
  }

  const next: EditorLayer = { ...layer }

  if ("clip" in layer) {
    const clip = normalizeLayerClip(layer.clip)
    if (clip) next.clip = clip
    else delete next.clip
  }

  if ("subtitles" in layer) {
    const cues =
      layer.type === "text" ? normalizeSubtitleCues(layer.subtitles) : null
    if (cues) next.subtitles = cues
    else delete next.subtitles
  }

  if ("timeStep" in layer) {
    const step = normalizeTimeStep(layer.timeStep)
    if (step) next.timeStep = step
    else delete next.timeStep
  }

  return next
}

function hydrateImportedLayer(
  input: EditorLayer,
  assetIds: Set<string>,
  assetRefById: Map<string, LabProjectFile["assets"][number]>,
  version: number
): EditorLayer {
  if (input.unavailableLayer) return { ...input, visible: false, locked: true }
  const layer = normalizeLayerTiming(input)
  const params = migrateLayerParams(layer, version)
  const depthRef = layer.depthAssetId
    ? assetRefById.get(layer.depthAssetId)
    : undefined
  const depthApplies = layer.type === "image"
  const depthResolved = Boolean(
    layer.depthAssetId && assetIds.has(layer.depthAssetId)
  )
  const depthIsImage = !depthRef || depthRef.kind === "image"
  const depthAssetId =
    depthApplies && depthIsImage ? (layer.depthAssetId ?? null) : null
  const depthFileName = depthRef?.fileName ?? "unknown file"
  const depthErrorDetail = depthResolved ? " is not an image" : ""
  const depthError =
    layer.depthAssetId && depthApplies && !(depthResolved && depthIsImage)
      ? `${MISSING_DEPTH_ERROR_PREFIX}: ${depthFileName}${depthErrorDetail}`
      : null
  const missingMotifId = layer.patternAssetIds?.find((id) => !assetIds.has(id))
  const linkedAssets =
    layer.depthAssetId !== undefined ? { depthAssetId } : {}

  if (!(layer.assetId && !assetIds.has(layer.assetId))) {
    const environmentError =
      layer.environmentAssetId && !assetIds.has(layer.environmentAssetId)
        ? `Missing environment: ${assetRefById.get(layer.environmentAssetId)?.fileName ?? "unknown file"}`
        : null
    const motifError = missingMotifId
      ? `Missing motif: ${assetRefById.get(missingMotifId)?.fileName ?? "unknown file"}`
      : null
    return {
      ...layer,
      ...linkedAssets,
      params,
      runtimeError:
        depthError ??
        environmentError ??
        motifError ??
        layer.runtimeError ??
        null,
    }
  }

  const assetRef = assetRefById.get(layer.assetId)

  return {
    ...layer,
    ...linkedAssets,
    params,
    runtimeError: assetRef
      ? `Missing asset: ${assetRef.fileName}`
      : "Missing asset reference",
  }
}
