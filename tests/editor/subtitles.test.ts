import { describe, expect, test } from "bun:test"
import {
  formatSrt,
  getActiveSubtitleText,
  normalizeSubtitleCues,
  parseSubtitles,
} from "@/lib/editor/subtitles"

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello <i>world</i>

2
00:00:04,000 --> 00:00:06,000
Second line
and a third

3
00:01:02,250 --> 00:01:04,000
Later
`

const VTT = `WEBVTT

NOTE a comment

intro
00:01.000 --> 00:02.500 align:start
<v Speaker>Interview start</v>

00:00:03.000 --> 00:00:04.000
&amp; more
`

describe("parseSubtitles", () => {
  test("parses SRT with markup stripped and multi-line cues", () => {
    expect(parseSubtitles(SRT)).toEqual([
      { end: 3.5, start: 1, text: "Hello world" },
      { end: 6, start: 4, text: "Second line\nand a third" },
      { end: 64, start: 62.25, text: "Later" },
    ])
  })

  test("parses WebVTT with short timestamps, settings and entities", () => {
    expect(parseSubtitles(VTT)).toEqual([
      { end: 2.5, start: 1, text: "Interview start" },
      { end: 4, start: 3, text: "& more" },
    ])
  })

  test("handles CRLF, BOM and junk without throwing", () => {
    expect(parseSubtitles(`﻿${SRT.replace(/\n/g, "\r\n")}`)).toHaveLength(3)
    expect(parseSubtitles("not subtitles at all")).toEqual([])
    expect(parseSubtitles("00:00:05,000 --> 00:00:01,000\nbackwards")).toEqual(
      []
    )
  })
})

describe("getActiveSubtitleText", () => {
  const cues = parseSubtitles(SRT)

  test("returns the cue at the playhead and nothing between cues", () => {
    expect(getActiveSubtitleText(cues, 0.5)).toBe("")
    expect(getActiveSubtitleText(cues, 1)).toBe("Hello world")
    expect(getActiveSubtitleText(cues, 3.5)).toBe("")
    expect(getActiveSubtitleText(cues, 5)).toBe("Second line\nand a third")
    expect(getActiveSubtitleText(cues, 63)).toBe("Later")
    expect(getActiveSubtitleText(cues, 100)).toBe("")
    expect(getActiveSubtitleText([], 1)).toBe("")
  })

  test("joins overlapping cues", () => {
    const overlapping = [
      { end: 5, start: 0, text: "A" },
      { end: 3, start: 2, text: "B" },
    ]
    expect(getActiveSubtitleText(overlapping, 2.5)).toBe("A\nB")
  })
})

describe("normalize and format", () => {
  test("normalize drops invalid entries and sorts", () => {
    expect(
      normalizeSubtitleCues([
        { end: 4, start: 3, text: "b" },
        { end: 1, start: 2, text: "bad" },
        null,
        { end: 2, start: 1, text: "a" },
      ])
    ).toEqual([
      { end: 2, start: 1, text: "a" },
      { end: 4, start: 3, text: "b" },
    ])
    expect(normalizeSubtitleCues("x")).toBeNull()
  })

  test("SRT round-trips", () => {
    const cues = parseSubtitles(SRT)
    expect(parseSubtitles(formatSrt(cues))).toEqual(cues)
  })
})
