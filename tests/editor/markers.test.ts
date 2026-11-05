import { beforeEach, describe, expect, test } from "bun:test"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

const timeline = () => useTimelineStore.getState()

describe("timeline markers", () => {
  beforeEach(() => {
    timeline().replaceState({
      currentTime: 0,
      duration: 10,
      isPlaying: true,
      loop: true,
      selectedKeyframeId: null,
      selectedKeyframeIds: [],
      selectedTrackId: null,
      tracks: [],
    })
    timeline().setFrameRate(24)
    timeline().setMarkers([])
  })

  test("add keeps markers sorted, names them in order and merges same-frame adds", () => {
    timeline().addMarker(4)
    timeline().addMarker(1.5, "Cut A")
    const id = timeline().addMarker(4 + 1 / 100, "Beat")
    expect(timeline().markers.map((m) => [m.time, m.label])).toEqual([
      [1.5, "Cut A"],
      [4, "Beat"],
    ])
    expect(timeline().markers[1]!.id).toBe(id)
    timeline().addMarker(12)
    expect(timeline().markers[2]!.time).toBe(10)
  })

  test("jump moves the playhead to the next / previous marker and pauses", () => {
    timeline().addMarker(2)
    timeline().addMarker(6)
    timeline().setCurrentTime(3)
    expect(timeline().jumpToMarker(1)).toBe(true)
    expect(timeline().currentTime).toBe(6)
    expect(timeline().isPlaying).toBe(false)
    expect(timeline().jumpToMarker(1)).toBe(false)
    expect(timeline().jumpToMarker(-1)).toBe(true)
    expect(timeline().currentTime).toBe(2)
    expect(timeline().jumpToMarker(-1)).toBe(false)
  })

  test("update and remove", () => {
    const id = timeline().addMarker(5, "x")
    timeline().updateMarker(id, { label: "Interview", time: 7 })
    expect(timeline().markers[0]).toMatchObject({ label: "Interview", time: 7 })
    timeline().removeMarker(id)
    expect(timeline().markers).toHaveLength(0)
  })

  test("markers are saved in the project file and restored on load", () => {
    useLayerStore.getState().replaceState([createLayer("image")], null)
    timeline().addMarker(2.5, "Cut 1")
    const saved = buildLabProjectFile()
    expect(saved.timeline.markers).toEqual([
      { id: expect.any(String), label: "Cut 1", time: 2.5 },
    ])
    timeline().setMarkers([])
    applyLabProjectFile(
      parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
      []
    )
    expect(timeline().markers.map((m) => m.label)).toEqual(["Cut 1"])
    // Files without markers clear them.
    const bare = JSON.parse(JSON.stringify(saved))
    delete bare.timeline.markers
    applyLabProjectFile(parseLabProjectFileValue(bare), [])
    expect(timeline().markers).toEqual([])
  })
})
