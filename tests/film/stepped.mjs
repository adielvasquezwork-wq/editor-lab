// Stepped timing on real video (style refs B4/B5): a layer on threes shows
// each video frame exactly 3 times while a full-rate layer over the same clip
// changes every frame; nested steps and offsets hold as specified.
// Requires ffmpeg. Run: bun run test:film
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { $ } from "bun"
import { chromium } from "playwright"

const root = resolve(import.meta.dir, "../..")
const fixtures = resolve(root, ".context/stepped-test")
await mkdir(fixtures, { recursive: true })
const FPS = 25
const FRAMES = 24
const video = resolve(fixtures, "frame-numbers-25fps.webm")
// Frame k is a flat grey of k*8 (full-range code values), so the rendered
// pixel tells which source frame was shown.
await $`ffmpeg -loglevel error -y -f lavfi -i color=c=black:s=64x64:r=${FPS}:d=1.6 -vf geq=lum='N*8':cb=128:cr=128,format=yuv420p -color_range pc -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:v libvpx-vp9 -lossless 1 -g 50 ${video}`

const bundle = await Bun.build({
  define: { "process.env": "{}" },
  entrypoints: [resolve(import.meta.dir, "stepped-page.mjs")],
  target: "browser",
})
if (!bundle.success) {
  console.error(bundle.logs)
  process.exit(1)
}
const js = await bundle.outputs.at(-1).text()
const server = Bun.serve({
  fetch(req) {
    const path = new URL(req.url).pathname
    if (path === "/p.js")
      return new Response(js, {
        headers: { "content-type": "text/javascript" },
      })
    if (path === "/v.webm") return new Response(Bun.file(video))
    return new Response(
      "<!doctype html><script type=module src=/p.js></script>",
      { headers: { "content-type": "text/html" } }
    )
  },
  hostname: "127.0.0.1",
  port: 0,
})
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-webgpu",
    "--use-webgpu-adapter=swiftshader",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
  ],
})
const page = await browser.newPage()
let failed = false
page.on("pageerror", (error) => {
  failed = true
  console.error(error.message)
})
await page.goto(`http://127.0.0.1:${server.port}/`)
await page.waitForFunction(() => window.ready)
const result = await page.evaluate((input) => window.run(input), {
  fps: FPS,
  frames: FRAMES,
  steps: {
    full: [],
    onThrees: [{ fps: FPS, n: 3, offset: 0 }],
    onFoursOffset1: [{ fps: FPS, n: 4, offset: 1 }],
    nested8in2: [
      { fps: FPS, n: 2, offset: 0 },
      { fps: FPS, n: 8, offset: 0 },
    ],
  },
  url: `http://127.0.0.1:${server.port}/v.webm`,
})
const index = Array.from({ length: FRAMES }, (_, i) => i)
const hold = (n, offset = 0) =>
  index.map((i) => Math.max(0, Math.floor((i - offset) / n) * n + offset))
const same = (a, b) =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i])
const checks = [
  [
    "full-rate layer shows a new video frame every frame",
    same(result.full, index),
  ],
  [
    "layer on 3s holds each video frame exactly 3 frames",
    same(result.onThrees, hold(3)),
  ],
  [
    "offset shifts the cadence (on 4s, offset 1)",
    same(result.onFoursOffset1, hold(4, 1)),
  ],
  [
    "nested steps compose (8 inside a group on 2s)",
    same(result.nested8in2, hold(8)),
  ],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
if (failed) console.log(JSON.stringify(result))
await browser.close()
server.stop()
process.exit(failed ? 1 : 0)
