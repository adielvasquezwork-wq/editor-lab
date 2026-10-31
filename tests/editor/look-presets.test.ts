import { beforeEach, describe, expect, test } from "bun:test"
import {
  applyLookPreset,
  clearLookPreset,
  detectAppliedLook,
  LOOK_LAYER_PREFIX,
  LOOK_PRESETS,
  LOOK_SCENE_KEYS,
} from "@/editorlab/presets/look-presets"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG, type EditorLayer } from "@/types/editor"

function seed(layers: EditorLayer[]) {
  useLayerStore.getState().replaceState(layers, layers[0]?.id ?? null)
  useEditorStore.getState().updateSceneConfig({ ...DEFAULT_SCENE_CONFIG })
}

const layers = () => useLayerStore.getState().layers
const scene = () => useEditorStore.getState().sceneConfig

describe("look presets", () => {
  beforeEach(() => seed([createLayer("image")]))

  test("every preset only uses known layer types and params", () => {
    for (const preset of LOOK_PRESETS) {
      for (const layer of preset.layers) {
        const keys = new Set(
          getLayerDefinition(layer.type).params.map((param) => param.key)
        )
        for (const key of Object.keys(layer.params)) {
          expect(`${preset.id}:${layer.type}.${key}:${keys.has(key)}`).toBe(
            `${preset.id}:${layer.type}.${key}:true`
          )
        }
      }
      for (const key of Object.keys(preset.scene)) {
        expect(
          key in DEFAULT_SCENE_CONFIG ||
            key === "vignette" ||
            key === "letterbox" ||
            key === "splitTone"
        ).toBe(true)
      }
    }
  })

  test("applying adds the preset layers on top, in file order, above the media", () => {
    const [image] = layers()
    const added = applyLookPreset("jani")
    expect(added).toHaveLength(3)
    expect(layers().map((layer) => layer.type)).toEqual([
      "bloom",
      "focus-blur",
      "grain",
      "image",
    ])
    expect(layers()[0]!.name).toBe(`${LOOK_LAYER_PREFIX}Tight bloom`)
    expect(layers()[3]!.id).toBe(image!.id)
    expect(layers()[1]!.params.radius).toBe(22)
    expect(layers()[2]!.params.filmRate).toBe("23.976")
    expect(scene().saturation).toBe(0.7)
    expect(scene().vignette?.amount).toBe(2)
    expect(detectAppliedLook(layers().map((layer) => layer.name))).toBe("jani")
  })

  test("switching looks replaces layers and resets scene fields the new look doesn't set", () => {
    applyLookPreset("fern")
    expect(scene().letterbox?.aspect).toBe(2)
    expect(scene().exposure).toBe(-0.15)

    applyLookPreset("chuppl")
    expect(layers().map((layer) => layer.type)).toEqual([
      "leave-color",
      "grain",
      "image",
    ])
    expect(scene().letterbox).toBeUndefined()
    expect(scene().vignette).toBeUndefined()
    expect(scene().exposure).toBe(DEFAULT_SCENE_CONFIG.exposure)
    expect(scene().contrast).toBe(-0.1)
    expect(detectAppliedLook(layers().map((layer) => layer.name))).toBe(
      "chuppl"
    )
  })

  test("clearing removes look layers only and restores look scene fields", () => {
    useEditorStore.getState().updateSceneConfig({ temperature: 12 })
    applyLookPreset("jani")
    clearLookPreset()
    expect(layers().map((layer) => layer.type)).toEqual(["image"])
    for (const key of LOOK_SCENE_KEYS) {
      expect(scene()[key]).toEqual(DEFAULT_SCENE_CONFIG[key])
    }
    expect(scene().temperature).toBe(12)
  })

  test("unknown preset ids are ignored", () => {
    expect(applyLookPreset("nope")).toEqual([])
    expect(layers()).toHaveLength(1)
  })
})

describe("look presets keep the selection", () => {
  test("selection is unchanged after applying (so the Scene panel stays open)", () => {
    const image = createLayer("image")
    useLayerStore.getState().replaceState([image], null)
    applyLookPreset("fern")
    expect(useLayerStore.getState().selectedLayerId).toBeNull()
    useLayerStore.getState().selectLayer(image.id)
    applyLookPreset("jani")
    expect(useLayerStore.getState().selectedLayerId).toBe(image.id)
    expect(useLayerStore.getState().selectedLayerIds).toEqual([image.id])
  })
})
