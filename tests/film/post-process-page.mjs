import * as THREE from "three/webgpu"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
window.run = async (overrides, gray = 128) => {
  const W = 64
  const H = 32
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const renderer = new THREE.WebGPURenderer({ canvas, alpha: false })
  await renderer.init()
  const data = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = gray
    data[i * 4 + 1] = gray
    data[i * 4 + 2] = gray
    data[i * 4 + 3] = 255
  }
  const input = new THREE.DataTexture(data, W, H)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(W, H, { type: THREE.UnsignedByteType })
  const pp = new ScenePostProcess()
  pp.setOutputAspect(W / H)
  const active = pp.update({ ...DEFAULT_SCENE_CONFIG, ...overrides })
  pp.render(renderer, input, target)
  const px = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H)
  const at = (x, y) =>
    Array.from(px.slice((y * W + x) * 4, (y * W + x) * 4 + 3))
  return {
    active,
    center: at(32, 16),
    corner: at(1, 1),
    edgeMidTop: at(32, 0),
    edgeMidLeft: at(0, 16),
    row4: at(32, 4),
  }
}
window.ready = true
