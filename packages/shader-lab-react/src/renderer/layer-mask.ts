import {
  abs,
  clamp,
  float,
  Fn,
  length,
  max,
  min,
  mix,
  select,
  smoothstep,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { CELL_PAINT_SIZE, decodeCellPaintMask } from "./cell-paint-mask"

export const LAYER_MASK_SHAPES = [
  "none",
  "linear",
  "radial",
  "ellipse",
  "rectangle",
  "brush",
  "depth",
] as const
export type LayerMaskShape = (typeof LAYER_MASK_SHAPES)[number]
export const LAYER_MASK_SCOPES = ["effect", "content"] as const
export type LayerMaskScope = (typeof LAYER_MASK_SCOPES)[number]

export interface LayerMaskState {
  shape: LayerMaskShape
  scope: LayerMaskScope
  enabled: boolean
  invert: boolean
  center: [number, number]
  size: [number, number]
  rotation: number
  feather: number
  paint: string
}

export const DEFAULT_LAYER_MASK: LayerMaskState = {
  shape: "none",
  scope: "effect",
  enabled: true,
  invert: false,
  center: [0, 0],
  size: [0.5, 0.5],
  rotation: 0,
  feather: 0.01,
  paint: "",
}

const MIN_SIZE = 0.001
const MAX_SIZE = 8

function finite(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

function pair(
  value: unknown,
  fallback: [number, number],
  low: number,
  high: number
): [number, number] {
  return Array.isArray(value)
    ? [
        finite(value[0], fallback[0], low, high),
        finite(value[1], fallback[1], low, high),
      ]
    : fallback
}

export function normalizeLayerMask(value: unknown): LayerMaskState | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const shape = LAYER_MASK_SHAPES.includes(input.shape as LayerMaskShape)
    ? (input.shape as LayerMaskShape)
    : "none"
  return {
    shape,
    scope: input.scope === "content" ? "content" : "effect",
    enabled: input.enabled !== false,
    invert: input.invert === true,
    center: pair(input.center, DEFAULT_LAYER_MASK.center, -MAX_SIZE, MAX_SIZE),
    size: pair(input.size, DEFAULT_LAYER_MASK.size, MIN_SIZE, MAX_SIZE),
    rotation: finite(input.rotation, 0, -360, 360),
    feather: finite(input.feather, DEFAULT_LAYER_MASK.feather, 0, 1),
    paint: typeof input.paint === "string" ? input.paint : "",
  }
}

export function isLayerMaskActive(
  mask: LayerMaskState | null | undefined
): mask is LayerMaskState {
  return !!mask && mask.enabled && mask.shape !== "none"
}

export function layerMaskSignature(
  mask: LayerMaskState | null | undefined
): string {
  if (!isLayerMaskActive(mask)) return "mask:off"
  return [
    "mask",
    mask.shape,
    mask.scope,
    mask.invert ? "1" : "0",
    mask.center.join(","),
    mask.size.join(","),
    mask.rotation,
    mask.feather,
    mask.shape === "brush" ? mask.paint : "",
  ].join(":")
}

export type LayerMaskRole = "source" | "effect" | "transform"

const ELLIPSE_DISTANCE_ITERATIONS = 3
const FAR_DISTANCE = 1e20
const MAX_BRUSH_DISTANCE = 60000

function distanceTransform1d(
  f: Float64Array,
  count: number,
  spacing: number,
  out: Float64Array,
  hull: Int32Array,
  bounds: Float64Array
) {
  const intersect = (q: number, p: number) =>
    (f[q]! + (q * spacing) ** 2 - (f[p]! + (p * spacing) ** 2)) /
    (2 * spacing * (q - p))
  let k = 0
  hull[0] = 0
  bounds[0] = Number.NEGATIVE_INFINITY
  bounds[1] = Number.POSITIVE_INFINITY
  for (let q = 1; q < count; q += 1) {
    let s = intersect(q, hull[k]!)
    while (s <= bounds[k]!) {
      k -= 1
      s = intersect(q, hull[k]!)
    }
    k += 1
    hull[k] = q
    bounds[k] = s
    bounds[k + 1] = Number.POSITIVE_INFINITY
  }
  k = 0
  for (let q = 0; q < count; q += 1) {
    while (bounds[k + 1]! < q * spacing) k += 1
    const p = hull[k]!
    out[q] = ((q - p) * spacing) ** 2 + f[p]!
  }
}

function squaredDistanceTo(
  seeds: Uint8Array,
  seedValue: boolean,
  size: number,
  spacingX: number,
  spacingY: number
): Float64Array {
  const grid = new Float64Array(size * size)
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = (seeds[index] !== 0) === seedValue ? 0 : FAR_DISTANCE
  }
  const line = new Float64Array(size)
  const out = new Float64Array(size)
  const hull = new Int32Array(size)
  const bounds = new Float64Array(size + 1)
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) line[y] = grid[y * size + x]!
    distanceTransform1d(line, size, spacingY, out, hull, bounds)
    for (let y = 0; y < size; y += 1) grid[y * size + x] = out[y]!
  }
  for (let y = 0; y < size; y += 1) {
    line.set(grid.subarray(y * size, (y + 1) * size))
    distanceTransform1d(line, size, spacingX, out, hull, bounds)
    grid.set(out, y * size)
  }
  return grid
}

