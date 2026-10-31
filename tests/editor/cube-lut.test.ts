import { describe, expect, test } from "bun:test"
import {
  buildLutStrip,
  parseCubeLut,
  sampleCubeLut,
} from "@/lib/editor/cube-lut"

function identityCube(
  n: number,
  transform = (r: number, g: number, b: number) => [r, g, b]
) {
  const lines = ['TITLE "Test"', `LUT_3D_SIZE ${n}`, "# comment"]
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++)
        lines.push(
          transform(r / (n - 1), g / (n - 1), b / (n - 1))
            .map((v) => v.toFixed(6))
            .join(" ")
        )
  return lines.join("\n")
}

describe("parseCubeLut", () => {
  test("parses size, title and entries", () => {
    const lut = parseCubeLut(identityCube(3))
    expect(lut.size).toBe(3)
    expect(lut.title).toBe("Test")
    expect(lut.data.length).toBe(27 * 3)
  })

  test("rejects malformed files", () => {
    expect(() => parseCubeLut("0 0 0")).toThrow(/LUT_3D_SIZE/)
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0")).toThrow(/Expected 8/)
    expect(() => parseCubeLut("LUT_1D_SIZE 4")).toThrow(/1D/)
    expect(() => parseCubeLut("LUT_3D_SIZE 1")).toThrow(/Unsupported/)
  })
})

describe("sampling and strip", () => {
  test("identity LUT samples back its input, trilinearly", () => {
    const lut = parseCubeLut(identityCube(5))
    const [r, g, b] = sampleCubeLut(lut, 0.3, 0.6, 0.85)
    expect(r).toBeCloseTo(0.3, 5)
    expect(g).toBeCloseTo(0.6, 5)
    expect(b).toBeCloseTo(0.85, 5)
  })

  test("strip layout is x = b*N + r, y = g", () => {
    // Output = (r, g, b) inputs, so each pixel encodes its own coordinates.
    const lut = parseCubeLut(identityCube(4))
    const strip = buildLutStrip(lut)
    expect(strip.width).toBe(16)
    expect(strip.height).toBe(4)
    const px = (x: number, y: number) =>
      Array.from(strip.pixels.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 3))
    // r=1/3, g=2/3, b=1 -> x = 3*4 + 1 = 13, y = 2
    expect(px(13, 2)).toEqual([85, 170, 255])
    expect(px(0, 0)).toEqual([0, 0, 0])
  })

  test("large LUTs are resampled to 64", () => {
    const lut = parseCubeLut(identityCube(65, (r, g, b) => [1 - r, g, b]))
    const strip = buildLutStrip(lut)
    expect(strip.size).toBe(64)
    // r index 0 (input 0) -> output 1 - 0 = 1
    expect(strip.pixels[0]).toBe(255)
  })
})
