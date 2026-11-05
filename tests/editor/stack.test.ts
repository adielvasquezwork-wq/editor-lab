import { beforeEach, describe, expect, test } from "bun:test"
import {
  applyEffectStack,
  currentEffectStack,
} from "@/editorlab/stack/apply-stack"
import {
  deleteSnippet,
  importSnippets,
  readSnippets,
  saveSnippet,
  snippetParamUpdates,
  snippetsForEffect,
  type SnippetStorage,
} from "@/editorlab/stack/snippets"
import {
  buildEffectStack,
  parseEffectStack,
  stackToLayers,
  stringifyEffectStack,
} from "@/editorlab/stack/stack-json"
import { HOUSE_EASING, LINEAR_EASING, STEP_EASING } from "@/lib/easing-curve"
import { createLayer } from "@/lib/editor/layers"
import { useLayerStore } from "@/store/layer-store"
import { createParamBinding, useTimelineStore } from "@/store/timeline-store"
import type { EditorLayer } from "@/types/editor"

const sampleStack = () =>
  parseEffectStack({
    format: "editorlab-stack",
    fps: 25,
    layers: [
      {
        id: "vignette",
        keys: {
          amount: [
            { t: 0, v: 0 },
            { easing: "linear", t: 1, v: 2.5 },
            { easing: "step", t: 2, v: 0 },
          ],
        },
        name: "Edge",
        params: { amount: 2.5, squareness: 1 },
        timeStep: { fps: 25, n: 3, offset: 0 },
      },
      { id: "grain", opacity: 0.5, params: { amount: 0.2 } },
      {
        freeze: { from: 1, length: 0.5 },
        id: "exposure",
        params: { stops: -1 },
      },
    ],
    version: 1,
  })

describe("effect stack JSON", () => {
  test("stack → layers + tracks → stack round-trips", () => {
    const stack = sampleStack()
    const { layers, tracks } = stackToLayers(stack)
    expect(layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "grain",
      "exposure",
    ])
    expect(layers[0]!.name).toBe("Edge")
    expect(layers[0]!.params.amount).toBe(2.5)
    expect(layers[0]!.params.squareness).toBe(1)
    expect(layers[0]!.timeStep).toEqual({ fps: 25, n: 3, offset: 0 })
    expect(layers[1]!.opacity).toBe(0.5)
    expect(layers[2]!.freeze).toEqual({ from: 1, length: 0.5 })
    expect(tracks).toHaveLength(1)
    expect(tracks[0]!.keyframes.map((k) => k.time)).toEqual([0, 1, 2])
    expect(tracks[0]!.keyframes[0]!.easing).toEqual(HOUSE_EASING)
    expect(tracks[0]!.keyframes[1]!.easing).toEqual(LINEAR_EASING)
    expect(tracks[0]!.keyframes[2]!.easing).toEqual(STEP_EASING)
    const again = buildEffectStack(layers, tracks, 25)
    expect(JSON.parse(stringifyEffectStack(again))).toEqual(
      JSON.parse(stringifyEffectStack(stack))
    )
  })

  test("unknown effects, params and keys are rejected or dropped", () => {
    expect(() =>
      parseEffectStack({
        format: "editorlab-stack",
        layers: [{ id: "nope" }],
        version: 1,
      })
    ).toThrow(/unknown effect/)
    expect(() => parseEffectStack({ format: "other", layers: [] })).toThrow(
      /Not an Editor Lab stack/
    )
    const { layers, tracks } = stackToLayers(
      parseEffectStack({
        format: "editorlab-stack",
        layers: [
          {
            id: "vignette",
            keys: { bogus: [{ t: 0, v: 1 }] },
            params: { bogus: 1, amount: 1 },
          },
        ],
        version: 1,
      })
    )
    expect("bogus" in layers[0]!.params).toBe(false)
    expect(layers[0]!.params.amount).toBe(1)
    expect(tracks).toHaveLength(0)
  })

  test("only top-level effect layers are exported, with non-default params", () => {
    const group = createLayer("group")
    const nested = { ...createLayer("grain"), parentId: group.id }
    const plate = createLayer("image")
    const vignette = {
      ...createLayer("vignette"),
      params: { ...createLayer("vignette").params, amount: 3 },
    }
    const stack = buildEffectStack([vignette, group, nested, plate], [], 24)
    expect(stack.layers).toHaveLength(1)
    expect(stack.layers[0]).toEqual({ id: "vignette", params: { amount: 3 } })
  })
})

