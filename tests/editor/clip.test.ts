import { describe, expect, test } from "bun:test"
import {
  createClip,
  getClipFadeFactor,
  getClipSourceTime,
  getClipsEnd,
  isTimeInClip,
  type LayerClip,
  moveClip,
  normalizeLayerClip,
  setClipFades,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from "@/lib/editor/clip"

const clip = (overrides: Partial<LayerClip> = {}): LayerClip => ({
  end: 6,
  fadeIn: 0,
  fadeOut: 0,
  sourceIn: 10,
  start: 2,
  ...overrides,
})

describe("normalizeLayerClip", () => {
  test("rejects non-objects and empty ranges", () => {
    expect(normalizeLayerClip(null)).toBeNull()
    expect(normalizeLayerClip("x")).toBeNull()
    expect(normalizeLayerClip([1, 2])).toBeNull()
    expect(normalizeLayerClip({ end: 1, start: 1 })).toBeNull()
    expect(normalizeLayerClip({ end: Number.NaN, start: 0 })).toBeNull()
  })

  test("fills defaults and clamps fades to the duration", () => {
    expect(
      normalizeLayerClip({ end: 3, fadeIn: 5, fadeOut: 5, start: 1 })
    ).toEqual({
      end: 3,
      fadeIn: 2,
      fadeOut: 0,
      sourceIn: 0,
      start: 1,
    })
    expect(normalizeLayerClip({ end: 3, sourceIn: -4, start: -1 })?.start).toBe(
      0
    )
    expect(
      normalizeLayerClip({ end: 3, sourceIn: -4, start: -1 })?.sourceIn
    ).toBe(0)
  })
})

describe("timing", () => {
  test("layers without a clip are always present at full strength", () => {
    expect(isTimeInClip(null, 999)).toBe(true)
    expect(getClipFadeFactor(undefined, 5)).toBe(1)
  })

  test("range is start-inclusive, end-exclusive", () => {
    expect(isTimeInClip(clip(), 1.999)).toBe(false)
    expect(isTimeInClip(clip(), 2)).toBe(true)
    expect(isTimeInClip(clip(), 5.999)).toBe(true)
    expect(isTimeInClip(clip(), 6)).toBe(false)
  })

  test("fades ramp linearly at both edges", () => {
    const faded = clip({ fadeIn: 1, fadeOut: 2 })
    expect(getClipFadeFactor(faded, 2)).toBe(0)
    expect(getClipFadeFactor(faded, 2.5)).toBeCloseTo(0.5)
    expect(getClipFadeFactor(faded, 3.5)).toBe(1)
    expect(getClipFadeFactor(faded, 5)).toBeCloseTo(0.5)
    expect(getClipFadeFactor(faded, 7)).toBe(0)
  })

  test("source time follows the in-point and playback rate", () => {
    expect(getClipSourceTime(clip(), 2)).toBe(10)
    expect(getClipSourceTime(clip(), 3.5)).toBe(11.5)
    expect(getClipSourceTime(clip(), 3, 2)).toBe(12)
    expect(getClipSourceTime(clip(), 3, 0)).toBe(11)
  })
})

describe("editing", () => {
  test("split continues the source seamlessly and keeps outer fades", () => {
    const parts = splitClip(clip({ fadeIn: 0.5, fadeOut: 0.5 }), 4)
    expect(parts).not.toBeNull()
    const [left, right] = parts as [LayerClip, LayerClip]
    expect(left).toEqual({
      end: 4,
      fadeIn: 0.5,
      fadeOut: 0,
      sourceIn: 10,
      start: 2,
    })
    expect(right).toEqual({
      end: 6,
      fadeIn: 0,
      fadeOut: 0.5,
      sourceIn: 12,
      start: 4,
    })
    // Same source frame either side of the cut.
    expect(getClipSourceTime(right, 4)).toBe(getClipSourceTime(clip(), 4))
  })

  test("split at playback rate 2 advances the source twice as far", () => {
    const [, right] = splitClip(clip(), 3, 2) as [LayerClip, LayerClip]
    expect(right.sourceIn).toBe(12)
  })

  test("split refuses the edges", () => {
    expect(splitClip(clip(), 2)).toBeNull()
    expect(splitClip(clip(), 6)).toBeNull()
    expect(splitClip(clip(), 9)).toBeNull()
  })

  test("move keeps duration and trim", () => {
    expect(moveClip(clip(), 5)).toEqual(clip({ end: 9, start: 5 }))
    expect(moveClip(clip(), -3).start).toBe(0)
  })

  test("trimming the start keeps footage anchored to the timeline", () => {
    const trimmed = trimClipStart(clip(), 3)
    expect(trimmed.start).toBe(3)
    expect(trimmed.sourceIn).toBe(11)
    expect(getClipSourceTime(trimmed, 4)).toBe(getClipSourceTime(clip(), 4))
  })

  test("trimming the start cannot reveal footage before source zero", () => {
    expect(trimClipStart(clip({ sourceIn: 1 }), 0)).toMatchObject({
      sourceIn: 0,
      start: 1,
    })
  })

  test("trimming the end respects source length and minimum duration", () => {
    expect(trimClipEnd(clip(), 100, 15).end).toBe(7)
    expect(trimClipEnd(clip(), 100, null).end).toBe(100)
    expect(trimClipEnd(clip(), 0).end).toBeGreaterThan(2)
  })

  test("fades are clamped when the clip shrinks", () => {
    const faded = setClipFades(clip(), 3, 3)
    expect(faded.fadeIn + faded.fadeOut).toBeLessThanOrEqual(4)
    expect(trimClipEnd(clip({ fadeOut: 3 }), 3).fadeOut).toBeLessThanOrEqual(1)
  })

  test("createClip and getClipsEnd", () => {
    expect(createClip(-1, 4, 2)).toEqual({
      end: 4,
      fadeIn: 0,
      fadeOut: 0,
      sourceIn: 2,
      start: 0,
    })
    expect(
      getClipsEnd([{}, { clip: clip() }, { clip: clip({ end: 9 }) }])
    ).toBe(9)
    expect(getClipsEnd([])).toBe(0)
  })
})
