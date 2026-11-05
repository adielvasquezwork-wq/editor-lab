import {
  clamp,
  float,
  mix,
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
import { readNumber } from "../shared"
import { streakLength } from "./index"

type Node = TSLNode

const TAPS = 16

/**
 * Directional blur along a velocity vector. The streak spans
 * speed × shutter / 360 composition pixels, centred on the pixel; 16 taps.
 * With `source: keyframes` the pipeline injects `velocityX` / `velocityY`
 * (px per frame) from the keyframes of the layers below; `manual` uses
 * angle + speed.
 */
export class VelocityBlurPass extends PassNode {
  private readonly stepUv: Node
  private readonly active: Node
  private readonly placeholder: THREE.Texture
  private sourceNodes: Node[] = []
  private logicalWidth = 1920
  private logicalHeight = 1080
  private params: LayerParameterValues = {}

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.stepUv = uniform(new THREE.Vector2(0, 0))
    this.active = uniform(0)
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
    this.params = params
    this.syncVector()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.syncVector()
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }

  /** Velocity in composition px/frame for the current params. */
  velocity(): [number, number] {
    const params = this.params
    if (params.source === "manual") {
      const angle = (readNumber(params.angle, 0, 0, 360) * Math.PI) / 180
      const speed = readNumber(params.speed, 40, 0, 400)
      return [Math.cos(angle) * speed, Math.sin(angle) * speed]
    }
    const gain = readNumber(params.gain, 1, 0, 4)
    return [
      readNumber(params.velocityX, 0) * gain,
      readNumber(params.velocityY, 0) * gain,
    ]
  }

  private syncVector(): void {
    if (!this.stepUv) return
    const [vx, vy] = this.velocity()
    const speed = Math.hypot(vx, vy)
    const length = streakLength(
      speed,
      readNumber(this.params.shutter, 180, 0, 720),
      readNumber(this.params.maxLength, 160, 0, 600)
    )
    if (length < 0.25 || speed === 0) {
      this.active.value = 0
      ;(this.stepUv.value as THREE.Vector2).set(0, 0)
      return
    }
    // Per-tap step so the 16 taps span the whole streak.
    const perTap = length / (TAPS - 1)
    ;(this.stepUv.value as THREE.Vector2).set(
      ((vx / speed) * perTap) / this.logicalWidth,
      ((vy / speed) * perTap) / this.logicalHeight
    )
    this.active.value = 1
  }

  protected override buildEffectNode(): Node {
    if (!this.stepUv) {
      return this.inputNode
    }

    this.sourceNodes = []
    const base = vec2(uv().x, float(1).sub(uv().y))
    let sum: Node = vec4(0, 0, 0, 0)

    for (let tap = 0; tap < TAPS; tap += 1) {
      const offset = this.stepUv.mul(tap - (TAPS - 1) / 2)
      const node = tslTexture(
        this.placeholder,
        clamp(
          base.add(vec2(offset.x, offset.y.negate())),
          vec2(0, 0),
          vec2(1, 1)
        )
      )
      this.sourceNodes.push(node)
      sum = sum.add(node)
    }

    const blurred = sum.div(TAPS)
    return mix(this.inputNode, blurred, step(float(0.5), this.active))
  }
}
