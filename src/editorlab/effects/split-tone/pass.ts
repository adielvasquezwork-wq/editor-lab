import {
  clamp,
  dot,
  float,
  smoothstep,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  type TSLNode,
  uniform,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import { BT709_LUMA, readNumber } from "../shared"

type Node = TSLNode

/**
 * Chroma offset of a fully saturated hue (display space, zero luma), so
 * adding it shifts colour without changing brightness.
 */
// Saturation 1 = half of a fully saturated hue's chroma: strong but usable.
const MAX_TINT = 0.5

export function hueChromaOffset(hueDegrees: number): [number, number, number] {
  const color = new THREE.Color().setHSL(
    (((hueDegrees % 360) + 360) % 360) / 360,
    1,
    0.5,
    THREE.NoColorSpace
  )
  const luma =
    BT709_LUMA[0] * color.r + BT709_LUMA[1] * color.g + BT709_LUMA[2] * color.b
  return [
    (color.r - luma) * MAX_TINT,
    (color.g - luma) * MAX_TINT,
    (color.b - luma) * MAX_TINT,
  ]
}

export class SplitTonePass extends PassNode {
  private readonly shadowOffset: Node
  private readonly highlightOffset: Node
  private readonly pivot: Node

  constructor(layerId: string) {
    super(layerId)
    this.shadowOffset = uniform(new THREE.Vector3())
    this.highlightOffset = uniform(new THREE.Vector3())
    this.pivot = uniform(0.5)
    this.updateParams({})
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    if (!this.shadowOffset) return
    const shadow = hueChromaOffset(readNumber(params.shadowHue, 195))
    const shadowSat = readNumber(params.shadowSaturation, 0.3, 0, 1)
    const highlight = hueChromaOffset(readNumber(params.highlightHue, 35))
    const highlightSat = readNumber(params.highlightSaturation, 0.1, 0, 1)
    ;(this.shadowOffset.value as THREE.Vector3).set(
      shadow[0] * shadowSat,
      shadow[1] * shadowSat,
      shadow[2] * shadowSat
    )
    ;(this.highlightOffset.value as THREE.Vector3).set(
      highlight[0] * highlightSat,
      highlight[1] * highlightSat,
      highlight[2] * highlightSat
    )
    this.pivot.value = 0.5 + readNumber(params.balance, 0, -1, 1) * 0.25
  }

  protected override buildEffectNode(): Node {
    if (!this.shadowOffset) {
      return this.inputNode
    }

    // Display space so the pivot and hues behave like a colourist expects.
    const display = sRGBTransferOETF(
      clamp(vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b), 0, 1)
    )
    const luma = dot(display, vec3(...BT709_LUMA))
    // The toe keeps true black black: only shadow *tones* take the tint.
    // Full tint within 0.3 of the pivot on each side (mid grey stays exact).
    const shadowWeight = float(1)
      .sub(smoothstep(this.pivot.sub(0.3), this.pivot, luma))
      .mul(smoothstep(float(0), float(0.12), luma))
    const highlightWeight = smoothstep(this.pivot, this.pivot.add(0.3), luma)
    const tinted = clamp(
      display
        .add(this.shadowOffset.mul(shadowWeight))
        .add(this.highlightOffset.mul(highlightWeight)),
      0,
      1
    )
    // Clamping can change brightness at the extremes; put the luma back so
    // the effect only moves hue.
    const restoreLuma = (value: Node) =>
      clamp(value.add(luma.sub(dot(value, vec3(...BT709_LUMA)))), 0, 1)
    // Twice: the first correction can clip again near black or white.
    const toned = restoreLuma(restoreLuma(tinted))
    return vec4(sRGBTransferEOTF(toned), this.inputNode.a)
  }
}
