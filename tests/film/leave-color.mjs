// Renders the Leave Color pass on headless WebGPU (SwiftShader) and checks
// that the target hue survives and everything else goes grey. Run: bun run test:film
import { chromium } from "playwright"
import { resolve } from "node:path"
const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "leave-color-page.mjs")],
  target: "browser",
  define: { "process.env": "{}" },
})
if (!bundle.success) {
  console.error(bundle.logs)
  process.exit(1)
}
const js = await bundle.outputs.at(-1).text()
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    if (new URL(req.url).pathname === "/p.js")
      return new Response(js, {
        headers: { "content-type": "text/javascript" },
      })
    return new Response(
      `<!doctype html><script type=module src=/p.js></script>`,
      { headers: { "content-type": "text/html" } }
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
const page = await browser.newPage()
let failed = false
page.on("pageerror", (e) => {
  failed = true
  console.error(e.message)
})
await page.goto(`http://127.0.0.1:${server.port}/`)
await page.waitForFunction(() => window.ready)
const run = (rgb, params = {}) =>
  page.evaluate((c) => window.run(c), {
    rgb,
    params: {
      color: "#e0262b",
      tolerance: 25,
      softness: 15,
      minChroma: 0.12,
      amount: 1,
      ...params,
    },
  })
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const near = (a, b, eps = 3 / 255) =>
  a.every((v, i) => Math.abs(v - b[i]) < eps)
const grey = (rgb) => [luma(rgb), luma(rgb), luma(rgb)]
const red = [0.878, 0.149, 0.169]
const orangeRed = [0.9, 0.3, 0.15] // ~12 deg from the target hue
const blue = [0.15, 0.3, 0.85]
const green = [0.2, 0.7, 0.3]
const dullRed = [0.52, 0.48, 0.48] // red hue, chroma 0.04 < minChroma / 2
const r = {
  red: await run(red),
  orangeRed: await run(orangeRed),
  blue: await run(blue),
  green: await run(green),
  dullRed: await run(dullRed),
  blueAmount0: await run(blue, { amount: 0 }),
  blueHalf: await run(blue, { amount: 0.5 }),
  blueTarget: await run(blue, { color: "#2650e0" }),
  redWhenBlueTarget: await run(red, { color: "#2650e0" }),
}
const checks = [
  ["target red is kept", near(r.red, red)],
  ["a hue within tolerance is kept", near(r.orangeRed, orangeRed)],
  ["blue goes to its Rec.709 luma", near(r.blue, grey(blue))],
  ["green goes to its Rec.709 luma", near(r.green, grey(green))],
  [
    "low-chroma pixels of the target hue go grey",
    near(r.dullRed, grey(dullRed)),
  ],
  ["amount 0 is a passthrough", near(r.blueAmount0, blue)],
  [
    "amount 0.5 is half desaturated",
    near(
      r.blueHalf,
      blue.map((v, i) => (v + grey(blue)[i]) / 2)
    ),
  ],
  ["the target colour is configurable", near(r.blueTarget, blue)],
  ["red is dropped when keeping blue", near(r.redWhenBlueTarget, grey(red))],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
if (failed) console.log(JSON.stringify(r))
await browser.close()
server.stop()
process.exit(failed ? 1 : 0)
