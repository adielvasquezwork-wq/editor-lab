import {
  abs,
  clamp,
  dFdx,
  dFdy,
  dot,
  float,
  length,
  max,
  min,
  mix,
  smoothstep,
  step,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  computeScreenPlaneBasis,
  pxToPlaneUnits,
  type ScreenPlaneParams,
} from "@/lib/editor/screen-plane"
import { MediaPass } from "@/renderer/media-pass"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readVec2(value: unknown): [number, number] {
  return Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : [0, 0]
}

function hexToVector3(value: unknown): THREE.Vector3 {
  const hex =
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : "#ffffff"
  const color = new THREE.Color(hex)
  return new THREE.Vector3(color.r, color.g, color.b)
}

/**
 * 3D screen plane: shows the layer's image/video on a rectangle tilted in
 * perspective, with rounded corners and an optional stroke, and writes its
 * depth to the scene depth so depth-aware effects (Focus Blur in depth mode)
 * can blur along the plane.
 *
 * Each pixel's view ray is intersected with the plane analytically (see
 * lib/editor/screen-plane.ts for the geometry and its tests), so it stays a
 * normal full-screen pass: compositing, masks, clips and video decoding are
 * inherited from MediaPass unchanged.
 */
export class PlanePass extends MediaPass {
  private readonly planeCenter: Node
  private readonly planeU: Node
  private readonly planeV: Node
  private readonly planeNormal: Node
  private readonly tanHalfFovUniform: Node
  private readonly distanceUniform: Node
  private readonly radiusUniform: Node
  private readonly strokeUniform: Node
  private readonly strokeColorUniform: Node
  private readonly hasSceneDepthUniform: Node
  private readonly depthScene: THREE.Scene
  private readonly depthMaterial: THREE.MeshBasicNodeMaterial
  private readonly depthGeometry: THREE.PlaneGeometry
  private readonly sceneDepthPlaceholder: THREE.Texture
  private sceneDepthNode: Node | null = null
  private depthTarget: THREE.WebGLRenderTarget | null = null
  private planeParams: ScreenPlaneParams = {
    fov: 27,
    offset: [0, 0],
    rotationX: -7,
    rotationY: 24,
    rotationZ: 0,
    scale: 0.7,
  }
  private radiusPx = 24
  private strokePx = 2
  private frameAspect = 16 / 9

  constructor(layerId: string) {
    super(layerId)
    this.planeCenter = uniform(new THREE.Vector3(0, 0, -1))
    this.planeU = uniform(new THREE.Vector3(1, 0, 0))
    this.planeV = uniform(new THREE.Vector3(0, 1, 0))
    this.planeNormal = uniform(new THREE.Vector3(0, 0, 1))
    this.tanHalfFovUniform = uniform(Math.tan((27 * Math.PI) / 360))
    this.distanceUniform = uniform(1)
    this.radiusUniform = uniform(0)
    this.strokeUniform = uniform(0)
    this.strokeColorUniform = uniform(new THREE.Vector3(1, 1, 1))
    this.hasSceneDepthUniform = uniform(0)
    this.sceneDepthPlaceholder = new THREE.Texture()
    this.depthScene = new THREE.Scene()
    this.depthMaterial = new THREE.MeshBasicNodeMaterial()
    this.depthMaterial.blending = THREE.NoBlending
    this.depthGeometry = new THREE.PlaneGeometry(2, 2)
    const depthMesh = new THREE.Mesh(this.depthGeometry, this.depthMaterial)
    depthMesh.frustumCulled = false
    this.depthScene.add(depthMesh)
    this.depthMaterial.colorNode = this.buildDepthNode()
    this.syncBasis()
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    super.updateParams(params)
    this.planeParams = {
      fov: readNumber(params.fieldOfView, 27),
      offset: readVec2(params.offset),
      rotationX: readNumber(params.rotationX, -7),
      rotationY: readNumber(params.rotationY, 24),
      rotationZ: readNumber(params.rotationZ, 0),
      scale: readNumber(params.scale, 0.7),
    }
    this.radiusPx = Math.max(0, readNumber(params.cornerRadius, 24))
    this.strokePx = Math.max(0, readNumber(params.strokeWidth, 2))
    ;(this.strokeColorUniform?.value as THREE.Vector3 | undefined)?.copy(
      hexToVector3(params.strokeColor)
    )
    this.syncBasis()
  }

  override resize(width: number, height: number): void {
    super.resize(width, height)
    this.frameAspect = width / Math.max(height, 1)
    this.syncBasis()
  }

  override setSceneDepth(texture: THREE.Texture | null): void {
    super.setSceneDepth(texture)

    if (this.hasSceneDepthUniform) {
      this.hasSceneDepthUniform.value = texture ? 1 : 0
    }

    if (this.sceneDepthNode) {
      this.sceneDepthNode.value = texture ?? this.sceneDepthPlaceholder
    }
  }

