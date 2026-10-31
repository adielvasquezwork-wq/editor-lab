import { describe, expect, test } from "bun:test"
import { getBlankSceneConfig } from "@/lib/editor/blank-project"
import { createLayer } from "@/lib/editor/layers"
import { buildRendererFrame } from "@/renderer/contracts"
import type { EditorLayer } from "@/types/editor"

function frameAt(layers: EditorLayer[], time: number) {
  const size = { height: 720, width: 1280 }
  return buildRendererFrame({
    assets: [],
    clockTime: time,
    delta: 0,
    layers,
    outputSize: size,
    pixelRatio: 1,
    sceneConfig: getBlankSceneConfig(),
    timeline: {
      currentTime: time,
      duration: 30,
      isPlaying: false,
      loop: false,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: [],
    },
    viewportSize: size,
  })
}

type Leaf = { layer: EditorLayer; params: Record<string, unknown> }

function only(frame: ReturnType<typeof frameAt>): Leaf {
  const node = frame.layers[0] as Leaf | undefined
  // Dropped from the tree means not rendered.
  return node ?? ({ layer: { visible: false }, params: {} } as unknown as Leaf)
}

describe("buildRendererFrame clips", () => {
  test("layers without clip/subtitles are unchanged", () => {
    const layer = { ...createLayer("text"), opacity: 0.8 }
    const node = only(frameAt([layer], 12))
    expect(node.layer.visible).toBe(true)
    expect(node.layer.opacity).toBe(0.8)
    expect(node.params.text).toBe(layer.params.text)
  })

  test("clip gates visibility and applies fades", () => {
    const layer: EditorLayer = {
      ...createLayer("text"),
      clip: { end: 6, fadeIn: 1, fadeOut: 0, sourceIn: 0, start: 2 },
      opacity: 0.8,
    }
    expect(only(frameAt([layer], 1)).layer.visible).toBe(false)
    expect(only(frameAt([layer], 6)).layer.visible).toBe(false)
    const fading = only(frameAt([layer], 2.5)).layer
    expect(fading.visible).toBe(true)
    expect(fading.opacity).toBeCloseTo(0.4)
    expect(only(frameAt([layer], 4)).layer.opacity).toBeCloseTo(0.8)
  })

  test("clip-inactive layers stay in the tree (disabled) so media survives", () => {
    const layer: EditorLayer = {
      ...createLayer("text"),
      clip: { end: 6, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 2 },
    }
    const frame = frameAt([layer], 8)
    expect(frame.layers).toHaveLength(1)
    expect(only(frame).layer.visible).toBe(false)
  })

  test("user-hidden clip layers are dropped as before", () => {
    const layer: EditorLayer = {
      ...createLayer("text"),
      clip: { end: 6, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 2 },
      visible: false,
    }
    expect(frameAt([layer], 8).layers).toHaveLength(0)
  })

  test("user-hidden layers stay hidden inside their clip", () => {
    const layer: EditorLayer = {
      ...createLayer("text"),
      clip: { end: 6, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 2 },
      visible: false,
    }
    expect(only(frameAt([layer], 3)).layer.visible).toBe(false)
  })

  test("subtitles drive the text and hide the layer between cues", () => {
    const layer: EditorLayer = {
      ...createLayer("text"),
      subtitles: [
        { end: 3, start: 1, text: "First" },
        { end: 6, start: 4, text: "Second" },
      ],
    }
    expect(only(frameAt([layer], 2)).params.text).toBe("First")
    expect(only(frameAt([layer], 2)).layer.visible).toBe(true)
    expect(only(frameAt([layer], 3.5)).layer.visible).toBe(false)
    expect(only(frameAt([layer], 5)).params.text).toBe("Second")
    // Static text is not mutated.
    expect(layer.params.text).not.toBe("Second")
  })
})

describe("project file timing fields", () => {
  test("clip and subtitles survive save/parse/hydrate; junk is dropped", async () => {
    const {
      parseLabProjectFileValue,
      buildViewerProjectState,
      normalizeLayerTiming,
    } = await import("@/lib/editor/project-file")
    const { getBlankProjectFile } = await import("@/lib/editor/blank-project")
    const file = getBlankProjectFile()
    const good = {
      ...createLayer("text"),
      clip: { end: 5, fadeIn: 0.5, fadeOut: 0, sourceIn: 1, start: 1 },
      subtitles: [{ end: 2, start: 1, text: "Hi" }],
    }
    const junk = {
      ...createLayer("text"),
      clip: { start: "x" },
      subtitles: "nope",
    }
    const legacy = createLayer("text")
    file.layers = [good, junk, legacy] as never
    const parsed = parseLabProjectFileValue(JSON.parse(JSON.stringify(file)))
    const [a, b, c] = buildViewerProjectState(parsed).layers
    expect(a?.clip).toEqual(good.clip)
    expect(a?.subtitles).toEqual(good.subtitles)
    expect(b && "clip" in b).toBe(false)
    expect(b && "subtitles" in b).toBe(false)
    expect(c && ("clip" in c || "subtitles" in c)).toBe(false)
    expect(normalizeLayerTiming(legacy)).toBe(legacy)
  })
})
