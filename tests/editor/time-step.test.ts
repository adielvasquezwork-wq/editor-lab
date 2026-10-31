import { describe, expect, test } from "bun:test"
import {
  applyTimeSteps,
  collectLayerTimeSteps,
  normalizeTimeStep,
  stepTime,
} from "@/editorlab/timing/time-step"
import { LINEAR_EASING } from "@/lib/easing-curve"
import { normalizeLayerTiming } from "@/lib/editor/project-file"
import { cloneLayer, createLayer } from "@/lib/editor/layers"
import { buildRendererFrame } from "@/renderer/contracts"
import type { CompositionNode } from "@/renderer/composition-tree"
import type { RenderableLayerPass } from "@/renderer/contracts"
import {
  DEFAULT_SCENE_CONFIG,
  type EditorLayer,
  type TimelineTrack,
} from "@/types/editor"

const frameOf = (time: number, fps: number) => Math.round(time * fps)

describe("stepTime", () => {
  for (const fps of [24, 25, 30]) {
    for (const n of [2, 3, 4, 8]) {
      test(`on ${n}s at ${fps} fps repeats every frame exactly ${n} times`, () => {
        const shown = Array.from({ length: 10 * fps }, (_, i) =>
          frameOf(stepTime(i / fps, { fps, n, offset: 0 }), fps)
        )
        for (let i = 0; i < shown.length; i += 1) {
          expect(shown[i]).toBe(Math.floor(i / n) * n)
        }
      })
    }
  }

  test("offset shifts the cadence and never goes negative", () => {
    const step = { fps: 25, n: 3, offset: 1 }
    const shown = Array.from({ length: 8 }, (_, i) =>
      frameOf(stepTime(i / 25, step), 25)
    )
    expect(shown).toEqual([0, 1, 1, 1, 4, 4, 4, 7])
  })

  test("is deterministic regardless of evaluation order", () => {
    const step = { fps: 24, n: 4, offset: 0 }
    const order = [0, 37, 12, 37].map((frame) => stepTime(frame / 24, step))
    expect(order[1]).toBe(order[3]!)
    expect(frameOf(order[1]!, 24)).toBe(36)
    expect(frameOf(order[2]!, 24)).toBe(12)
  })

  test("continuous preview time steps too", () => {
    const step = { fps: 24, n: 2, offset: 0 }
    expect(stepTime(0.07, step)).toBe(0)
    expect(stepTime(0.09, step)).toBeCloseTo(2 / 24)
    expect(stepTime(0.16, step)).toBeCloseTo(2 / 24)
  })

  test("nested steps apply outermost first", () => {
    const chain = [
      { fps: 25, n: 2, offset: 0 },
      { fps: 25, n: 8, offset: 0 },
    ]
    expect(frameOf(applyTimeSteps(13 / 25, chain), 25)).toBe(8)
    expect(applyTimeSteps(0.5, undefined)).toBe(0.5)
  })
})

describe("normalizeTimeStep", () => {
  test("accepts valid steps and rejects junk", () => {
    expect(normalizeTimeStep({ fps: 25, n: 3, offset: 1 })).toEqual({
      fps: 25,
      n: 3,
      offset: 1,
    })
    expect(normalizeTimeStep({ fps: 24, n: 3.4 })).toEqual({
      fps: 24,
      n: 3,
      offset: 0,
    })
    expect(normalizeTimeStep({ fps: 24, n: 1 })).toBeNull()
    expect(normalizeTimeStep({ fps: "24", n: 2 })).toBeNull()
    expect(normalizeTimeStep(null)).toBeNull()
  })
})

function group(name: string): EditorLayer {
  return { ...createLayer("group"), name }
}

function child(type: EditorLayer["type"], parentId: string | null) {
  return { ...createLayer(type), parentId }
}

describe("collectLayerTimeSteps", () => {
  test("children inherit the group's step; outside layers get none", () => {
    const outer = { ...group("outer"), timeStep: { fps: 25, n: 2, offset: 0 } }
    const inner = {
      ...child("group", outer.id),
      timeStep: { fps: 25, n: 8, offset: 0 },
    }
    const leaf = child("text", inner.id)
    const plate = child("image", null)
    const steps = collectLayerTimeSteps([outer, inner, leaf, plate])
    expect(steps.get(leaf.id)?.map((step) => step.n)).toEqual([2, 8])
    expect(steps.get(outer.id)?.map((step) => step.n)).toEqual([2])
    expect(steps.has(plate.id)).toBe(false)
  })
})

