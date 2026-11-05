import {
  clamp,
  dot,
  float,
  max,
  min,
  sqrt,
  step,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import { readNumber, readVec2 } from "../shared"

type Node = TSLNode

/**
 * Brown radial distortion: each output pixel samples the source at
 * p' = p (1 + k1 r² + k2 r⁴) / scale, with r measured so the frame's
 * shorter axis spans -1..1. Red and blue use k scaled by (1 ± fringe/2).
 *
 * Strong pincushion (or negative k2) makes r·f(r) fold back on itself past
 * some radius, which mirrors the image. We find that radius on the CPU and
 * hold the mapping flat beyond it, so the picture only ever stretches.
 */

/** Largest radius where r·(1 + a r² + b r⁴) is still increasing. */
export function foldRadius(a: number, b: number, maxRadius: number): number {
  const steps = 512
  for (let index = 1; index <= steps; index += 1) {
    const r = (maxRadius * index) / steps
    const r2 = r * r
    if (1 + 3 * a * r2 + 5 * b * r2 * r2 <= 0) {
      return (maxRadius * (index - 1)) / steps
    }
  }
  return Number.POSITIVE_INFINITY
}
export class LensDistortionPass extends PassNode {
  private readonly k1: Node
  private readonly k2: Node
  private readonly scale: Node
  private readonly chromatic: Node
  private readonly centerX: Node
  private readonly centerY: Node
  private readonly aspect: Node
  private readonly foldLimit: Node
  private readonly placeholder: THREE.Texture
  private sourceNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.k1 = uniform(0.12)
    this.k2 = uniform(0)
    this.scale = uniform(1.06)
    this.chromatic = uniform(0)
    this.centerX = uniform(0)
    this.centerY = uniform(0)
    this.aspect = uniform(16 / 9)
    this.foldLimit = uniform(1e9)
    this.syncFoldLimit()
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (const node of this.sourceNodes) {
      node.value = inputTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.k1.value = readNumber(params.k1, 0.12, -1, 1)
    this.k2.value = readNumber(params.k2, 0, -1, 1)
    this.scale.value = readNumber(params.scale, 1.06, 0.5, 2)
    this.chromatic.value = readNumber(params.chromatic, 0, 0, 1)
    const [cx, cy] = readVec2(params.center, [0, 0])
    this.centerX.value = cx
    this.centerY.value = cy
    this.syncFoldLimit()
  }

  override resize(width: number, height: number): void {
    this.aspect.value = width / Math.max(1, height)
    this.syncFoldLimit()
  }

  private syncFoldLimit(): void {
    if (!this.foldLimit) return
    const aspect = this.aspect.value as number
    // The red channel gets the largest |k|; its fold radius is the tightest.
    const kScale = 1 + (this.chromatic.value as number) * 0.5
    const corner = Math.sqrt(aspect * aspect + 1) * 2.5
    this.foldLimit.value = foldRadius(
      (this.k1.value as number) * kScale,
      (this.k2.value as number) * kScale,
      corner
    )
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }

  /** Display-space coordinate (0..1, +y up) this pixel samples from. */
  private distortedUv(kScale: Node): Node {
    const center = vec2(this.centerX, this.centerY)
    // -1..1 around the centre; r is circular (shorter axis spans -1..1).
    const p = uv().mul(2).sub(1).sub(center)
    const circular = vec2(p.x.mul(this.aspect), p.y)
    const r = sqrt(dot(circular, circular))
    // Past the fold radius the mapping is held flat (stretch, never mirror).
    const rEff = min(r, this.foldLimit)
    const r2 = rEff.mul(rEff)
    const k1 = this.k1.mul(kScale)
    const k2 = this.k2.mul(kScale)
    const factor = float(1).add(k1.mul(r2)).add(k2.mul(r2).mul(r2))
    const radial = rEff.mul(factor).div(max(r, float(1e-6)))
    const distorted = p.mul(radial).div(this.scale).add(center)
    return distorted.add(1).mul(0.5)
  }

  protected override buildEffectNode(): Node {
    if (!this.k1) {
      return this.inputNode
    }

    this.sourceNodes = []
    const inside = (coord: Node) =>
      step(float(0), coord.x)
        .mul(step(coord.x, float(1)))
        .mul(step(float(0), coord.y))
        .mul(step(coord.y, float(1)))
    // Render targets are stored flipped: sample at (x, 1 - y).
    const sample = (coord: Node) => {
      const node = tslTexture(
        this.placeholder,
        clamp(vec2(coord.x, float(1).sub(coord.y)), vec2(0, 0), vec2(1, 1))
      )
      this.sourceNodes.push(node)
      return node
    }
    const uvG = this.distortedUv(float(1))
    const uvR = this.distortedUv(float(1).add(this.chromatic.mul(0.5)))
    const uvB = this.distortedUv(float(1).sub(this.chromatic.mul(0.5)))
    const green = sample(uvG)
    const r = sample(uvR).r.mul(inside(uvR))
    const g = green.g.mul(inside(uvG))
    const b = sample(uvB).b.mul(inside(uvB))
    const a = green.a.mul(inside(uvG))
    return vec4(r, g, b, a)
  }
}
