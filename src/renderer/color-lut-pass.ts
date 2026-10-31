import {
  clamp,
  float,
  floor,
  min,
  mix,
  pow,
  step,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  type TSLNode,
  texture as tslTexture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const INPUT_TRANSFORMS = { logc3: 2, none: 0, slog3: 1, vlog: 3 } as const

/**
 * Applies a 3D LUT (stored as a 2D strip image, see lib/editor/cube-lut.ts)
 * with an optional camera-log -> Rec.709 input transform.
 *
 * The pipeline works in linear light; LUTs and log curves are defined on
 * encoded code values, so the pass encodes to sRGB code values, transforms,
 * and decodes back. With no LUT loaded and Input = Display it is an exact
 * passthrough.
 */
export class ColorLutPass extends PassNode {
  private readonly intensityUniform: Node
  private readonly hasLutUniform: Node
  private readonly lutSizeUniform: Node
  private readonly transformUniform: Node
  private readonly placeholder: THREE.DataTexture
  /** Both slice samplers; rebound together when the LUT changes. */
  private lutTextureNodes: Node[] = []
  private lutTexture: THREE.Texture | null = null
  private lutUrl: string | null = null
  private loadNonce = 0

  constructor(layerId: string) {
    super(layerId)
    this.intensityUniform = uniform(1)
    this.hasLutUniform = uniform(0)
    this.lutSizeUniform = uniform(2)
    this.transformUniform = uniform(0)
    this.placeholder = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1
    )
    this.placeholder.needsUpdate = true
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    this.intensityUniform.value =
      typeof params.intensity === "number"
        ? Math.min(1, Math.max(0, params.intensity))
        : 1
    this.transformUniform.value =
      INPUT_TRANSFORMS[
        params.inputTransform as keyof typeof INPUT_TRANSFORMS
      ] ?? 0
  }

  /** Loads (or clears) the LUT strip image. */
  async setLut(url: string | null): Promise<void> {
    if (url === this.lutUrl) {
      return
    }

    this.lutUrl = url
    this.loadNonce += 1
    const nonce = this.loadNonce

    if (!url) {
      this.releaseLut()
      return
    }

    const texture = await new THREE.TextureLoader().loadAsync(url)

    if (nonce !== this.loadNonce) {
      texture.dispose()
      return
    }

    // Data, not color: no sRGB decode, no flip, no mips.
    texture.colorSpace = THREE.NoColorSpace
    texture.flipY = false
    texture.generateMipmaps = false
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true

    const size = (texture.image as { height?: number } | null)?.height ?? 0
    const width = (texture.image as { width?: number } | null)?.width ?? 0

    if (!(size >= 2 && width === size * size)) {
      texture.dispose()
      throw new Error("Not a LUT strip image (expected width = height²).")
    }

    this.releaseLut()
    this.lutTexture = texture
    this.lutSizeUniform.value = size
    this.hasLutUniform.value = 1

    for (const node of this.lutTextureNodes) {
      node.value = texture
    }
  }

  override dispose(): void {
    this.loadNonce += 1
    this.releaseLut()
    this.placeholder.dispose()
    super.dispose()
  }

  private releaseLut(): void {
    this.hasLutUniform.value = 0

    for (const node of this.lutTextureNodes) {
      node.value = this.placeholder
    }

    this.lutTexture?.dispose()
    this.lutTexture = null
  }

  protected override buildEffectNode(): Node {
    if (!this.intensityUniform) {
      return this.inputNode
    }

    const code = sRGBTransferOETF(
      clamp(vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b), 0, 1)
    )
    const ten = float(10)

    // Published camera log decodes (code value -> scene linear).
    const slog3Cut = float(171.2102946929 / 1023)
    const slog3 = mix(
      code
        .mul(1023)
        .sub(95)
        .mul(0.01125 / (171.2102946929 - 95)),
      pow(ten, code.mul(1023).sub(420).div(261.5)).mul(0.19).sub(0.01),
      step(slog3Cut, code)
    )
    const logc3 = mix(
      code.sub(0.092809).div(5.367655),
      pow(ten, code.sub(0.385537).div(0.24719)).sub(0.052272).div(5.555556),
      step(float(0.149658), code)
    )
    const vlog = mix(
      code.sub(0.125).div(5.6),
      pow(ten, code.sub(0.598206).div(0.241514)).sub(0.00873),
      step(float(0.181), code)
    )
    const transform = this.transformUniform
    const sceneLinear = clamp(
      slog3
        .mul(step(float(0.5), transform).mul(step(transform, float(1.5))))
        .add(
          logc3.mul(
            step(float(1.5), transform).mul(step(transform, float(2.5)))
          )
        )
        .add(vlog.mul(step(float(2.5), transform))),
      0,
      1
    )
    // Rec.709 OETF, no tone curve: highlights above scene 1.0 clip.
    const rec709 = mix(
      sceneLinear.mul(4.5),
      pow(sceneLinear, vec3(0.45)).mul(1.099).sub(0.099),
      step(float(0.018), sceneLinear)
    )
    const graded = mix(code, rec709, step(float(0.5), transform))

    // Strip lookup: manual blend between blue slices; red/green use the
    // texture's bilinear filtering inside a slice.
    const n = this.lutSizeUniform
    const scaled = clamp(graded, 0, 1).mul(n.sub(1))
    const blueLow = floor(scaled.z)
    const blueHigh = min(blueLow.add(1), n.sub(1))
    const blend = scaled.z.sub(blueLow)
    const v = scaled.y.add(0.5).div(n)
    const width = n.mul(n)
    const source = this.lutTexture ?? this.placeholder
    const low = tslTexture(
      source,
      vec2(blueLow.mul(n).add(scaled.x).add(0.5).div(width), v)
    )
    const high = tslTexture(
      source,
      vec2(blueHigh.mul(n).add(scaled.x).add(0.5).div(width), v)
    )
    this.lutTextureNodes = [low, high]
    const lutColor = mix(
      vec3(low.r, low.g, low.b),
      vec3(high.r, high.g, high.b),
      blend
    )
    const outCode = mix(
      graded,
      lutColor,
      this.intensityUniform.mul(this.hasLutUniform)
    )

    return vec4(sRGBTransferEOTF(outCode), this.inputNode.a)
  }
}
