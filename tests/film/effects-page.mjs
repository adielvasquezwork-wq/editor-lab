import * as THREE from "three/webgpu"
import { createEditorLabPass } from "@/editorlab/effects/passes"

const dec = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const enc = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)

// Renders one Editor Lab effect over a flat display-space colour and returns
// display code values (0-255) at a few probe points.
window.run = async ({ type, params, rgb, width = 64, height = 36 }) => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const renderer = new THREE.WebGPURenderer({ alpha: false, canvas })
  await renderer.init()
  const data = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const edge = rgb === "edge" ? 0.6 : rgb?.edge
    if (typeof edge === "number") {
      // White left of `edge`, black right of it: a vertical edge to track.
      const v = (i % width) / width < edge ? 1 : 0
      data.set([v, v, v, 1], i * 4)
    } else {
      data.set(
        [dec(rgb[0] / 255), dec(rgb[1] / 255), dec(rgb[2] / 255), 1],
        i * 4
      )
    }
  }
  const input = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const target = new THREE.RenderTarget(width, height, {
    type: THREE.FloatType,
  })
  const pass = createEditorLabPass(type, "t")
  pass.resize(width, height)
  pass.updateLogicalSize(width, height)
  pass.updateParams(params)
  pass.render(renderer, input, target, 0, 0)
  const px = await renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    width,
    height
  )
  renderer.dispose()
  const at = (x, y) => {
    const i = (y * width + x) * 4
    return [0, 1, 2].map((c) => Math.round(enc(Math.max(0, px[i + c])) * 255))
  }
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const row = []
  for (let x = 0; x < width; x++) row.push(at(x, cy))
  // Where the white→black edge sits on the centre row (first dark pixel).
  const edgeAt = row.findIndex((px) => px[1] < 128) / width
  let hash = 2166136261
  for (const v of px)
    hash = Math.imul(hash ^ Math.round(v * 1e4), 16777619) >>> 0
  return {
    edgeAt,
    hash,
    row,
    center: at(cx, cy),
    corner: at(0, 0),
    edgeLeft: at(0, cy),
    edgeTop: at(cx, height - 1),
    nearCorner: at(Math.floor(width * 0.1), Math.floor(height * 0.1)),
    offCenter: at(Math.floor(width * 0.75), cy),
  }
}
window.ready = true
