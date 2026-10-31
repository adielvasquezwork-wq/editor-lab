import {
  abs,
  atan,
  clamp,
  dot,
  float,
  max,
  min,
  mix,
  smoothstep,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  type TSLNode,
  uniform,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const DEG = Math.PI / 180

/**
 * Opponent-plane hue angle (radians) of an sRGB colour, matching the shader.
 * a = r - (g + b) / 2, b = (g - b) * sqrt(3) / 2.
 */
export function opponentHue(r: number, g: number, b: number): number {
  return Math.atan2(((g - b) * Math.sqrt(3)) / 2, r - (g + b) / 2)
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex)
    ? Number.parseInt(hex.slice(1), 16)
    : 0xe0262b
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}

/**
 * Leave Color (D2 "B/W with red accent"): desaturates everything except
 * colours near one hue. Works on display-encoded values so the hue and
 * tolerance behave like the editor's colour pickers.
 */
export class LeaveColorPass extends PassNode {
  private readonly targetHueUniform: Node
  private readonly toleranceUniform: Node
  private readonly softnessUniform: Node
  private readonly amountUniform: Node
  private readonly minChromaUniform: Node

  constructor(layerId: string) {
    super(layerId)
    const [r, g, b] = hexToRgb("#e0262b")
    this.targetHueUniform = uniform(opponentHue(r, g, b))
    this.toleranceUniform = uniform(25 * DEG)
    this.softnessUniform = uniform(15 * DEG)
    this.amountUniform = uniform(1)
    this.minChromaUniform = uniform(0.12)
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    const [r, g, b] = hexToRgb(
      typeof params.color === "string" ? params.color : "#e0262b"
    )
    this.targetHueUniform.value = opponentHue(r, g, b)
    this.toleranceUniform.value =
      (typeof params.tolerance === "number"
        ? Math.min(180, Math.max(0, params.tolerance))
        : 25) * DEG
    this.softnessUniform.value =
      (typeof params.softness === "number"
        ? Math.min(90, Math.max(0.5, params.softness))
        : 15) * DEG
    this.amountUniform.value =
      typeof params.amount === "number"
        ? Math.min(1, Math.max(0, params.amount))
        : 1
    this.minChromaUniform.value =
      typeof params.minChroma === "number"
        ? Math.min(1, Math.max(0, params.minChroma))
        : 0.12
  }

  protected override buildEffectNode(): Node {
    if (!this.targetHueUniform) {
      return this.inputNode
    }

    const display = sRGBTransferOETF(
      clamp(vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b), 0, 1)
    )
    const opponentA = display.x.sub(display.y.add(display.z).mul(0.5))
    const opponentB = display.y.sub(display.z).mul(Math.sqrt(3) / 2)
    const hue = atan(opponentB, opponentA)
    // Wrapped angular distance to the target hue, in [0, pi].
    const raw = abs(hue.sub(this.targetHueUniform))
    const distance = min(raw, float(Math.PI * 2).sub(raw))
    const chroma = max(display.x, max(display.y, display.z)).sub(
      min(display.x, min(display.y, display.z))
    )
    const keepHue = float(1).sub(
      smoothstep(
        this.toleranceUniform,
        this.toleranceUniform.add(this.softnessUniform),
        distance
      )
    )
    const keepChroma = smoothstep(
      this.minChromaUniform.mul(0.5),
      this.minChromaUniform,
      chroma
    )
    const keep = keepHue.mul(keepChroma)
    const luma = vec3(dot(display, vec3(0.2126, 0.7152, 0.0722)))
    const desaturated = mix(display, luma, this.amountUniform)
    const out = mix(desaturated, display, keep)

    return vec4(sRGBTransferEOTF(out), this.inputNode.a)
  }
}
