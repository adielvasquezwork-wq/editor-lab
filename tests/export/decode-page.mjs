import { openExportVideoFrameSource } from "@/renderer/export-video-decoder"

function draw(source, width, height) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  context.drawImage(source, 0, 0, width, height)
  return context.getImageData(0, 0, width, height).data
}

function meanDiff(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i += 4)
    sum +=
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2])
  return sum / ((a.length / 4) * 3)
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) > 1 / 240) {
    await new Promise((resolve, reject) => {
      video.addEventListener("seeked", resolve, { once: true })
      video.addEventListener("error", reject, { once: true })
      video.currentTime = time
    })
  }
  await new Promise((resolve) => requestAnimationFrame(resolve))
}

async function loadVideo(url) {
  const video = document.createElement("video")
  video.muted = true
  video.preload = "auto"
  video.src = url
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve
    video.onerror = () => reject(new Error(`Could not load ${url}`))
  })
  return video
}

// Compares the frame each path shows against ffmpeg-decoded ground truth.
window.checkAccuracy = async (url, fps, times) => {
  const video = await loadVideo(url)
  const width = video.videoWidth
  const height = video.videoHeight
  const frameBytes = width * height * 4
  const truth = new Uint8Array(await (await fetch(`${url}.rgba`)).arrayBuffer())
  const frameCount = truth.length / frameBytes
  const bestMatch = (pixels, guess) => {
    let best = -1
    let bestDiff = Number.POSITIVE_INFINITY
    for (
      let k = Math.max(0, guess - 4);
      k <= Math.min(frameCount - 1, guess + 4);
      k += 1
    ) {
      const diff = meanDiff(
        pixels,
        truth.subarray(k * frameBytes, (k + 1) * frameBytes)
      )
      if (diff < bestDiff) {
        bestDiff = diff
        best = k
      }
    }
    return [best, bestDiff]
  }
  const source = await openExportVideoFrameSource(url, { height, width })
  if (!source) return { fastPath: false }
  const wrong = []
  let lastPixels = null
  let decodedColorDiff = 0
  let seekColorDiff = 0
  for (const time of times) {
    const expected = Math.min(frameCount - 1, Math.floor(time * fps + 1e-6))
    // null means "same frame as the previous call".
    const frame = await source.frameAt(time)
    if (frame) {
      lastPixels = draw(frame, width, height)
      frame.close()
    }
    const [decodedIndex, decodedDiff] = bestMatch(lastPixels, expected)
    await seekVideo(video, time)
    const [seekIndex, seekDiff] = bestMatch(
      draw(video, width, height),
      expected
    )
    if (decodedIndex !== expected)
      wrong.push(`t=${time.toFixed(3)}: ${expected}->${decodedIndex}`)
    decodedColorDiff = Math.max(decodedColorDiff, decodedDiff)
    if (seekIndex === expected)
      seekColorDiff = Math.max(seekColorDiff, seekDiff)
  }
  source.dispose()
  return { decodedColorDiff, fastPath: true, seekColorDiff, wrong }
}

window.measureSpeed = async (url, times) => {
  const video = await loadVideo(url)
  const source = await openExportVideoFrameSource(url, {
    height: video.videoHeight,
    width: video.videoWidth,
  })
  let started = performance.now()
  for (const time of times) (await source.frameAt(time))?.close()
  const decodeMs = performance.now() - started
  source.dispose()
  started = performance.now()
  for (const time of times) await seekVideo(video, time)
  return { decodeMs, seekMs: performance.now() - started }
}

window.ready = true

// Regression: disposing the texture while it holds a decoded VideoFrame (as
// MediaPass does before disposing the handle) must not throw.
window.checkDisposeWhileDecoded = async (url) => {
  const { createVideoTexture } = await import("@/renderer/media-texture")
  const handle = await createVideoTexture(url)
  await handle.prepareFrame(0.5)
  const holdsFrame =
    typeof VideoFrame !== "undefined" &&
    handle.texture.image instanceof VideoFrame
  try {
    handle.texture.dispose()
    handle.dispose()
    return { holdsFrame, ok: true }
  } catch (error) {
    return { error: String(error?.message ?? error), holdsFrame, ok: false }
  }
}
