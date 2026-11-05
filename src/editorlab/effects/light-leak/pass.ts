import {
  clamp,
  exp,
  float,
  max,
  min,
  mix,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import { readNumber } from "../shared"

type Node = TSLNode

const BLOBS = 3

/** Deterministic hash in [0, 1) from integers (same on every GPU and CPU). */
export function seededUnit(
  seed: number,
  index: number,
  channel: number
): number {
  let h =
    (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = (Math.imul(h, 0x27d4eb2f) + Math.imul(channel + 1, 0x165667b1)) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/** Hue (degrees) to a saturated linear-light colour. */
export function hueToLinear(
  hue: number,
  saturation = 0.85
): [number, number, number] {
  const color = new THREE.Color().setHSL(
    (((hue % 360) + 360) % 360) / 360,
    saturation,
    0.5,
    THREE.SRGBColorSpace
  )
  return [color.r, color.g, color.b]
}

const EDGE_DIRECTIONS: Record<string, [number, number]> = {
  bottom: [0, 1],
  left: [1, 0],
  right: [-1, 0],
  top: [0, -1],
}

/**
 * Light leak: three soft colour blobs that sweep across the frame with
 * `progress`, scaled by an envelope that is exactly zero at 0 and 1 (so the
 * effect is a true passthrough outside the transition). Blob shapes come
 * from a seeded hash on the CPU; the shader only draws them.
 */
export class LightLeakPass extends PassNode {
  private readonly blobCenters: Node[] = []
  private readonly blobRadii: Node[] = []
  private readonly blobColors: Node[] = []
  private readonly strength: Node
  private readonly leakBlend: Node
  private readonly aspect: Node
  private seed = 7
  private hue = 22
  private hueSpread = 45
  private size = 1
  private progress = 0.5
  private intensity = 1
  private edge = "right"

  constructor(layerId: string) {
    super(layerId)
    for (let index = 0; index < BLOBS; index += 1) {
      this.blobCenters.push(uniform(new THREE.Vector2(0.5, 0.5)))
      this.blobRadii.push(uniform(new THREE.Vector2(0.3, 0.2)))
      this.blobColors.push(uniform(new THREE.Vector3(1, 0.5, 0.2)))
    }
    this.strength = uniform(0)
    this.leakBlend = uniform(0)
    this.aspect = uniform(16 / 9)
    this.syncBlobs()
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    this.seed = Math.round(readNumber(params.seed, 7, 0, 9999))
    this.hue = readNumber(params.hue, 22, 0, 360)
    this.hueSpread = readNumber(params.hueSpread, 45, 0, 180)
    this.size = readNumber(params.size, 1, 0.2, 3)
    this.progress = readNumber(params.progress, 0.5, 0, 1)
    this.intensity = readNumber(params.intensity, 1, 0, 3)
    this.edge =
      typeof params.edge === "string" && params.edge in EDGE_DIRECTIONS
        ? params.edge
        : "right"
    this.leakBlend.value = params.blend === "add" ? 1 : 0
    this.syncBlobs()
  }

  override resize(width: number, height: number): void {
    this.aspect.value = width / Math.max(1, height)
    this.syncBlobs()
  }

  private syncBlobs(): void {
    if (this.blobCenters.length === 0) return
    const direction = EDGE_DIRECTIONS[this.edge] ?? EDGE_DIRECTIONS.right!
    // Travel from just outside the entry edge to just outside the far edge.
    const travel = 1.8
    const start: [number, number] = [
      0.5 - (direction[0] * travel) / 2,
      0.5 - (direction[1] * travel) / 2,
    ]
    const aspect = this.aspect.value as number
    // Envelope: 0 at both ends, 1 at the middle, smooth shoulders.
    const envelope = smoothEnvelope(this.progress)
    this.strength.value = envelope * this.intensity

    for (let index = 0; index < BLOBS; index += 1) {
      const lag = seededUnit(this.seed, index, 0) * 0.35
      const t = clampUnit(this.progress * (1 + lag) - lag * 0.5)
      const across = seededUnit(this.seed, index, 1) * 0.7 + 0.15
      const centerX = start[0] + direction[0] * travel * t
      const centerY = start[1] + direction[1] * travel * t
      // Sideways position (perpendicular to the sweep).
      const sideX = direction[0] === 0 ? across : centerX
      const sideY = direction[1] === 0 ? across : centerY
      ;(this.blobCenters[index]!.value as THREE.Vector2).set(sideX, sideY)
      const radiusMajor =
        (0.22 + seededUnit(this.seed, index, 2) * 0.3) * this.size
      const radiusMinor =
        radiusMajor * (0.35 + seededUnit(this.seed, index, 3) * 0.45)
      const horizontal = direction[1] !== 0
      ;(this.blobRadii[index]!.value as THREE.Vector2).set(
        (horizontal ? radiusMajor : radiusMinor) / aspect,
        horizontal ? radiusMinor : radiusMajor
      )
      const hueOffset =
        index === 0
          ? 0
          : (seededUnit(this.seed, index, 4) - 0.5) * 2 * this.hueSpread
      const [r, g, b] = hueToLinear(this.hue + hueOffset)
      const brightness =
        index === 0 ? 1 : 0.6 + seededUnit(this.seed, index, 5) * 0.3
      ;(this.blobColors[index]!.value as THREE.Vector3).set(
        r * brightness,
        g * brightness,
        b * brightness
      )
    }
  }

  protected override buildEffectNode(): Node {
    if (!this.strength) {
      return this.inputNode
    }

    const p = uv()
    let leak: Node = vec3(0, 0, 0)

    for (let index = 0; index < BLOBS; index += 1) {
      const delta = p.sub(this.blobCenters[index]!)
      const scaled = vec2(
        delta.x.div(this.blobRadii[index]!.x),
        delta.y.div(this.blobRadii[index]!.y)
      )
      const falloff = exp(
        scaled.x.mul(scaled.x).add(scaled.y.mul(scaled.y)).negate()
      )
      leak = leak.add(this.blobColors[index]!.mul(falloff))
    }

    // A faint streak across the whole leak, so it reads as light not a blob.
    const streak = float(0.15).mul(
      max(float(0), sin(p.x.mul(6.283).add(p.y.mul(2.1)))).mul(
        smoothstep(float(0.0), float(0.3), leak.r.add(leak.g).add(leak.b))
      )
    )
    const light = leak.add(this.blobColors[0]!.mul(streak)).mul(this.strength)
    const rgb = vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b)
    const added = rgb.add(light)
    const screened = float(1).sub(
      float(1)
        .sub(clamp(rgb, 0, 1))
        .mul(float(1).sub(min(light, vec3(1, 1, 1))))
    )
    const out = mix(screened, added, this.leakBlend)
    return vec4(max(out, vec3(0, 0, 0)), this.inputNode.a)
  }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Smooth 0 → 1 → 0 envelope over progress, exactly 0 at both ends. */
export function smoothEnvelope(progress: number): number {
  const p = clampUnit(progress)
  if (p <= 0 || p >= 1) return 0
  const shaped = p < 0.5 ? p * 2 : (1 - p) * 2
  return shaped * shaped * (3 - 2 * shaped)
}
