import * as THREE from "three/webgpu"
import { LeaveColorPass } from "@/editorlab/passes/leave-color-pass"

const enc = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)
const dec = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

// Renders one flat display-space colour through the pass; returns display rgb.
window.run = async ({ params, rgb }) => {
  const W = 4
  const H = 4
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const renderer = new THREE.WebGPURenderer({ canvas, alpha: false })
  await renderer.init()
  const data = new Float32Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = dec(rgb[0])
    data[i * 4 + 1] = dec(rgb[1])
    data[i * 4 + 2] = dec(rgb[2])
    data[i * 4 + 3] = 1
  }
  const input = new THREE.DataTexture(
    data,
    W,
    H,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.FloatType })
  const pass = new LeaveColorPass("t")
  pass.resize(W, H)
  pass.updateParams(params)
  pass.render(renderer, input, target, 0, 0)
  const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)
  renderer.dispose()
  return [enc(px[0]), enc(px[1]), enc(px[2])]
}
window.ready = true
