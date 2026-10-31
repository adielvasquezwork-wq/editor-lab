// Renders the scene post-process (vignette, letterbox, split tone) on a flat
// gray input in headless WebGPU and checks pixels against expected values.
// Run: bun run test:film
import { resolve } from "node:path"
import { chromium } from "playwright"

const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "post-process-page.mjs")],
  target: "browser",
  define: { "process.env": "{}" },
})
if (!bundle.success)
  throw new AggregateError(bundle.logs, "Harness failed to bundle")
const script = await bundle.outputs.at(-1).text()
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    if (new URL(request.url).pathname === "/page.js")
      return new Response(script, {
        headers: { "Content-Type": "text/javascript" },
      })
    return new Response(
      '<!doctype html><script type="module" src="/page.js"></script>',
      {
        headers: { "Content-Type": "text/html" },
      }
    )
  },
})
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-webgpu",
    "--use-webgpu-adapter=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
})
let failed = false
const near = (a, b, tolerance = 2) =>
  a.every((value, i) => Math.abs(value - b[i]) <= tolerance)
// The harness feeds raw values straight into the post-process, which works in
// linear light like the pipeline: 2 stops = a quarter of the value.
const twoStops = Math.round(128 / 4)
// Linear value of sRGB mid gray (display 0.5), the split-tone pivot.
const pivotGray = Math.round(((0.5 + 0.055) / 1.055) ** 2.4 * 255)
try {
  const page = await browser.newPage()
  page.on("pageerror", (error) => {
    failed = true
    console.error(error.message)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`)
  await page.waitForFunction(() => window.ready)
  const run = (overrides, gray = 128) =>
    page.evaluate(([o, g]) => window.run(o, g), [overrides, gray])

  const off = await run({})
  const vignette = await run({
    vignette: { amount: 2, inner: 0, outer: 1, roundness: 0 },
  })
  const neutral = await run({
    vignette: { amount: 0, inner: 0, outer: 1, roundness: 0 },
  })
  const letterbox = await run({ letterbox: { aspect: 4, color: "#ff0000" } })
  const pillar = await run({ letterbox: { aspect: 1, color: "#0000ff" } })
  const split = {
    balance: 0,
    highlightAmount: 1,
    highlightColor: "#ff00ff",
    shadowAmount: 1,
    shadowColor: "#008080",
  }
  const splitMid = await run({ splitTone: split }, pivotGray)
  const splitDark = await run({ splitTone: split }, 20)
  const splitBright = await run({ splitTone: split }, 220)

  const checks = [
    ["defaults keep the post-process inactive", off.active === false],
    [
      "zero-amount vignette is an exact passthrough",
      near(neutral.corner, [128, 128, 128], 0),
    ],
    ["vignette keeps the center", near(vignette.center, [128, 128, 128], 0)],
    [
      `vignette darkens the corner ~2 stops (${twoStops})`,
      near(vignette.corner, [twoStops, twoStops, twoStops], 3),
    ],
    [
      "4:1 letterbox on 2:1 frame paints top bars",
      near(letterbox.row4, [255, 0, 0], 0) &&
        near(letterbox.edgeMidTop, [255, 0, 0], 0),
    ],
    [
      "letterbox keeps the picture area",
      near(letterbox.center, [128, 128, 128], 0) &&
        near(letterbox.edgeMidLeft, [128, 128, 128], 0),
    ],
    [
      "1:1 target pillarboxes instead",
      near(pillar.edgeMidLeft, [0, 0, 255], 0) &&
        near(pillar.edgeMidTop, [128, 128, 128], 0),
    ],
    [
      "split tone leaves mid gray (pivot) alone",
      near(splitMid.center, [pivotGray, pivotGray, pivotGray], 1),
    ],
    [
      "split tone tints shadows toward teal",
      splitDark.center[0] < 20 &&
        splitDark.center[1] > 20 &&
        splitDark.center[2] > 20,
    ],
    [
      "split tone tints highlights toward magenta",
      splitBright.center[1] < 220 && splitBright.center[0] >= 220,
    ],
  ]
  for (const [label, ok] of checks) {
    if (!ok) failed = true
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
  }
} finally {
  await browser.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
