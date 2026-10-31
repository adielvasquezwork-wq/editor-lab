import * as THREE from "three/webgpu"
import { PlanePass } from "@/renderer/plane-pass"

async function solidPng(width, height, color) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return URL.createObjectURL(
    await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
  )
}

window.run = async (params) => {
  const W = 320
  const H = 180
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const renderer = new THREE.WebGPURenderer({ alpha: false, canvas })
  await renderer.init()
  const background = new Float32Array(W * H * 4)
  for (let i = 0; i < W * H; i++) background.set([0, 0, 1, 1], i * 4)
  const input = new THREE.DataTexture(
    background,
    W,
    H,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType })
  const pass = new PlanePass("plane")
  pass.resize(W, H)
  pass.updateLogicalSize(W, H)
  pass.updateCompositionRole("source")
  pass.updateCompositeMode("filter")
  pass.updateBlendMode("normal")
  pass.updateOpacity(1)
  await pass.setMedia({
    height: 900,
    kind: "image",
    url: await solidPng(1600, 900, "#ff0000"),
    width: 1600,
  })
  pass.updateParams(params)
  pass.flushColorNode()
  pass.render(renderer, input, target, 0, 0)
  const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)
  const depthRT = pass.getOutputSceneDepth() ? pass.depthTarget : null
  const raw = depthRT
    ? await renderer.readRenderTargetPixelsAsync(depthRT, 0, 0, W, H)
    : null
  // Half-float target: decode IEEE 754 binary16 values.
  const half = (bits) => {
    const sign = bits & 0x8000 ? -1 : 1
    const exponent = (bits >> 10) & 0x1f
    const fraction = bits & 0x3ff
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
    if (exponent === 31)
      return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
  }
  const depth = raw ? Array.from(raw, half) : null
  // Pixel reads are bottom-up; (x, y) here use y up from the bottom.
  const at = (buf, x, y) =>
    Array.from(buf.slice((y * W + x) * 4, (y * W + x) * 4 + 3)).map(
      (v) => +v.toFixed(3)
    )
  return {
    center: at(px, W / 2, H / 2),
    corner: at(px, 2, 2),
    depthCenter: depth ? depth[((H / 2) * W + W / 2) * 4] : null,
    depthLeft: depth ? depth[((H / 2) * W + Math.round(W * 0.4)) * 4] : null,
    depthRight: depth ? depth[((H / 2) * W + Math.round(W * 0.6)) * 4] : null,
    depthCorner: depth ? depth[(2 * W + 2) * 4] : null,
    row: Array.from({ length: W }, (_, x) => at(px, x, H / 2)),
  }
}
window.ready = true
