import { describe, expect, test } from "bun:test"
import {
  type AudioClip,
  normalizeAudioClips,
  normalizeAudioDucking,
} from "@/lib/editor/audio-clips"
import {
  buildGainEnvelope,
  getDialogueIntervals,
  getSegmentGain,
  planAudioMix,
} from "@/lib/editor/audio/mix-plan"
import { createLayer } from "@/lib/editor/layers"
import type { EditorAsset, EditorLayer } from "@/types/editor"

const asset = (id: string, kind: "audio" | "video"): EditorAsset => ({
  createdAt: "",
  duration: 30,
  error: null,
  fileName: id,
  height: null,
  id,
  kind,
  mimeType: "",
  sizeBytes: 1,
  source: "local",
  status: "ready",
  url: `blob:${id}`,
  width: null,
})
const audioClip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  assetId: "music",
  end: 10,
  fadeIn: 0,
  fadeOut: 0,
  id: "a1",
  name: "Music",
  role: "music",
  sourceIn: 0,
  start: 0,
  volume: 1,
  ...overrides,
})
const videoLayer = (clip?: EditorLayer["clip"]): EditorLayer => ({
  ...createLayer("video"),
  assetId: "vid",
  ...(clip ? { clip } : {}),
})
const assets = [asset("music", "audio"), asset("vid", "video")]
const DUCK = { amountDb: -12, enabled: true, rampSeconds: 0.5 }

describe("planAudioMix", () => {
  test("legacy (clip-less) video layers stay silent", () => {
    expect(planAudioMix({ assets, layers: [videoLayer()] })).toEqual([])
  })

  test("clipped video layers and audio clips become segments", () => {
    const layer = videoLayer({
      end: 6,
      fadeIn: 0,
      fadeOut: 0,
      sourceIn: 3,
      start: 2,
      audioRole: "dialogue",
      volume: 0.5,
    })
    const plan = planAudioMix({
      assets,
      audioClips: [audioClip()],
      layers: [layer],
    })
    expect(plan).toHaveLength(2)
    expect(plan.find((s) => s.key.startsWith("layer:"))).toMatchObject({
      role: "dialogue",
      sourceIn: 3,
      timelineEnd: 6,
      timelineStart: 2,
      url: "blob:vid",
      volume: 0.5,
    })
  })

  test("muted, hidden, zero-volume and missing-asset sources are skipped", () => {
    const base = { end: 6, fadeIn: 0, fadeOut: 0, sourceIn: 0, start: 0 }
    const layers = [
      videoLayer({ ...base, audioRole: "mute" }),
      { ...videoLayer(base), visible: false },
      videoLayer({ ...base, volume: 0 }),
      { ...videoLayer(base), assetId: "missing" },
    ]
    expect(
      planAudioMix({
        assets,
        audioClips: [audioClip({ assetId: "missing" })],
        layers,
      })
    ).toEqual([])
  })
})

describe("gain", () => {
  const dialogue = planAudioMix({
    assets,
    layers: [
      videoLayer({
        end: 6,
        fadeIn: 0,
        fadeOut: 0,
        sourceIn: 0,
        start: 4,
        audioRole: "dialogue",
      }),
    ],
  })
  const music = planAudioMix({
    assets,
    audioClips: [audioClip({ fadeIn: 1 })],
    layers: [],
  })[0]!
  const intervals = getDialogueIntervals(dialogue)

  test("dialogue intervals merge", () => {
    expect(
      getDialogueIntervals([
        { ...dialogue[0]!, timelineEnd: 3, timelineStart: 1 },
        { ...dialogue[0]!, timelineEnd: 5, timelineStart: 2 },
        { ...dialogue[0]!, timelineEnd: 9, timelineStart: 7 },
      ])
    ).toEqual([
      [1, 5],
      [7, 9],
    ])
  })

  test("music ducks under dialogue with ramps, and fades in", () => {
    const floor = 10 ** (-12 / 20)
    expect(getSegmentGain(music, 0.5, intervals, DUCK)).toBeCloseTo(0.5)
    expect(getSegmentGain(music, 2, intervals, DUCK)).toBe(1)
    expect(getSegmentGain(music, 3.75, intervals, DUCK)).toBeCloseTo(
      1 + (floor - 1) * 0.5
    )
    expect(getSegmentGain(music, 5, intervals, DUCK)).toBeCloseTo(floor)
    expect(getSegmentGain(music, 7, intervals, DUCK)).toBe(1)
    expect(
      getSegmentGain(music, 5, intervals, { ...DUCK, enabled: false })
    ).toBe(1)
    expect(getSegmentGain(dialogue[0]!, 5, intervals, DUCK)).toBe(1)
  })

  test("envelope has a point at every corner", () => {
    const envelope = buildGainEnvelope(music, intervals, DUCK)
    const times = envelope.map((p) => p.time)
    for (const t of [0, 1, 3.5, 4, 6, 6.5, 10]) expect(times).toContain(t)
    expect(envelope[0]).toEqual({ gain: 0, time: 0 })
    expect(envelope.find((p) => p.time === 4)?.gain).toBeCloseTo(
      10 ** (-12 / 20)
    )
  })
})

describe("normalization", () => {
  test("audio clips and ducking are validated", () => {
    expect(normalizeAudioClips("x")).toBeNull()
    expect(
      normalizeAudioClips([
        audioClip(),
        { id: 1 },
        audioClip({ end: -1 }),
        audioClip({ role: "weird" as never, volume: 9 }),
      ])
    ).toEqual([audioClip(), audioClip({ role: "music", volume: 2 })])
    expect(normalizeAudioDucking({ amountDb: 5, rampSeconds: 99 })).toEqual({
      amountDb: 0,
      enabled: true,
      rampSeconds: 5,
    })
  })
})