function opacityTrack(layerId: string): TimelineTrack {
  return {
    binding: {
      kind: "layer",
      label: "Opacity",
      property: "opacity",
      valueType: "number",
    },
    enabled: true,
    id: `track-${layerId}`,
    keyframes: [
      { easing: LINEAR_EASING, id: `a-${layerId}`, time: 0, value: 0 },
      { easing: LINEAR_EASING, id: `b-${layerId}`, time: 1, value: 1 },
    ],
    layerId,
  }
}

function flatten(
  nodes: CompositionNode<RenderableLayerPass>[]
): RenderableLayerPass[] {
  return nodes.flatMap((node) =>
    "children" in node ? flatten(node.children) : [node]
  )
}

function frameAt(layers: EditorLayer[], tracks: TimelineTrack[], t: number) {
  return buildRendererFrame({
    assets: [],
    delta: 1 / 25,
    layers,
    outputSize: { height: 90, width: 160 },
    pixelRatio: 1,
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: {
      currentTime: t,
      duration: 4,
      isPlaying: false,
      loop: false,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks,
    },
    viewportSize: { height: 90, width: 160 },
  })
}

describe("stepped group in the renderer frame (B5)", () => {
  const graphics = {
    ...group("graphics"),
    timeStep: { fps: 25, n: 3, offset: 0 },
  }
  const title = child("text", graphics.id)
  const plate = child("image", null)
  const layers = [graphics, title, plate]
  const tracks = [opacityTrack(title.id), opacityTrack(plate.id)]

  test("the graphic holds each pose 3 frames; the plate moves every frame", () => {
    const titleOpacity: number[] = []
    const plateOpacity: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const entries = flatten(frameAt(layers, tracks, i / 25).layers)
      titleOpacity.push(
        entries.find((entry) => entry.layer.id === title.id)!.layer.opacity
      )
      plateOpacity.push(
        entries.find((entry) => entry.layer.id === plate.id)!.layer.opacity
      )
    }
    for (let i = 0; i < 12; i += 1) {
      expect(titleOpacity[i]).toBeCloseTo(Math.floor(i / 3) * (3 / 25))
      expect(plateOpacity[i]).toBeCloseTo(i / 25)
    }
  })

  test("stepped entries carry their chain for the pipeline", () => {
    const entries = flatten(frameAt(layers, tracks, 0.5).layers)
    expect(
      entries.find((entry) => entry.layer.id === title.id)?.timeSteps
    ).toEqual([{ fps: 25, n: 3, offset: 0 }])
    expect(
      entries.find((entry) => entry.layer.id === plate.id)?.timeSteps
    ).toBeUndefined()
  })

  test("clip gating uses the stepped time", () => {
    const clipped = {
      ...title,
      clip: { end: 4, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 4 / 25 },
    }
    const visibleAt = (frame: number) =>
      flatten(frameAt([graphics, clipped, plate], [], frame / 25).layers).find(
        (entry) => entry.layer.id === clipped.id
      )?.layer.visible
    // On 3s the clip (starting at frame 4) first shows at frame 6.
    expect(visibleAt(5)).toBe(false)
    expect(visibleAt(6)).toBe(true)
  })
})

describe("time step persistence", () => {
  test("project files keep valid steps and drop malformed ones", () => {
    const layer = {
      ...createLayer("group"),
      timeStep: { fps: 25, n: 4, offset: 0 },
    }
    expect(normalizeLayerTiming(layer).timeStep).toEqual({
      fps: 25,
      n: 4,
      offset: 0,
    })
    const broken = { ...layer, timeStep: { fps: 25, n: 0 } } as EditorLayer
    expect("timeStep" in normalizeLayerTiming(broken)).toBe(false)
  })

  test("duplicating a layer copies its step", () => {
    const layer = {
      ...createLayer("text"),
      timeStep: { fps: 24, n: 2, offset: 0 },
    }
    const copy = cloneLayer(layer)
    expect(copy.timeStep).toEqual(layer.timeStep)
    expect(copy.timeStep).not.toBe(layer.timeStep)
  })
})
