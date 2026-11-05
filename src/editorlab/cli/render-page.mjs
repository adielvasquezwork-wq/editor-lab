import * as THREE from "three/webgpu"
import { texture as tslTexture, uv, vec2, float } from "three/tsl"
import { createPassNode } from "@/renderer/pass-node-factory"
import { MediaPass } from "@/renderer/media-pass"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import { createLayer } from "@/lib/editor/layers"
import { getBlankSceneConfig } from "@/lib/editor/blank-project"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { stackToLayers } from "@/editorlab/stack/stack-json"
import {
  applyTimeModifiers,
  collectLayerTimeModifiers,
} from "@/editorlab/timing/time-step"

// Browser side of `editorlab render`: the same passes the editor runs
// (plate -> effects bottom to top -> scene grade -> canvas), driven frame
// by frame with explicit times, so the output depends on the time only.

let state = null

window.setup = async ({ width, height, stack }) => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  document.body.append(canvas)
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: false,
    canvas,
  })
  await renderer.init()
  const target = () =>
    new THREE.RenderTarget(width, height, {
      depthBuffer: false,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    })
  const black = new THREE.DataTexture(
    new Float32Array(width * height * 4).map((_, i) => (i % 4 === 3 ? 1 : 0)),
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  black.needsUpdate = true

  const media = new MediaPass("plate")
  media.resize(width, height)
  media.updateLogicalSize(width, height)
  media.updateCompositionRole("source")
  media.updateCompositeMode("filter")
  media.updateBlendMode("normal")
  media.updateOpacity(1)
  media.updateParams({ ...createLayer("image").params, fitMode: "cover" })
  media.flushColorNode()

  // Stack is top-first; passes run bottom-first.
  const { layers, tracks } = stackToLayers(stack)
  const modifiers = collectLayerTimeModifiers(layers)
  const passes = []
  for (const layer of [...layers].reverse()) {
    const pass = createPassNode(layer.id, layer.type)
    pass.resize(width, height)
    pass.updateLogicalSize(width, height)
    pass.updateCompositionRole("effect")
    pass.updateCompositeMode("filter")
    pass.updateBlendMode(layer.blendMode)
    pass.updateOpacity(layer.opacity)
    pass.updateParams(layer.params)
    pass.flushColorNode()
    if (typeof pass.whenCompiled === "function") await pass.whenCompiled()
    passes.push({ layer, pass })
  }

  const post = new ScenePostProcess()
  post.setOutputAspect(width / height)
  const postActive = post.update({
    ...getBlankSceneConfig("dark"),
    ...(stack.scene ?? {}),
  })

  // Final copy into a row-aligned target: WebGPU readback needs 256-byte
  // rows (16 px of RGBA32F), and the canvas itself cannot be read headless.
  const padWidth = Math.ceil(width / 16) * 16
  const blitTarget = new THREE.RenderTarget(padWidth, height, {
    depthBuffer: false,
    generateMipmaps: false,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    type: THREE.FloatType,
  })
  const blitMaterial = new THREE.MeshBasicNodeMaterial()
  blitMaterial.blending = THREE.NoBlending
  // Render targets are stored upside down; the copy flips to display order.
  const blitNode = tslTexture(black, vec2(uv().x, float(1).sub(uv().y)))
  blitMaterial.colorNode = blitNode
  const blitScene = new THREE.Scene()
  // The quad covers only the left `width` columns, so pixels map 1:1.
  const blitMesh = new THREE.Mesh(
    new THREE.PlaneGeometry((2 * width) / padWidth, 2),
    blitMaterial
  )
  blitMesh.position.x = -1 + width / padWidth
  blitMesh.frustumCulled = false
  blitScene.add(blitMesh)
  const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const out2d = document.createElement("canvas")
  out2d.width = width
  out2d.height = height
  const context2d = out2d.getContext("2d", { willReadFrequently: true })

  state = {
    black,
    blitCamera,
    blitNode,
    blitScene,
    blitTarget,
    canvas,
    context2d,
    height,
    layers,
    media,
    modifiers,
    out2d,
    padWidth,
    passes,
    post,
    postActive,
    renderer,
    targets: [target(), target()],
    tracks,
    width,
  }
  return { layers: layers.map((layer) => layer.type) }
}

// Renders the plate at `url` with the stack evaluated at `time` (seconds).
// Returns the frame as a PNG data URL.
window.renderFrame = async ({ url, time, delta }) => {
  const s = state
  await s.media.setMedia({
    height: s.height,
    kind: "image",
    url,
    width: s.width,
  })
  let [a, b] = s.targets
  s.media.render(s.renderer, s.black, a, time, delta, time)

  const evaluated = new Map(
    evaluateTimelineForLayers(s.layers, s.tracks, time).map((e) => [
      e.layerId,
      e,
    ])
  )
  for (const { layer, pass } of s.passes) {
    const layerTime = applyTimeModifiers(time, s.modifiers.get(layer.id))
    const evaluatedAt =
      layerTime === time
        ? evaluated.get(layer.id)
        : evaluateTimelineForLayers([layer], s.tracks, layerTime)[0]
    const params = { ...layer.params, ...(evaluatedAt?.params ?? {}) }
    pass.updateParams(params)
    const opacity = evaluatedAt?.properties?.opacity
    pass.updateOpacity(typeof opacity === "number" ? opacity : layer.opacity)
    const visible = evaluatedAt?.properties?.visible
    if (visible === false || (visible === undefined && !layer.visible)) continue
    pass.render(s.renderer, a.texture, b, layerTime, delta, layerTime)
    ;[a, b] = [b, a]
  }
  if (s.postActive) {
    s.post.render(s.renderer, a.texture, b)
    ;[a, b] = [b, a]
  }
  s.blitNode.value = a.texture
  s.renderer.setRenderTarget(s.blitTarget)
  s.renderer.render(s.blitScene, s.blitCamera)
  const px = await s.renderer.readRenderTargetPixelsAsync(
    s.blitTarget,
    0,
    0,
    s.padWidth,
    s.height
  )
  const image = s.context2d.createImageData(s.width, s.height)
  const encode = (l) => {
    const v = Math.min(1, Math.max(0, l))
    return Math.round(
      (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255
    )
  }
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const src = (y * s.padWidth + x) * 4
      const dst = (y * s.width + x) * 4
      image.data[dst] = encode(px[src])
      image.data[dst + 1] = encode(px[src + 1])
      image.data[dst + 2] = encode(px[src + 2])
      image.data[dst + 3] = 255
    }
  }
  s.context2d.putImageData(image, 0, 0)
  const blob = await new Promise((resolve) =>
    s.out2d.toBlob(resolve, "image/png")
  )
  const buffer = await blob.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

window.ready = true
