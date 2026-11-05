import { beforeEach, describe, expect, test } from "bun:test"
import {
  formatTimecode,
  frameToTime,
  normalizeFrameRate,
  stepFrameTime,
  timeToFrame,
} from "@/editorlab/timing/frame-rate"
import { getBlankProjectFile } from "@/lib/editor/blank-project"
import { cloneLayer, createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  normalizeLayerTiming,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { EditorLayer } from "@/types/editor"

describe("frame rate helpers", () => {
  test("frames and times round-trip exactly at 24, 25 and 30 fps", () => {
    for (const fps of [24, 25, 30]) {
      for (let frame = 0; frame < 3 * fps; frame += 1) {
        expect(timeToFrame(frameToTime(frame, fps), fps)).toBe(frame)
      }
    }
  })

  test("stepping moves by whole frames from the frame under the playhead", () => {
    expect(timeToFrame(stepFrameTime(0, 24, 1), 24)).toBe(1)
    expect(timeToFrame(stepFrameTime(0.52, 24, 1), 24)).toBe(13)
    expect(timeToFrame(stepFrameTime(0.52, 24, -1), 24)).toBe(11)
    expect(stepFrameTime(0, 24, -5)).toBe(0)
    expect(timeToFrame(stepFrameTime(1, 25, 10), 25)).toBe(35)
  })

  test("timecode", () => {
    expect(formatTimecode(0, 24)).toBe("0:00:00")
    expect(formatTimecode(37 / 24, 24)).toBe("0:01:13")
    expect(formatTimecode(61.5, 25)).toBe("1:01:12")
    expect(formatTimecode(3600 + 2, 30)).toBe("1:00:02:00")
  })

  test("normalizeFrameRate falls back to 24", () => {
    expect(normalizeFrameRate(25)).toBe(25)
    expect(normalizeFrameRate(undefined)).toBe(24)
    expect(normalizeFrameRate(-3)).toBe(24)
    expect(normalizeFrameRate(Number.NaN)).toBe(24)
  })
})

describe("timeline store frame stepping", () => {
  beforeEach(() => {
    useTimelineStore.getState().setFrameRate(24)
    useTimelineStore.getState().setDuration(10)
    useTimelineStore.getState().setCurrentTime(0)
    useTimelineStore.getState().setPlaying(true)
  })

  test("stepFrames pauses and lands on frame boundaries, clamped to the timeline", () => {
    const store = useTimelineStore.getState()
    store.stepFrames(3)
    expect(useTimelineStore.getState().isPlaying).toBe(false)
    expect(timeToFrame(useTimelineStore.getState().currentTime, 24)).toBe(3)
    useTimelineStore.getState().stepFrames(-10)
    expect(useTimelineStore.getState().currentTime).toBe(0)
    useTimelineStore.getState().setCurrentTime(9.99)
    useTimelineStore.getState().stepFrames(5)
    expect(useTimelineStore.getState().currentTime).toBe(10)
  })

  test("the frame rate is saved in the project file and restored on load", () => {
    useTimelineStore.getState().setFrameRate(25)
    useLayerStore.getState().replaceState([createLayer("image")], null)
    const saved = buildLabProjectFile()
    expect(saved.timeline.frameRate).toBe(25)
    useTimelineStore.getState().setFrameRate(30)
    applyLabProjectFile(
      parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
      []
    )
    expect(useTimelineStore.getState().frameRate).toBe(25)
    // Older files without the field load at 24.
    const legacy = { ...getBlankProjectFile(), layers: [createLayer("image")] }
    delete (legacy.timeline as { frameRate?: number }).frameRate
    applyLabProjectFile(parseLabProjectFileValue(legacy), [])
    expect(useTimelineStore.getState().frameRate).toBe(24)
  })
})

describe("freeze frame persistence", () => {
  test("project files keep valid freezes and drop malformed ones", () => {
    const layer = { ...createLayer("group"), freeze: { from: 2, length: 0.5 } }
    expect(normalizeLayerTiming(layer).freeze).toEqual({ from: 2, length: 0.5 })
    const broken = { ...layer, freeze: { from: 2, length: -1 } } as EditorLayer
    expect("freeze" in normalizeLayerTiming(broken)).toBe(false)
  })

  test("duplicating a layer copies its freeze", () => {
    const layer = { ...createLayer("text"), freeze: { from: 1, length: 1 } }
    const copy = cloneLayer(layer)
    expect(copy.freeze).toEqual(layer.freeze)
    expect(copy.freeze).not.toBe(layer.freeze)
  })
})
