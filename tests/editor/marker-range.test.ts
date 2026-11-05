import { describe, expect, test } from "bun:test"
import { rangeFromMarkers } from "@/editorlab/timing/marker-range"

const m = (time: number) => ({ id: String(time), label: `M${time}`, time })

describe("export range from markers", () => {
  test("between the markers around the playhead", () => {
    expect(rangeFromMarkers([m(2), m(6), m(9)], 4, 10)).toEqual({
      duration: 4,
      start: 2,
    })
    expect(rangeFromMarkers([m(6), m(2), m(9)], 6, 10)).toEqual({
      duration: 3,
      start: 6,
    })
  })

  test("falls back to the timeline start and end", () => {
    expect(rangeFromMarkers([m(5)], 1, 10)).toEqual({ duration: 5, start: 0 })
    expect(rangeFromMarkers([m(5)], 7, 10)).toEqual({ duration: 5, start: 5 })
  })

  test("no markers or an empty range gives null", () => {
    expect(rangeFromMarkers([], 1, 10)).toBeNull()
    expect(rangeFromMarkers([m(10)], 10, 10)).toBeNull()
  })
})
