import * as THREE from "three/webgpu"
import { ColorLutPass } from "@/renderer/color-lut-pass"
import { buildLutStrip, parseCubeLut } from "@/lib/editor/cube-lut"

async function stripUrl(text) {
  const s = buildLutStrip(parseCubeLut(text))
  const c = document.createElement("canvas")
  c.width = s.width
  c.height = s.height
  c.getContext("2d").putImageData(
    new ImageData(s.pixels, s.width, s.height),
    0,
    0
  )
  return URL.createObjectURL(await new Promise((r) => c.toBlob(r, "image/png")))
}
const enc = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)
const dec = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

window.run = async ({ lut, params, inputCode }) => {
  const W = 8
  const H = 8
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const renderer = new THREE.WebGPURenderer({ canvas, alpha: false })
  await renderer.init()
  const lin = dec(inputCode)
  const data = new Float32Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = lin
    data[i * 4 + 1] = lin
    data[i * 4 + 2] = lin
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
  const pass = new ColorLutPass("t")
  pass.resize(W, H)
  pass.updateParams(params)
  if (lut) await pass.setLut(await stripUrl(lut))
  pass.render(renderer, input, target, 0, 0)
  const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)
  return { outCode: enc(px[0]), outLinear: px[0], inLinear: lin }
}
window.ready = true
