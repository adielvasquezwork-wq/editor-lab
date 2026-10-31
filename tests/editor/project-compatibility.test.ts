import { describe, expect, test } from "bun:test"
import { getBlankProjectFile } from "@/lib/editor/blank-project"
import { getLayerDefinitions } from "@/lib/editor/config/layer-registry"
import { dropLayer, moveLayerToGroup } from "@/lib/editor/layer-groups"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  buildPublishableProjectFile,
  buildViewerProjectState,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildRendererFrame } from "@/renderer/contracts"
import {
  isLayerGroup,
  validateLayerHierarchy,
} from "@/renderer/layer-hierarchy"
import { useLayerStore } from "@/store/layer-store"

// Project compatibility checks kept from the former community test suite.

function unavailableProject(version = 7) {
  const known = createLayer("gradient")
  const original = {
    ...createLayer("blur"),
    type: "retired-effect",
    name: "Old effect",
    assetId: "original-media",
    params: { amount: 0.72 },
    futureField: { preserve: [1, 2, 3] },
  }
  const raw = {
    ...getBlankProjectFile(),
    version,
    layers: [original, known],
    selectedLayerId: original.id,
    assets: [
      {
        id: "original-media",
        kind: "image",
        fileName: "original.png",
        url: "/scenes/default/original.png",
      },
    ],
    timeline: {
      duration: 10,
      loop: true,
      tracks: [
        {
          id: "original-track",
          layerId: original.id,
          enabled: true,
          binding: { kind: "param", key: "amount" },
          keyframes: [{ id: "key", time: 0, value: 0.5 }],
        },
      ],
    },
  }
  return { original, known, raw, parsed: parseLabProjectFileValue(raw) }
}

describe("project compatibility", () => {
  test("all registered V3 and legacy layer types parse and hydrate", () => {
    for (const definition of getLayerDefinitions()) {
      const file = {
        ...getBlankProjectFile(),
        layers: [createLayer(definition.type)],
      }
      const project = buildViewerProjectState(parseLabProjectFileValue(file))
      expect(project.layers[0]?.type).toBe(definition.type)
    }
  })

  test.each([
    6, 7,
  ])("unknown types in v%i preserve data, assets, and tracks across import/export", (version) => {
    const { parsed, original } = unavailableProject(version)
    expect(parsed.layers[0]?.unavailableLayer).toEqual(original)
    expect(parsed.layers[0]?.visible).toBe(false)
    expect(parsed.layers[0]?.runtimeError).toContain("unavailable")
    applyLabProjectFile(parsed, [])
    const saved = buildLabProjectFile()
    expect(saved.layers[0]?.unavailableLayer).toEqual(original)
    expect(saved.timeline.tracks).toHaveLength(1)
    expect(saved.timeline.tracks[0]).toMatchObject(parsed.timeline.tracks[0]!)
    expect(saved.assets[0]?.id).toBe("original-media")
    expect(saved.layers[0]?.assetId).toBe("original-media")
    const reloaded = parseLabProjectFileValue(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.layers[0]?.unavailableLayer).toEqual(original)
    expect(reloaded.layers[0]?.name).toBe(parsed.layers[0]?.name)
  })

  test("unknown layers are never rendered, even if their visibility is toggled", () => {
    const { parsed, known } = unavailableProject()
    const project = buildViewerProjectState(parsed)
    const frame = buildRendererFrame({
      ...project,
      audio: null,
      layers: project.layers.map((layer) => ({ ...layer, visible: true })),
      delta: 0,
      outputSize: project.composition,
      pixelRatio: 1,
      viewportSize: project.composition,
    })
    expect(frame.layers).toHaveLength(1)
    expect(frame.layers[0]).toHaveProperty("layer.id", known.id)
  })

  test("an unavailable leaf does not consume another group nesting level", () => {
    const { raw, original } = unavailableProject()
    const groups = Array.from({ length: 8 }, (_, index) => ({
      ...createLayer("group"),
      id: `group-${index}`,
      parentId: index > 0 ? `group-${index - 1}` : null,
    }))
    const parsed = parseLabProjectFileValue({
      ...raw,
      layers: [...groups, { ...original, parentId: "group-7" }],
    })
    expect(parsed.layers.at(-1)?.unavailableLayer).toBeDefined()
    applyLabProjectFile(parsed, [])
    expect(buildLabProjectFile().layers).toHaveLength(9)
  })

  test.each([
    false,
    true,
  ])("adding beside a selected unavailable leaf succeeds (nested=%s)", (nested) => {
    const { raw, original } = unavailableProject()
    const group = createLayer("group")
    const file = parseLabProjectFileValue({
      ...raw,
      layers: nested
        ? [group, { ...original, parentId: group.id }]
        : raw.layers,
    })
    applyLabProjectFile(file, [])
    const addedId = useLayerStore.getState().addLayer("gradient")
    const layers = useLayerStore.getState().layers
    const added = layers.find((layer) => layer.id === addedId)!
    expect(added.parentId ?? null).toBe(nested ? group.id : null)
    expect(added.parentId).not.toBe(original.id)
    expect(
      layers.find((layer) => layer.id === original.id)?.unavailableLayer
    ).toBeDefined()
    expect(() => validateLayerHierarchy(layers)).not.toThrow()
  })

  test("unavailable leaves cannot become group targets even after unlocking", () => {
    const { parsed, known, original } = unavailableProject()
    const layers = parsed.layers.map((layer) => ({ ...layer, locked: false }))
    expect(isLayerGroup(layers[0]!)).toBe(false)
    expect(moveLayerToGroup(layers, known.id, original.id)).toBeNull()
    expect(
      dropLayer(layers, known.id, { id: original.id, placement: "inside" })
    ).toBeNull()
    useLayerStore.getState().replaceState(layers, original.id, null)
    useLayerStore.getState().ungroupLayer(original.id)
    expect(useLayerStore.getState().layers).toEqual(layers)
  })

  test("normal groups still accept newly added children", () => {
    const group = createLayer("group")
    useLayerStore.getState().replaceState([group], group.id, null)
    const addedId = useLayerStore.getState().addLayer("gradient")
    expect(
      useLayerStore.getState().layers.find((layer) => layer.id === addedId)
        ?.parentId
    ).toBe(group.id)
  })

  test("saves preserve unavailable layers; publishable files prune them", () => {
    const { parsed } = unavailableProject()
    applyLabProjectFile(parsed, [])
    const saved = buildLabProjectFile().layers.find(
      (layer) => layer.unavailableLayer
    )
    expect(saved?.unavailableLayer?.type).toBe("retired-effect")
    expect(buildPublishableProjectFile(parsed).layers).toHaveLength(2)
  })

  test("malformed known layers and invalid hierarchies still fail validation", () => {
    const { raw, known } = unavailableProject()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, opacity: "broken" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, kind: "effect" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, parentId: "missing" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, unavailableLayer: { type: "bad" } }],
      })
    ).toThrow()
    expect(() => parseLabProjectFileValue({ ...raw, version: 999 })).toThrow(
      "version"
    )
  })

  test("a saved placeholder restores when its original type is supported", () => {
    const original = createLayer("blur")
    const file = {
      ...getBlankProjectFile(),
      layers: [
        {
          ...createLayer("group"),
          id: original.id,
          unavailableLayer: original,
        },
      ],
    }
    expect(parseLabProjectFileValue(file).layers[0]?.type).toBe("blur")
    expect(parseLabProjectFileValue(file).layers[0]?.params).toEqual(
      original.params
    )
  })
})
