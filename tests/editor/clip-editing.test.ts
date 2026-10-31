import { beforeEach, describe, expect, test } from "bun:test"
import {
  addClipToLayer,
  moveLayerClip,
  rippleDeleteLayers,
  splitLayersAt,
  trimLayerClipStart,
} from "@/lib/editor/clip-editing"
import { createLayer } from "@/lib/editor/layers"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { EditorLayer } from "@/types/editor"

function seed(layers: EditorLayer[], duration = 10) {
  useLayerStore.getState().replaceState(layers, layers[0]?.id ?? null)
  useTimelineStore.getState().setDuration(duration)
  useTimelineStore.getState().setCurrentTime(0)
}

const get = (id: string) => useLayerStore.getState().getLayerById(id)

describe("clip editing", () => {
  beforeEach(() => seed([]))

  test("split cuts a clip into two seamless halves with the same name", () => {
    const layer = {
      ...createLayer("text"),
      clip: { end: 8, fadeIn: 0, fadeOut: 0, sourceIn: 2, start: 2 },
    }
    seed([layer])
    const [right] = splitLayersAt([layer.id], 5)
    expect(right).toBeDefined()
    expect(get(layer.id)?.clip).toMatchObject({ end: 5, start: 2, sourceIn: 2 })
    expect(get(right!)?.clip).toMatchObject({ end: 8, start: 5, sourceIn: 5 })
    expect(get(right!)?.name).toBe(layer.name)
    expect(useLayerStore.getState().layers).toHaveLength(2)
  })

  test("split converts a legacy (clip-less) layer to timeline-spanning clips", () => {
    const layer = createLayer("text")
    seed([layer], 10)
    const [right] = splitLayersAt([layer.id], 4)
    expect(get(layer.id)?.clip).toMatchObject({ end: 4, start: 0 })
    expect(get(right!)?.clip).toMatchObject({ end: 10, start: 4, sourceIn: 4 })
  })

  test("split skips layers not under the playhead and locked layers", () => {
    const a = {
      ...createLayer("text"),
      clip: { end: 3, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 1 },
    }
    const b = { ...createLayer("text"), locked: true }
    seed([a, b])
    expect(splitLayersAt([a.id, b.id], 5)).toEqual([])
    expect(useLayerStore.getState().layers).toHaveLength(2)
  })

  test("ripple delete closes the gap", () => {
    const clip = (start: number, end: number) => ({
      end,
      fadeIn: 0,
      fadeOut: 0,
      sourceIn: 0,
      start,
    })
    const a = { ...createLayer("text"), clip: clip(0, 2) }
    const b = { ...createLayer("text"), clip: clip(2, 5) }
    const c = { ...createLayer("text"), clip: clip(5, 7) }
    const legacy = createLayer("text")
    seed([a, b, c, legacy])
    rippleDeleteLayers([b.id])
    expect(get(b.id)).toBeNull()
    expect(get(a.id)?.clip).toMatchObject({ end: 2, start: 0 })
    expect(get(c.id)?.clip).toMatchObject({ end: 4, start: 2 })
    expect(get(legacy.id)?.clip).toBeUndefined()
  })

  test("adding/moving clips grows the timeline to fit", () => {
    const layer = createLayer("text")
    seed([layer], 10)
    addClipToLayer(layer.id)
    expect(get(layer.id)?.clip).toMatchObject({ end: 10, start: 0 })
    moveLayerClip(layer.id, 6)
    expect(useTimelineStore.getState().duration).toBe(16)
  })

  test("trim start keeps footage anchored", () => {
    const layer = {
      ...createLayer("text"),
      clip: { end: 8, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 2 },
    }
    seed([layer])
    trimLayerClipStart(layer.id, 3)
    expect(get(layer.id)?.clip).toMatchObject({ sourceIn: 1, start: 3 })
  })
})

describe("title helpers", () => {
  beforeEach(() => seed([]))

  test("lower third is a timed, faded text layer at the playhead", async () => {
    const { addLowerThird } = await import("@/lib/editor/clip-editing")
    useTimelineStore.getState().setCurrentTime(3)
    const id = addLowerThird("Ana Ruiz\nFisherwoman")
    const layer = get(id)!
    expect(layer.type).toBe("text")
    expect(layer.params.text).toBe("Ana Ruiz\nFisherwoman")
    expect(layer.params.anchor).toBe("bottom-left")
    expect(layer.params.align).toBe("left")
    expect(layer.clip).toMatchObject({
      end: 7,
      fadeIn: 0.3,
      fadeOut: 0.3,
      start: 3,
    })
  })

  test("caption layer carries cues and grows the timeline", async () => {
    const { addCaptionLayer } = await import("@/lib/editor/clip-editing")
    const id = addCaptionLayer([{ end: 14, start: 12, text: "Hola" }])
    expect(get(id)?.subtitles).toEqual([{ end: 14, start: 12, text: "Hola" }])
    expect(useTimelineStore.getState().duration).toBe(14)
  })
})
