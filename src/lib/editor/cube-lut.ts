/**
 * Adobe/Resolve `.cube` 3D LUT parsing, and conversion to a 2D "strip"
 * image (N slices of N x N laid out horizontally) so a LUT can be stored and
 * shipped as an ordinary image asset and sampled on the GPU.
 *
 * Strip layout: pixel (x = b * N + r, y = g) holds the output for input
 * (r, g, b) / (N - 1).
 */

export interface CubeLut {
  /** Output RGB triples, red varying fastest, then green, then blue. */
  data: Float32Array
  domainMax: [number, number, number]
  domainMin: [number, number, number]
  size: number
  title: string
}

/** Largest LUT edge stored (64^3 = 4096 x 64 strip). Larger LUTs are resampled. */
export const MAX_STRIP_LUT_SIZE = 64
const MAX_CUBE_SIZE = 256

function parseTriple(parts: string[]): [number, number, number] | null {
  if (parts.length < 3) return null
  const values = parts.slice(0, 3).map(Number)
  return values.every(Number.isFinite)
    ? (values as [number, number, number])
    : null
}

export function parseCubeLut(text: string): CubeLut {
  let size = 0
  let title = ""
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  const values: number[] = []

  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) continue

    const [keyword, ...rest] = line.split(/\s+/)

    switch (keyword?.toUpperCase()) {
      case "TITLE":
        title = line.slice(5).trim().replace(/^"|"$/g, "")
        continue
      case "LUT_3D_SIZE": {
        size = Number.parseInt(rest[0] ?? "", 10)
        if (!(size >= 2 && size <= MAX_CUBE_SIZE)) {
          throw new Error(`Unsupported LUT_3D_SIZE: ${rest[0]}`)
        }
        continue
      }
      case "LUT_1D_SIZE":
        throw new Error("1D LUTs are not supported; export a 3D .cube LUT.")
      case "DOMAIN_MIN":
        domainMin = parseTriple(rest) ?? domainMin
        continue
      case "DOMAIN_MAX":
        domainMax = parseTriple(rest) ?? domainMax
        continue
      default:
        break
    }

    const triple = parseTriple(line.split(/\s+/))

    if (triple) {
      values.push(...triple)
    }
  }

  if (size === 0) {
    throw new Error("Missing LUT_3D_SIZE: not a 3D .cube LUT.")
  }

  const expected = size * size * size * 3

  if (values.length !== expected) {
    throw new Error(
      `Expected ${expected / 3} LUT entries for size ${size}, found ${values.length / 3}.`
    )
  }

  return { data: Float32Array.from(values), domainMax, domainMin, size, title }
}

/** Trilinear sample of the LUT at normalized input (0..1 per channel). */
export function sampleCubeLut(
  lut: CubeLut,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const n = lut.size
  const scale = (value: number, axis: 0 | 1 | 2) => {
    const min = lut.domainMin[axis]
    const max = lut.domainMax[axis]
    const t = max > min ? (value - min) / (max - min) : value
    return Math.min(n - 1, Math.max(0, t * (n - 1)))
  }
  const x = scale(r, 0)
  const y = scale(g, 1)
  const z = scale(b, 2)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const x1 = Math.min(n - 1, x0 + 1)
  const y1 = Math.min(n - 1, y0 + 1)
  const z1 = Math.min(n - 1, z0 + 1)
  const fx = x - x0
  const fy = y - y0
  const fz = z - z0
  const at = (ix: number, iy: number, iz: number, c: number) =>
    lut.data[(ix + iy * n + iz * n * n) * 3 + c] ?? 0
  const out: [number, number, number] = [0, 0, 0]

  for (let c = 0; c < 3; c += 1) {
    const c00 = at(x0, y0, z0, c) * (1 - fx) + at(x1, y0, z0, c) * fx
    const c10 = at(x0, y1, z0, c) * (1 - fx) + at(x1, y1, z0, c) * fx
    const c01 = at(x0, y0, z1, c) * (1 - fx) + at(x1, y0, z1, c) * fx
    const c11 = at(x0, y1, z1, c) * (1 - fx) + at(x1, y1, z1, c) * fx
    const c0 = c00 * (1 - fy) + c10 * fy
    const c1 = c01 * (1 - fy) + c11 * fy
    out[c] = c0 * (1 - fz) + c1 * fz
  }

  return out
}

/** RGBA8 strip pixels (width N*N, height N), resampling LUTs larger than 64. */
export function buildLutStrip(lut: CubeLut): {
  height: number
  pixels: Uint8ClampedArray<ArrayBuffer>
  size: number
  width: number
} {
  const n = Math.min(lut.size, MAX_STRIP_LUT_SIZE)
  const width = n * n
  const pixels = new Uint8ClampedArray(new ArrayBuffer(width * n * 4))
  const resample = n !== lut.size
  const domainOf = (axis: 0 | 1 | 2, index: number) =>
    lut.domainMin[axis] +
    (index / (n - 1)) * (lut.domainMax[axis] - lut.domainMin[axis])

  for (let b = 0; b < n; b += 1) {
    for (let g = 0; g < n; g += 1) {
      for (let r = 0; r < n; r += 1) {
        const rgb = resample
          ? sampleCubeLut(lut, domainOf(0, r), domainOf(1, g), domainOf(2, b))
          : ([0, 1, 2].map(
              (c) => lut.data[(r + g * n + b * n * n) * 3 + c] ?? 0
            ) as [number, number, number])
        const offset = (g * width + b * n + r) * 4
        pixels[offset] = Math.round(rgb[0] * 255)
        pixels[offset + 1] = Math.round(rgb[1] * 255)
        pixels[offset + 2] = Math.round(rgb[2] * 255)
        pixels[offset + 3] = 255
      }
    }
  }

  return { height: n, pixels, size: n, width }
}

/** Encodes a parsed LUT as a PNG strip File (browser only). */
export async function cubeLutToPngFile(
  lut: CubeLut,
  name: string
): Promise<File> {
  const strip = buildLutStrip(lut)
  const canvas = document.createElement("canvas")
  canvas.width = strip.width
  canvas.height = strip.height
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Could not encode the LUT image.")
  }

  context.putImageData(
    new ImageData(strip.pixels, strip.width, strip.height),
    0,
    0
  )
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  )

  if (!blob) {
    throw new Error("Could not encode the LUT image.")
  }

  return new File([blob], `${name.replace(/\.cube$/i, "")}.lut.png`, {
    type: "image/png",
  })
}