  override getOutputSceneDepth(): THREE.Texture | null {
    return this.depthTarget
      ? this.depthTarget.texture
      : super.getOutputSceneDepth()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    timelineTime = time
  ): void {
    if (!this.depthTarget) {
      this.depthTarget = new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        format: THREE.RGBAFormat,
        generateMipmaps: false,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        type: THREE.HalfFloatType,
      })
    }

    this.depthTarget.setSize(outputTarget.width, outputTarget.height)
    renderer.setRenderTarget(this.depthTarget)
    renderer.render(this.depthScene, this.camera)

    super.render(
      renderer,
      inputTexture,
      outputTarget,
      time,
      delta,
      timelineTime
    )
  }

  override dispose(): void {
    this.depthTarget?.dispose()
    this.depthTarget = null
    this.depthMaterial.dispose()
    this.depthGeometry.dispose()
    this.sceneDepthPlaceholder.dispose()
    this.depthScene.clear()
    super.dispose()
  }

  private syncBasis(): void {
    if (!this.planeCenter) {
      return
    }

    const basis = computeScreenPlaneBasis(this.planeParams, this.frameAspect)
    ;(this.planeCenter.value as THREE.Vector3).set(...basis.center)
    ;(this.planeU.value as THREE.Vector3).set(...basis.u)
    ;(this.planeV.value as THREE.Vector3).set(...basis.v)
    ;(this.planeNormal.value as THREE.Vector3).set(...basis.normal)
    this.tanHalfFovUniform.value = basis.tanHalfFov
    this.distanceUniform.value = basis.distance
    this.radiusUniform.value = pxToPlaneUnits(
      this.radiusPx,
      this.planeParams.scale
    )
    this.strokeUniform.value = pxToPlaneUnits(
      this.strokePx,
      this.planeParams.scale
    )
  }

  /** Ray/plane hit for the current pixel: local coords, ray distance, validity. */
  private hit(): { local: Node; t: Node; valid: Node } {
    const ndc = uv().mul(2).sub(1)
    const ray = vec3(
      ndc.x.mul(this.tanHalfFovUniform).mul(this.canvasAspectUniform),
      ndc.y.mul(this.tanHalfFovUniform),
      float(-1)
    )
    const denominator = dot(ray, this.planeNormal)
    const safeDenominator = mix(
      denominator,
      float(1e-6),
      step(abs(denominator), float(1e-6))
    )
    const t = dot(this.planeCenter, this.planeNormal).div(safeDenominator)
    const point = ray.mul(t).sub(this.planeCenter)
    const local = vec2(dot(point, this.planeU), dot(point, this.planeV))
    const valid = step(float(1e-6), t).mul(step(float(1e-6), abs(denominator)))
    return { local, t, valid }
  }

  /** Signed distance to the rounded rectangle (negative inside), local units. */
  private roundedRectDistance(local: Node): Node {
    const halfSize = vec2(this.textureAspectUniform, float(1))
    const radius = min(this.radiusUniform, min(halfSize.x, halfSize.y))
    const q = abs(local).sub(halfSize).add(radius)
    return length(max(q, vec2(0, 0)))
      .add(min(max(q.x, q.y), float(0)))
      .sub(radius)
  }

  protected override buildEffectNode(): Node {
    if (!this.planeCenter) {
      return super.buildEffectNode()
    }

    const { local, valid } = this.hit()
    const halfWidth = max(this.textureAspectUniform, float(1e-4))
    const mediaUv = vec2(
      local.x.div(halfWidth).mul(0.5).add(0.5),
      local.y.mul(0.5).add(0.5)
    )
    this.mediaTextureNode = tslTexture(
      this.placeholder,
      clamp(mediaUv, vec2(0, 0), vec2(1, 1))
    )
    const distance = this.roundedRectDistance(local)
    const aa = max(length(vec2(dFdx(distance), dFdy(distance))), float(1e-5))
    const coverage = float(1)
      .sub(smoothstep(aa.negate(), aa, distance))
      .mul(valid)
    // Stroke: a band of width `stroke` just inside the edge.
    const strokeBand = smoothstep(
      this.strokeUniform.negate().sub(aa),
      this.strokeUniform.negate().add(aa),
      distance
    ).mul(step(float(1e-6), this.strokeUniform))
    const color = mix(
      vec3(
        this.mediaTextureNode.r,
        this.mediaTextureNode.g,
        this.mediaTextureNode.b
      ),
      this.strokeColorUniform,
      strokeBand
    )
    const alpha = mix(this.mediaTextureNode.a, float(1), strokeBand).mul(
      coverage
    )
    return vec4(color, alpha)
  }

  /** Plane depth (0.5 at center, nearer brighter); incoming depth elsewhere. */
  private buildDepthNode(): Node {
    const { local, t, valid } = this.hit()
    const inside = step(this.roundedRectDistance(local), float(0)).mul(valid)
    const planeDepth = clamp(
      this.distanceUniform.mul(0.5).div(max(t, float(1e-4))),
      0,
      1
    )
    this.sceneDepthNode = tslTexture(
      this.sceneDepthPlaceholder,
      vec2(uv().x, float(1).sub(uv().y))
    )
    const incoming = float(this.sceneDepthNode.r).mul(this.hasSceneDepthUniform)
    const depth = mix(incoming, planeDepth, inside)
    return vec4(depth, depth, depth, float(1))
  }
}
