import { beforeEach, describe, expect, test } from "bun:test"
import { keyLeakAtPlayhead, keyWhipAtPlayhead } from "@/editorlab/motion/keying"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { createLayer } from "@/lib/editor/layers"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

function reset(fps: number) {
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
  useTimelineStore.getState().setFrameRate(fps)
}

const valueAt = (layerId: string, key: string, frame: number, fps: number) => {
  const state = useLayerStore.getState()
  const evaluated = evaluateTimelineForLayers(
    state.layers,
    useTimelineStore.getState().tracks,
    frame / fps
  )
  return evaluated.find((entry) => entry.layerId === layerId)?.params[key]
}

describe("whip keying", () => {
  beforeEach(() => reset(24))

  test("writes 0 → peak → 0 with the peak one frame before the playhead", () => {
    const blur = createLayer("directional-blur")
    useLayerStore.getState().replaceState([blur], blur.id)
    useTimelineStore.getState().setCurrentTime(24 / 24) // cut on frame 24
    expect(keyWhipAtPlayhead(blur.id, { peak: 40, rampFrames: 6 })).toBe(3)
    const track = useTimelineStore.getState().tracks[0]!
    expect(
      track.keyframes.map((k) => [Math.round(k.time * 24), k.value])
    ).toEqual([
      [17, 0],
      [23, 40],
      [29, 0],
    ])
    expect(track.keyframes.every((k) => k.easing.type === "bezier")).toBe(true)
    expect(valueAt(blur.id, "strength", 23, 24)).toBe(40)
    expect(valueAt(blur.id, "strength", 29, 24)).toBe(0)
    expect(valueAt(blur.id, "strength", 24, 24) as number).toBeGreaterThan(0)
    expect(valueAt(blur.id, "strength", 17, 24)).toBe(0)
  })

  test("clamps near the start and respects the project frame rate", () => {
    const blur = createLayer("directional-blur")
    useLayerStore.getState().replaceState([blur], blur.id)
    useTimelineStore.getState().setFrameRate(25)
    useTimelineStore.getState().setCurrentTime(2 / 25)
    keyWhipAtPlayhead(blur.id, { peak: 96, rampFrames: 4 })
    const frames = useTimelineStore
      .getState()
      .tracks[0]!.keyframes.map((k) => Math.round(k.time * 25))
    expect(frames).toEqual([0, 1, 5])
  })

  test("re-keying at the same playhead updates in place", () => {
    const blur = createLayer("directional-blur")
    useLayerStore.getState().replaceState([blur], blur.id)
    useTimelineStore.getState().setCurrentTime(1)
    keyWhipAtPlayhead(blur.id, { peak: 40 })
    keyWhipAtPlayhead(blur.id, { peak: 60 })
    const track = useTimelineStore.getState().tracks[0]!
    expect(track.keyframes).toHaveLength(3)
    expect(track.keyframes[1]!.value).toBe(60)
  })
})

describe("leak keying", () => {
  beforeEach(() => reset(24))

  test("progress runs 0 → 1 linearly over the frames centred on the playhead", () => {
    const leak = createLayer("light-leak")
    useLayerStore.getState().replaceState([leak], leak.id)
    useTimelineStore.getState().setCurrentTime(48 / 24)
    expect(keyLeakAtPlayhead(leak.id, { frames: 16 })).toBe(2)
    const track = useTimelineStore.getState().tracks[0]!
    expect(
      track.keyframes.map((k) => [Math.round(k.time * 24), k.value])
    ).toEqual([
      [40, 0],
      [56, 1],
    ])
    expect(valueAt(leak.id, "progress", 48, 24) as number).toBeCloseTo(0.5, 2)
  })

  test("other layer types are ignored", () => {
    const grain = createLayer("grain")
    useLayerStore.getState().replaceState([grain], grain.id)
    expect(keyLeakAtPlayhead(grain.id)).toBe(0)
    expect(useTimelineStore.getState().tracks).toHaveLength(0)
  })
})

describe("whip keying on Velocity Blur", () => {
  test("keys Speed and switches the layer to manual", () => {
    useLayerStore.getState().replaceState([], null)
    useTimelineStore.getState().setFrameRate(24)
    const blur = createLayer("velocity-blur")
    useLayerStore.getState().replaceState([blur], blur.id)
    useTimelineStore.getState().setCurrentTime(1)
    expect(keyWhipAtPlayhead(blur.id, { peak: 120, rampFrames: 4 })).toBe(3)
    expect(useLayerStore.getState().getLayerById(blur.id)?.params.source).toBe(
      "manual"
    )
    const track = useTimelineStore.getState().tracks[0]!
    expect(track.binding.kind === "param" && track.binding.key).toBe("speed")
    expect(track.keyframes.map((k) => k.value)).toEqual([0, 120, 0])
  })
})
