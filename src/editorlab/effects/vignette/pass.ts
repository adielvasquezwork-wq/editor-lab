import {
  abs,
  clamp,
  float,
  max,
  mix,
  pow,
  smoothstep,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  type TSLNode,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import {
  readBoolean,
  readDisplayColor,
  readLinearColor,
  readNumber,
  readVec2,
} from "../shared"

type Node = TSLNode

export class VignettePass extends PassNode {
  private readonly amount: Node
  private readonly radius: Node
  private readonly softness: Node
  private readonly roundness: Node
  private readonly exponent: Node
  private readonly centerX: Node
  private readonly centerY: Node
  private readonly linearColor: Node
  private readonly displayColor: Node
  private readonly linearLight: Node
  private readonly aspect: Node

  constructor(layerId: string) {
    super(layerId)
    this.amount = uniform(2.2)
    this.radius = uniform(0.25)
    this.softness = uniform(0.85)
    this.roundness = uniform(0)
    this.exponent = uniform(2 + 0.5 * 6)
    this.centerX = uniform(0)
    this.centerY = uniform(0)
    this.linearColor = uniform(new THREE.Vector3(0, 0, 0))
    this.displayColor = uniform(new THREE.Vector3(0, 0, 0))
    this.linearLight = uniform(1)
    this.aspect = uniform(16 / 9)
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    this.amount.value = readNumber(params.amount, 2.2, 0, 6)
    this.radius.value = readNumber(params.radius, 0.25, 0, 1.5)
    this.softness.value = readNumber(params.softness, 0.85, 0.01, 2)
    this.roundness.value = readNumber(params.roundness, 0, 0, 1)
    this.exponent.value = 2 + readNumber(params.squareness, 0.5, 0, 1) * 6
    const [cx, cy] = readVec2(params.center, [0, 0])
    this.centerX.value = cx
    this.centerY.value = cy
    ;(this.linearColor.value as THREE.Vector3).copy(
      readLinearColor(params.color, "#000000")
    )
    ;(this.displayColor.value as THREE.Vector3).copy(
      readDisplayColor(params.color, "#000000")
    )
    this.linearLight.value = readBoolean(params.linearLight, true) ? 1 : 0
  }

  override resize(width: number, height: number): void {
    this.aspect.value = width / Math.max(1, height)
  }

  protected override buildEffectNode(): Node {
    if (!this.amount) {
      return this.inputNode
    }

    // -1..1 across the frame, recentred.
    const p = uv().mul(2).sub(1)
    const stretch = mix(float(1), this.aspect, this.roundness)
    const x = abs(p.x.sub(this.centerX)).mul(stretch)
    const y = abs(p.y.sub(this.centerY))
    const e = this.exponent
    // Superellipse distance, normalised so the frame corner is 1.
    const distance = pow(pow(x, e).add(pow(y, e)), float(1).div(e))
    const corner = pow(pow(stretch, e).add(1), float(1).div(e))
    const d = distance.div(corner)
    const mask = smoothstep(this.radius, this.radius.add(this.softness), d)
    const keep = pow(float(2), this.amount.mul(mask).negate())

    const rgb = vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b)
    const linearOut = mix(this.linearColor, rgb, keep)
    const display = sRGBTransferOETF(clamp(rgb, 0, 1))
    const displayOut = sRGBTransferEOTF(
      clamp(mix(this.displayColor, display, keep), 0, 1)
    )
    const out = mix(displayOut, linearOut, this.linearLight)
    return vec4(max(out, vec3(0, 0, 0)), this.inputNode.a)
  }
}
