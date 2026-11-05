import { describe, expect, test } from "bun:test"
import { autoVelocity } from "@/editorlab/effects/velocity-blur/auto-velocity"
import { streakLength } from "@/editorlab/effects/velocity-blur"
import { LINEAR_EASING } from "@/lib/easing-curve"
import { createLayer } from "@/lib/editor/layers"
import { buildRendererFrame } from "@/renderer/contracts"
import type { CompositionNode } from "@/renderer/composition-tree"
import type { RenderableLayerPass } from "@/renderer/contracts"
import { createParamBinding } from "@/store/timeline-store"
import {
  DEFAULT_SCENE_CONFIG,
  type EditorLayer,
  type TimelineTrack,
} from "@/types/editor"

function offsetTrack(
  layer: EditorLayer,
  from: [number, number],
  to: [number, number],
  seconds: number
): TimelineTrack {
  return {
    binding: createParamBinding(layer, "offset")!,
    enabled: true,
    id: `offset-${layer.id}`,
    keyframes: [
      { easing: LINEAR_EASING, id: "a", time: 0, value: from },
      { easing: LINEAR_EASING, id: "b", time: seconds, value: to },
    ],
    layerId: layer.id,
  }
}

const size = { height: 1080, width: 1920 }

describe("streak length", () => {
  test("speed × shutter / 360, capped", () => {
    expect(streakLength(40, 180, 160)).toBe(20)
    expect(streakLength(40, 360, 160)).toBe(40)
    expect(streakLength(-40, 180, 160)).toBe(20)
    expect(streakLength(400, 360, 160)).toBe(160)
    expect(streakLength(10, 0, 160)).toBe(0)
  })
})

describe("auto velocity from keyframes", () => {
  test("a linear slide of one frame width per second gives width / fps px per frame", () => {
    const blur = createLayer("velocity-blur")
    const plate = createLayer("image")
    const tracks = [offsetTrack(plate, [0, 0], [1, 0], 1)]
    const [vx, vy] = autoVelocity(blur, [blur, plate], tracks, 0.5, 24, size)
    expect(vx).toBeCloseTo(1920 / 24, 3)
    expect(vy).toBeCloseTo(0, 6)
  })

  test("still layers, layers above, other groups and hidden layers give zero", () => {
    const blur = createLayer("velocity-blur")
    const above = createLayer("image")
    const group = createLayer("group")
    const inGroup = { ...createLayer("image"), parentId: group.id }
    const hidden = { ...createLayer("image"), visible: false }
    const still = createLayer("image")
    const tracks = [
      offsetTrack(above, [0, 0], [1, 0], 1),
      offsetTrack(inGroup, [0, 0], [1, 0], 1),
      offsetTrack(hidden, [0, 0], [1, 0], 1),
    ]
    expect(
      autoVelocity(
        blur,
        [above, blur, group, inGroup, hidden, still],
        tracks,
        0.5,
        24,
        size
      )
    ).toEqual([0, 0])
  })

  test("the fastest layer below wins, and the frame inherits it as params", () => {
    const blur = createLayer("velocity-blur")
    const slow = createLayer("image")
    const fast = createLayer("image")
    const tracks = [
      offsetTrack(slow, [0, 0], [0.1, 0], 1),
      offsetTrack(fast, [0, 0], [0, -0.5], 1),
    ]
    const [vx, vy] = autoVelocity(
      blur,
      [blur, slow, fast],
      tracks,
      0.5,
      25,
      size
    )
    expect(vx).toBeCloseTo(0, 6)
    expect(vy).toBeCloseTo((-0.5 * 1080) / 25, 3)

    const frame = buildRendererFrame({
      assets: [],
      delta: 1 / 25,
      layers: [blur, slow, fast],
      logicalSize: size,
      outputSize: size,
      pixelRatio: 1,
      sceneConfig: DEFAULT_SCENE_CONFIG,
      timeline: {
        currentTime: 0.5,
        duration: 4,
        frameRate: 25,
        isPlaying: false,
        loop: false,
        selectedKeyframeId: null,
        selectedKeyframeIds: [],
        selectedTrackId: null,
        tracks,
      },
      viewportSize: size,
    })
    const flatten = (
      nodes: CompositionNode<RenderableLayerPass>[]
    ): RenderableLayerPass[] =>
      nodes.flatMap((node) =>
        "children" in node ? flatten(node.children) : [node]
      )
    const entry = flatten(frame.layers).find(
      (item) => item.layer.id === blur.id
    )!
    expect(entry.params.velocityX as number).toBeCloseTo(0, 6)
    expect(entry.params.velocityY as number).toBeCloseTo((-0.5 * 1080) / 25, 3)
  })

  test("at the end of a slide the speed is zero (keyframes hold)", () => {
    const blur = createLayer("velocity-blur")
    const plate = createLayer("image")
    const tracks = [offsetTrack(plate, [0, 0], [1, 0], 1)]
    expect(autoVelocity(blur, [blur, plate], tracks, 2, 24, size)).toEqual([
      0, 0,
    ])
  })
})
