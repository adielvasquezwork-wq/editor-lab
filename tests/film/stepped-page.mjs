import { applyTimeSteps } from "@/editorlab/timing/time-step"
import { openExportVideoFrameSource } from "@/renderer/export-video-decoder"

// Picks video frames the way export does for a stepped layer: the pipeline
// maps project time through the layer's steps (pass.mapTime) and the media
// pass asks the WebCodecs export decoder for that time. Pixels are read on a
// 2D canvas (video textures crash headless SwiftShader WebGPU).
window.run = async ({ url, fps, frames, steps }) => {
  const canvas = document.createElement("canvas")
  canvas.width = 8
  canvas.height = 8
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const result = {}
  for (const [key, chain] of Object.entries(steps)) {
    const source = await openExportVideoFrameSource(url, {
      height: 64,
      width: 64,
    })
    if (!source) return { error: "export decoder unavailable" }
    let shown = -1
    result[key] = []
    for (let i = 0; i < frames; i++) {
      // null = same frame as the previous call (the texture keeps it).
      const frame = await source.frameAt(applyTimeSteps(i / fps, chain))
      if (frame) {
        context.drawImage(frame, 0, 0, 8, 8)
        frame.close()
        shown = Math.round(context.getImageData(4, 4, 1, 1).data[0] / 8)
      }
      result[key].push(shown)
    }
    source.dispose()
  }
  return result
}
window.ready = true
