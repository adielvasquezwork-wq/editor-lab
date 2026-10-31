/**
 * Geometry for the 3D screen-plane layer: a media rectangle placed in front
 * of a perspective camera, tilted by Euler angles. The renderer intersects
 * each pixel's view ray with this plane analytically; this module computes
 * the plane basis on the CPU (and a reference projection for tests).
 *
 * Conventions: camera at the origin looking down -Z, +Y up. The plane's local
 * half-height is 1 and half-width is the media aspect ratio. At zero rotation
 * the plane covers `scale` of the frame height.
 */

export type Vec3 = [number, number, number]

export interface ScreenPlaneParams {
  /** Vertical field of view in degrees. */
  fov: number
  /** Frame fraction offset of the plane center ([-1, 1] spans the frame). */
  offset: [number, number]
  /** Degrees. Applied as Rz * Ry * Rx (tilt, then turn, then roll). */
  rotationX: number
  rotationY: number
  rotationZ: number
  /** Fraction of the frame height covered at zero rotation. */
  scale: number
}

export interface ScreenPlaneBasis {
  /** Plane center in camera space. */
  center: Vec3
  /** Camera-to-plane distance at zero rotation (for depth normalization). */
  distance: number
  normal: Vec3
  /** tan(fov / 2). */
  tanHalfFov: number
  /** Unit vectors along the plane's local X and Y. */
  u: Vec3
  v: Vec3
}

const DEG = Math.PI / 180

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number
) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function rotate(vector: Vec3, rx: number, ry: number, rz: number): Vec3 {
  let [x, y, z] = vector
  // X (tilt)
  let cos = Math.cos(rx)
  let sin = Math.sin(rx)
  ;[y, z] = [y * cos - z * sin, y * sin + z * cos]
  // Y (turn)
  cos = Math.cos(ry)
  sin = Math.sin(ry)
  ;[x, z] = [x * cos + z * sin, -x * sin + z * cos]
  // Z (roll)
  cos = Math.cos(rz)
  sin = Math.sin(rz)
  ;[x, y] = [x * cos - y * sin, x * sin + y * cos]
  return [x, y, z]
}

export function computeScreenPlaneBasis(
  params: ScreenPlaneParams,
  frameAspect: number
): ScreenPlaneBasis {
  const fov = clampNumber(params.fov, 5, 150, 27) * DEG
  const tanHalfFov = Math.tan(fov / 2)
  const scale = clampNumber(params.scale, 0.01, 10, 0.7)
  const aspect =
    frameAspect > 0 && Number.isFinite(frameAspect) ? frameAspect : 1
  // Half-height 1 spans `scale` of the half-frame height at this distance.
  const distance = 1 / (tanHalfFov * scale)
  const halfFrameHeight = distance * tanHalfFov
  const center: Vec3 = [
    clampNumber(params.offset[0], -10, 10, 0) * halfFrameHeight * aspect,
    clampNumber(params.offset[1], -10, 10, 0) * halfFrameHeight,
    -distance,
  ]
  const rx = clampNumber(params.rotationX, -89, 89, 0) * DEG
  const ry = clampNumber(params.rotationY, -89, 89, 0) * DEG
  const rz = clampNumber(params.rotationZ, -360, 360, 0) * DEG

  return {
    center,
    distance,
    normal: rotate([0, 0, 1], rx, ry, rz),
    tanHalfFov,
    u: rotate([1, 0, 0], rx, ry, rz),
    v: rotate([0, 1, 0], rx, ry, rz),
  }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Reference projection of one pixel (ndc in [-1, 1], +y up) onto the plane:
 * local coordinates (lu in [-aspect, aspect], lv in [-1, 1] when inside) and
 * ray distance t. Returns null when the ray misses (parallel or behind).
 */
export function projectToScreenPlane(
  basis: ScreenPlaneBasis,
  frameAspect: number,
  ndcX: number,
  ndcY: number
): { lu: number; lv: number; t: number } | null {
  const ray: Vec3 = [
    ndcX * basis.tanHalfFov * frameAspect,
    ndcY * basis.tanHalfFov,
    -1,
  ]
  const denominator = dot(ray, basis.normal)

  if (Math.abs(denominator) < 1e-6) {
    return null
  }

  const t = dot(basis.center, basis.normal) / denominator

  if (t <= 0) {
    return null
  }

  const local: Vec3 = [
    ray[0] * t - basis.center[0],
    ray[1] * t - basis.center[1],
    ray[2] * t - basis.center[2],
  ]

  return { lu: dot(local, basis.u), lv: dot(local, basis.v), t }
}

/** Plane depth for the scene-depth texture: 0.5 at the plane center, nearer is brighter. */
export function screenPlaneDepth(t: number, distance: number): number {
  return Math.min(1, Math.max(0, (0.5 * distance) / t))
}

/** Converts a 1080p-referenced pixel size to plane-local units. */
export function pxToPlaneUnits(px: number, scale: number): number {
  const safeScale = scale > 0 && Number.isFinite(scale) ? scale : 1
  // Local height 2 spans `scale` x 1080 px at zero rotation.
  return (Math.max(0, px) * 2) / (1080 * safeScale)
}
