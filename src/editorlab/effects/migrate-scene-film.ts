import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import type { EditorLayer, LayerParameterValues } from "@/types/editor"
import { BT709_LUMA } from "./shared"

/**
 * Projects saved before vignette and split tone became effect layers kept
 * them in sceneConfig. This turns those fields into equivalent layers on top
 * of the stack (vignette above split tone, matching the old order) and
 * returns the scene without them. Letterbox stays a scene setting.
 */

type RawScene = Record<string, unknown>

const HEX = /^#[0-9a-f]{6}$/i

function num(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function makeLayer(
  type: EditorLayer["type"],
  params: LayerParameterValues
): EditorLayer {
  const layer = createLayer(type)
  return { ...layer, params: { ...layer.params, ...params } }
}

export function vignetteParamsFromScene(
  value: unknown
): LayerParameterValues | null {
  const input = record(value)
  const amount = num(input?.amount, 0, 4)
  const inner = num(input?.inner, 0, 1)
  const outer = num(input?.outer, 0, 1.5)
  const roundness = num(input?.roundness, 0, 1)

  if (
    amount === null ||
    inner === null ||
    outer === null ||
    roundness === null
  ) {
    return null
  }

  if (amount <= 0) return null

  // Same falloff as the old scene vignette (ellipse, smoothstep inner..outer).
  return {
    amount,
    center: [0, 0],
    color: "#000000",
    linearLight: true,
    radius: inner,
    roundness,
    softness: Math.max(0.01, outer - inner),
    squareness: 0,
  }
}

/** Hue and an equivalent saturation for an old tint colour + amount. */
function hueAndSaturation(hex: string, amount: number): [number, number] {
  const color = new THREE.Color().setStyle(hex, THREE.NoColorSpace)
  const hsl = { h: 0, l: 0, s: 0 }
  color.getHSL(hsl, THREE.NoColorSpace)
  const offsetLength = (c: THREE.Color) => {
    const luma = BT709_LUMA[0] * c.r + BT709_LUMA[1] * c.g + BT709_LUMA[2] * c.b
    return Math.hypot(c.r - luma, c.g - luma, c.b - luma)
  }
  const full = new THREE.Color().setHSL(hsl.h, 1, 0.5, THREE.NoColorSpace)
  const fullLength = offsetLength(full)
  const saturation =
    fullLength > 0 ? (offsetLength(color) / fullLength) * amount : 0
  return [Math.round(hsl.h * 360), Math.min(1, saturation)]
}

export function splitToneParamsFromScene(
  value: unknown
): LayerParameterValues | null {
  const input = record(value)
  const balance = num(input?.balance, -1, 1)
  const shadowAmount = num(input?.shadowAmount, 0, 1)
  const highlightAmount = num(input?.highlightAmount, 0, 1)
  const shadowColor =
    typeof input?.shadowColor === "string" && HEX.test(input.shadowColor)
      ? input.shadowColor
      : null
  const highlightColor =
    typeof input?.highlightColor === "string" && HEX.test(input.highlightColor)
      ? input.highlightColor
      : null

  if (
    balance === null ||
    shadowAmount === null ||
    highlightAmount === null ||
    !shadowColor ||
    !highlightColor ||
    (shadowAmount <= 0 && highlightAmount <= 0)
  ) {
    return null
  }

  const [shadowHue, shadowSaturation] = hueAndSaturation(
    shadowColor,
    shadowAmount
  )
  const [highlightHue, highlightSaturation] = hueAndSaturation(
    highlightColor,
    highlightAmount
  )
  return {
    balance,
    highlightHue,
    highlightSaturation,
    shadowHue,
    shadowSaturation,
  }
}

export function migrateSceneFilmToLayers<Scene extends RawScene>(
  scene: Scene | null | undefined,
  layers: EditorLayer[]
): { layers: EditorLayer[]; scene: Scene | null | undefined } {
  if (!(scene && ("vignette" in scene || "splitTone" in scene))) {
    return { layers, scene }
  }

  const { splitTone, vignette, ...rest } = scene
  const added: EditorLayer[] = []
  const vignetteParams = vignetteParamsFromScene(vignette)
  const splitToneParams = splitToneParamsFromScene(splitTone)

  if (vignetteParams) added.push(makeLayer("vignette", vignetteParams))
  if (splitToneParams) added.push(makeLayer("split-tone", splitToneParams))

  return { layers: [...added, ...layers], scene: rest as unknown as Scene }
}
