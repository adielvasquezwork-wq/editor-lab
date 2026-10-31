// Renders the scene post-process (letterbox) on a flat
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
  const legacy = await run({
    splitTone: {
      balance: 0,
      highlightAmount: 1,
      highlightColor: "#ff00ff",
      shadowAmount: 1,
      shadowColor: "#008080",
    },
    vignette: { amount: 2, inner: 0, outer: 1, roundness: 0 },
  })
  const letterbox = await run({ letterbox: { aspect: 4, color: "#ff0000" } })
  const pillar = await run({ letterbox: { aspect: 1, color: "#0000ff" } })
  const checks = [
    ["defaults keep the post-process inactive", off.active === false],
    [
      "legacy scene vignette / split tone fields are ignored (now layers)",
      legacy.active === false && near(legacy.corner, [128, 128, 128], 0),
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
