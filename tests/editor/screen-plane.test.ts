import { describe, expect, test } from "bun:test"
import {
  computeScreenPlaneBasis,
  projectToScreenPlane,
  pxToPlaneUnits,
  type ScreenPlaneParams,
  screenPlaneDepth,
} from "@/lib/editor/screen-plane"

const flat: ScreenPlaneParams = {
  fov: 27,
  offset: [0, 0],
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 0.5,
}
const ASPECT = 16 / 9

describe("screen plane", () => {
  test("unrotated plane covers `scale` of the frame height, centred", () => {
    const basis = computeScreenPlaneBasis(flat, ASPECT)
    const center = projectToScreenPlane(basis, ASPECT, 0, 0)!
    expect(center.lu).toBeCloseTo(0)
    expect(center.lv).toBeCloseTo(0)
    expect(center.t).toBeCloseTo(basis.distance)
    // Top edge of the plane (lv = 1) sits at ndc y = scale.
    expect(projectToScreenPlane(basis, ASPECT, 0, 0.5)!.lv).toBeCloseTo(1)
    expect(projectToScreenPlane(basis, ASPECT, 0, -0.5)!.lv).toBeCloseTo(-1)
  })

  test("offset moves the plane in frame fractions", () => {
    const basis = computeScreenPlaneBasis(
      { ...flat, offset: [0.5, -0.25] },
      ASPECT
    )
    const hit = projectToScreenPlane(basis, ASPECT, 0.5, -0.25)!
    expect(hit.lu).toBeCloseTo(0)
    expect(hit.lv).toBeCloseTo(0)
  })

  test("basis stays orthonormal under rotation", () => {
    const { normal, u, v } = computeScreenPlaneBasis(
      { ...flat, rotationX: -8, rotationY: 25, rotationZ: 12 },
      ASPECT
    )
    const dot = (a: number[], b: number[]) =>
      a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
    for (const vector of [normal, u, v])
      expect(dot(vector, vector)).toBeCloseTo(1)
    expect(dot(u, v)).toBeCloseTo(0)
    expect(dot(u, normal)).toBeCloseTo(0)
    expect(dot(v, normal)).toBeCloseTo(0)
  })

  test("turning around Y brings one side nearer (perspective)", () => {
    const basis = computeScreenPlaneBasis({ ...flat, rotationY: 25 }, ASPECT)
    const left = projectToScreenPlane(basis, ASPECT, -0.2, 0)!
    const right = projectToScreenPlane(basis, ASPECT, 0.2, 0)!
    // Positive Y rotation turns the plane's right edge away from the camera.
    expect(right.t).toBeGreaterThan(left.t)
    expect(screenPlaneDepth(left.t, basis.distance)).toBeGreaterThan(
      screenPlaneDepth(right.t, basis.distance)
    )
    expect(screenPlaneDepth(basis.distance, basis.distance)).toBeCloseTo(0.5)
  })

  test("rays parallel to or behind the plane miss", () => {
    const edgeOn = computeScreenPlaneBasis({ ...flat, rotationY: 89 }, ASPECT)
    expect(projectToScreenPlane(edgeOn, ASPECT, 0.9, 0)).toBeNull()
  })

  test("pixel sizes convert at the 1080p reference", () => {
    expect(pxToPlaneUnits(540, 1)).toBeCloseTo(1)
    expect(pxToPlaneUnits(24, 0.5)).toBeCloseTo((24 * 2) / 540)
    expect(pxToPlaneUnits(-3, 1)).toBe(0)
  })

  test("garbage params fall back to defaults", () => {
    const basis = computeScreenPlaneBasis(
      {
        fov: Number.NaN,
        offset: [Number.NaN, 0],
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        scale: 0,
      },
      0
    )
    expect(Number.isFinite(basis.distance)).toBe(true)
    expect(basis.center[0]).toBe(0)
  })
})