export function brushSignedDistance(
  paint: Uint8Array,
  width: number,
  height: number,
  size = CELL_PAINT_SIZE
): Uint16Array {
  const spacingX = width / size
  const spacingY = height / size
  const toInside = squaredDistanceTo(paint, true, size, spacingX, spacingY)
  const toOutside = squaredDistanceTo(paint, false, size, spacingX, spacingY)
  const field = new Uint16Array(size * size)
  for (let index = 0; index < field.length; index += 1) {
    const distance =
      paint[index] !== 0
        ? -Math.sqrt(toOutside[index]!)
        : Math.sqrt(toInside[index]!)
    field[index] = THREE.DataUtils.toHalfFloat(
      Math.max(-MAX_BRUSH_DISTANCE, Math.min(MAX_BRUSH_DISTANCE, distance))
    )
  }
  return field
}

export class LayerMaskNode {
  private readonly center = uniform(new THREE.Vector2(0, 0))
  private readonly size = uniform(new THREE.Vector2(0.5, 0.5))
  private readonly rotationCos = uniform(1)
  private readonly rotationSin = uniform(0)
  private readonly feather = uniform(0.01)
  private readonly aspect = uniform(new THREE.Vector2(1, 1))
  private readonly paintAspect = uniform(new THREE.Vector2(1, 1))
  private paintTexture: THREE.DataTexture | null = null
  private paintValue = ""
  private readonly depthPlaceholder = new THREE.Texture()
  private readonly depthNode = texture(
    this.depthPlaceholder,
    vec2(uv().x, float(1).sub(uv().y))
  )
  private readonly hasDepth = uniform(0)
  private shape: LayerMaskShape = "none"
  private scope: LayerMaskScope = "effect"
  private invert = false
  private enabled = true

  update(mask: LayerMaskState | null | undefined): boolean {
    const next = mask ?? DEFAULT_LAYER_MASK
    const structural =
      next.shape !== this.shape ||
      next.scope !== this.scope ||
      next.invert !== this.invert ||
      next.enabled !== this.enabled
    this.shape = next.shape
    this.scope = next.scope
    this.invert = next.invert
    this.enabled = next.enabled
    ;(this.center.value as THREE.Vector2).set(next.center[0], next.center[1])
    ;(this.size.value as THREE.Vector2).set(
      Math.max(MIN_SIZE, Math.abs(next.size[0])),
      Math.max(MIN_SIZE, Math.abs(next.size[1]))
    )
    const radians = (next.rotation * Math.PI) / 180
    this.rotationCos.value = Math.cos(radians)
    this.rotationSin.value = Math.sin(radians)
    this.feather.value = Math.max(0, next.feather)
    if (next.shape === "brush") {
      if (!this.paintTexture) {
        this.paintTexture = new THREE.DataTexture(
          new Uint16Array(CELL_PAINT_SIZE ** 2),
          CELL_PAINT_SIZE,
          CELL_PAINT_SIZE,
          THREE.RedFormat,
          THREE.HalfFloatType
        )
        this.paintTexture.minFilter = THREE.LinearFilter
        this.paintTexture.magFilter = THREE.LinearFilter
        this.paintValue = ""
      }
      if (next.paint !== this.paintValue) {
        const decoded = decodeCellPaintMask(next.paint)
        this.paintTexture.image.data?.set(
          brushSignedDistance(decoded.data, decoded.width, decoded.height)
        )
        this.paintTexture.needsUpdate = true
        ;(this.paintAspect.value as THREE.Vector2).set(
          decoded.width,
          decoded.height
        )
        this.paintValue = next.paint
      }
    }
    return structural
  }

  updateSceneDepth(depth: THREE.Texture | null): void {
    this.depthNode.value = depth ?? this.depthPlaceholder
    this.hasDepth.value = depth ? 1 : 0
  }

