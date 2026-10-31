import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { EDITORLAB_EFFECT_LAYER_TYPES } from "@/editorlab/effects/ids"
import {
  migrateSceneFilmToLayers,
  splitToneParamsFromScene,
  vignetteParamsFromScene,
} from "@/editorlab/effects/migrate-scene-film"
import { EDITORLAB_EFFECTS } from "@/editorlab/effects/registry"
import { LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import { normalizeSceneFilmFields } from "@/lib/editor/scene-film"
import { DEFAULT_SCENE_CONFIG, type SceneConfig } from "@/types/editor"

describe("effect registry", () => {
  test("every effect id is registered once, with a layer definition and catalog entry", () => {
    expect(EDITORLAB_EFFECTS.map((effect) => effect.layerType).sort()).toEqual(
      [...EDITORLAB_EFFECT_LAYER_TYPES].sort()
    )
    expect(new Set(EDITORLAB_EFFECTS.map((effect) => effect.id)).size).toBe(
      EDITORLAB_EFFECTS.length
    )
    for (const effect of EDITORLAB_EFFECTS) {
      const definition = getLayerDefinition(effect.layerType)
      expect(definition.kind).toBe("effect")
      expect(definition.params).toBe(effect.params)
      expect(LAYER_CATALOG[effect.layerType].label).toBe(effect.label)
      expect(effect.stateful).toBe(false)
    }
  })

  test("new layers get every param's default", () => {
    for (const effect of EDITORLAB_EFFECTS) {
      const layer = createLayer(effect.layerType)
      for (const param of effect.params) {
        expect(layer.params[param.key]).toEqual(param.defaultValue)
      }
    }
  })

  test("CLI lists and describes effects as JSON", async () => {
    const list = JSON.parse(
      await $`bun scripts/editorlab.ts effects list`.quiet().text()
    ) as { id: string; source: string }[]
    expect(
      list.filter((e) => e.source === "editorlab").map((e) => e.id)
    ).toEqual(EDITORLAB_EFFECTS.map((effect) => effect.id))
    expect(list.some((e) => e.id === "focus-blur")).toBe(true)
    const vignette = JSON.parse(
      await $`bun scripts/editorlab.ts effects describe vignette`.quiet().text()
    ) as { params: { key: string }[] }
    expect(vignette.params.map((param) => param.key)).toContain("squareness")
    const missing = await $`bun scripts/editorlab.ts effects describe nope`
      .quiet()
      .nothrow()
    expect(missing.exitCode).toBe(1)
  })
})

describe("scene vignette / split tone migration", () => {
  const legacyScene = {
    ...DEFAULT_SCENE_CONFIG,
    letterbox: { aspect: 2, color: "#000000" },
    splitTone: {
      balance: 0.2,
      highlightAmount: 0.1,
      highlightColor: "#ff9fd0",
      shadowAmount: 0.4,
      shadowColor: "#1f8f8f",
    },
    vignette: { amount: 1.5, inner: 0.3, outer: 1.1, roundness: 0.5 },
  }

  test("adds equivalent layers on top and keeps letterbox in the scene", () => {
    const base = createLayer("image")
    const { layers, scene } = migrateSceneFilmToLayers(legacyScene, [base])
    expect(layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "split-tone",
      "image",
    ])
    expect(layers[0]!.params).toMatchObject({
      amount: 1.5,
      radius: 0.3,
      roundness: 0.5,
      squareness: 0,
    })
    expect(layers[0]!.params.softness).toBeCloseTo(0.8)
    expect(scene && "vignette" in scene).toBe(false)
    expect(scene && "splitTone" in scene).toBe(false)
    expect(scene?.letterbox).toEqual({ aspect: 2, color: "#000000" })
  })

  test("split tone keeps the hue and balance", () => {
    const params = splitToneParamsFromScene(legacyScene.splitTone)!
    expect(params.shadowHue).toBe(180)
    expect(params.highlightHue).toBeGreaterThan(320)
    expect(params.balance).toBe(0.2)
    expect(params.shadowSaturation as number).toBeGreaterThan(0)
  })

  test("disabled or malformed values add nothing", () => {
    expect(
      vignetteParamsFromScene({ amount: 0, inner: 0, outer: 1, roundness: 0 })
    ).toBeNull()
    expect(vignetteParamsFromScene({ amount: "x" })).toBeNull()
    const untouched = { ...DEFAULT_SCENE_CONFIG }
    const result = migrateSceneFilmToLayers(untouched, [])
    expect(result.scene).toBe(untouched)
    expect(result.layers).toEqual([])
  })

  test("scene normalisation drops the legacy fields", () => {
    const normalized = normalizeSceneFilmFields(
      legacyScene as unknown as SceneConfig
    )
    expect("vignette" in normalized).toBe(false)
    expect("splitTone" in normalized).toBe(false)
    expect(normalized.letterbox).toEqual({ aspect: 2, color: "#000000" })
  })
})

describe("loading a project saved with scene vignette / split tone", () => {
  test("the effects come back as layers and re-save without the scene fields", async () => {
    const { getBlankProjectFile } = await import("@/lib/editor/blank-project")
    const {
      applyLabProjectFile,
      buildLabProjectFile,
      parseLabProjectFileValue,
    } = await import("@/lib/editor/project-file")
    const { useEditorStore } = await import("@/store/editor-store")
    const { useLayerStore } = await import("@/store/layer-store")
    const blank = getBlankProjectFile()
    const image = createLayer("image")
    const file = parseLabProjectFileValue({
      ...blank,
      layers: [image],
      sceneConfig: {
        ...blank.sceneConfig,
        vignette: { amount: 2, inner: 0.2, outer: 1, roundness: 0 },
      },
    })
    applyLabProjectFile(file, [])
    expect(useLayerStore.getState().layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "image",
    ])
    expect("vignette" in useEditorStore.getState().sceneConfig).toBe(false)
    const saved = buildLabProjectFile()
    expect("vignette" in (saved.sceneConfig as object)).toBe(false)
    expect(saved.layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "image",
    ])
  })
})

describe("effect passes agree with their schemas", () => {
  test("pass fallbacks match schema defaults (empty params render the default look)", async () => {
    const { readFileSync } = await import("node:fs")
    for (const effect of EDITORLAB_EFFECTS) {
      const source = readFileSync(
        `src/editorlab/effects/${effect.layerType}/pass.ts`,
        "utf8"
      )
      for (const param of effect.params) {
        if (param.type !== "number") continue
        const match = source.match(
          new RegExp(`readNumber\\(\\s*params\\.${param.key},\\s*([-\\d.]+)`)
        )
        if (match) {
          expect(`${effect.id}.${param.key}=${Number(match[1])}`).toBe(
            `${effect.id}.${param.key}=${param.defaultValue}`
          )
        }
      }
    }
  })
})