describe("applying a stack to the project", () => {
  beforeEach(() => {
    useLayerStore.getState().replaceState([], null)
    useTimelineStore.getState().replaceState({
      currentTime: 0,
      duration: 10,
      isPlaying: false,
      loop: true,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: [],
    })
  })

  test("replace keeps sources and groups, swaps top-level effects, carries keyframes and fps", () => {
    const plate = createLayer("image")
    const old = createLayer("bloom")
    const group = createLayer("group")
    const inGroup = { ...createLayer("grain"), parentId: group.id }
    useLayerStore.getState().replaceState([old, group, inGroup, plate], null)
    const oldTrack = useTimelineStore.getState()
    oldTrack.upsertKeyframe({
      binding: createParamBinding(old, "bloomIntensity")!,
      layerId: old.id,
      time: 0,
      value: 1,
    })
    expect(useTimelineStore.getState().tracks).toHaveLength(1)

    applyEffectStack(sampleStack(), "replace")
    const layers = useLayerStore.getState().layers
    expect(layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "grain",
      "exposure",
      "group",
      "grain",
      "image",
    ])
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0]!.layerId).toBe(layers[0]!.id)
    expect(useTimelineStore.getState().frameRate).toBe(25)
    expect(currentEffectStack().layers.map((layer) => layer.id)).toEqual([
      "vignette",
      "grain",
      "exposure",
    ])
  })

  test("add puts the stack on top and keeps existing effects", () => {
    useLayerStore.getState().replaceState([createLayer("bloom")], null)
    applyEffectStack(sampleStack(), "add")
    expect(useLayerStore.getState().layers.map((layer) => layer.type)).toEqual([
      "vignette",
      "grain",
      "exposure",
      "bloom",
    ])
  })
})

describe("snippets", () => {
  const memory = new Map<string, string>()
  const storage: SnippetStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
  }

  beforeEach(() => memory.clear())

  test("save, list per effect, apply only known params, delete, import", () => {
    const vignette: EditorLayer = {
      ...createLayer("vignette"),
      params: { ...createLayer("vignette").params, amount: 3.3 },
    }
    const saved = saveSnippet("Heavy corners", vignette, storage)
    saveSnippet("Grain A", createLayer("grain"), storage)
    expect(readSnippets(storage)).toHaveLength(2)
    expect(snippetsForEffect("vignette", storage).map((s) => s.name)).toEqual([
      "Heavy corners",
    ])
    const updates = snippetParamUpdates(
      { ...saved, params: { ...saved.params, bogus: 1 } },
      "vignette"
    )
    expect(updates.find(([key]) => key === "amount")?.[1]).toBe(3.3)
    expect(updates.some(([key]) => key === "bogus")).toBe(false)
    deleteSnippet(saved.id, storage)
    expect(snippetsForEffect("vignette", storage)).toHaveLength(0)
    expect(
      importSnippets(JSON.stringify([saved, { junk: true }]), storage)
    ).toBe(1)
    expect(importSnippets(JSON.stringify(saved), storage)).toBe(0)
    expect(readSnippets(storage)).toHaveLength(2)
  })

  test("a broken store reads as empty", () => {
    memory.set("editorlab.snippets.v1", "{not json")
    expect(readSnippets(storage)).toEqual([])
  })
})