  updateLogicalSize(width: number, height: number): void {
    const shorter = Math.max(1, Math.min(width, height))
    ;(this.aspect.value as THREE.Vector2).set(
      Math.max(1, width) / shorter,
      Math.max(1, height) / shorter
    )
  }

  isActive(): boolean {
    return this.enabled && this.shape !== "none"
  }

  coverage(): TSLNode {
    const screen = vec2(uv().x, float(1).sub(uv().y))
    const point = screen.sub(0.5).mul(this.aspect)
    const local = point.sub(this.center)
    const c = this.rotationCos
    const s = this.rotationSin
    const q = vec2(
      local.x.mul(c).add(local.y.mul(s)),
      local.y.mul(c).sub(local.x.mul(s))
    )
    const half = this.size.mul(0.5)
    const softness = max(this.feather, float(0.0005))
    let value: TSLNode
    switch (this.shape) {
      case "linear":
        value = clamp(
          float(0.5).sub(q.x.div(max(this.size.x, float(MIN_SIZE)))),
          0,
          1
        )
        break
      case "radial":
        value = clamp(float(1).sub(length(q.div(half))), 0, 1)
        break
      case "rectangle": {
        const d = abs(q).sub(half)
        const distance = length(max(d, vec2(0))).add(
          min(max(d.x, d.y), float(0))
        )
        value = float(1).sub(smoothstep(softness.negate(), softness, distance))
        break
      }
      case "depth": {
        const depth = float(this.depthNode.r)
        const near = min(this.size.x, this.size.y)
        const far = max(this.size.x, this.size.y)
        const band = smoothstep(near.sub(softness), near.add(softness), depth).mul(
          float(1).sub(smoothstep(far.sub(softness), far.add(softness), depth))
        )
        value = mix(float(1), band, this.hasDepth)
        break
      }
      case "brush": {
        const paint = this.paintTexture
        if (!paint) {
          value = float(0)
          break
        }
        const paintUv = point.div(this.paintAspect).add(0.5)
        const within = clamp(paintUv, 0, 1)
        const overshoot = length(paintUv.sub(within).mul(this.paintAspect))
        const distance = float(texture(paint).sample(within).level(0).r).add(
          overshoot
        )
        value = float(1).sub(smoothstep(softness.negate(), softness, distance))
        break
      }
      default: {
        const ellipseDistance = Fn(() => {
          const p = abs(q).toVar()
          const focal = half.x.mul(half.x).sub(half.y.mul(half.y)).toVar()
          const t = vec2(Math.SQRT1_2, Math.SQRT1_2).toVar()
          for (let index = 0; index < ELLIPSE_DISTANCE_ITERATIONS; index += 1) {
            const cubed = t.mul(t).mul(t)
            const evolute = vec2(
              focal.mul(cubed.x).div(half.x),
              focal.negate().mul(cubed.y).div(half.y)
            ).toVar()
            const toPoint = p.sub(evolute).toVar()
            const scale = length(half.mul(t).sub(evolute)).div(
              max(length(toPoint), float(1e-6))
            )
            const next = clamp(
              toPoint.mul(scale).add(evolute).div(half),
              0,
              1
            ).toVar()
            t.assign(next.div(max(length(next), float(1e-6))))
          }
          const gap = length(p.sub(half.mul(t)))
          return select(length(q.div(half)).lessThan(1), gap.negate(), gap)
        })
        value = float(1).sub(
          smoothstep(softness.negate(), softness, ellipseDistance())
        )
        break
      }
    }
    return this.invert ? float(1).sub(value) : value
  }

  apply(input: TSLNode, composited: TSLNode, role: LayerMaskRole): TSLNode {
    if (!this.isActive()) return composited
    const coverage = this.coverage()
    const compositedAlpha = clamp(float(composited.a), float(0), float(1))
    if (this.scope === "content" && role !== "source") {
      return vec4(composited.rgb, compositedAlpha.mul(coverage))
    }
    const inputAlpha = clamp(float(input.a), float(0), float(1))
    const outputAlpha = mix(inputAlpha, compositedAlpha, coverage)
    const premultiplied = mix(
      input.rgb.mul(inputAlpha),
      composited.rgb.mul(compositedAlpha),
      coverage
    )
    return vec4(
      premultiplied.div(
        select(outputAlpha.greaterThan(0), outputAlpha, float(1))
      ),
      outputAlpha
    )
  }

  dispose(): void {
    this.paintTexture?.dispose()
    this.paintTexture = null
    this.paintValue = ""
    this.depthPlaceholder.dispose()
  }
}
