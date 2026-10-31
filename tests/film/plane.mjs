// Renders the 3D screen-plane pass on headless WebGPU and checks coverage,
// compositing over lower layers, stroke and depth output. Run: bun run test:film
import { chromium } from "playwright"
import { resolve } from "node:path"
const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "plane-page.mjs")],
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
const run = (params) => page.evaluate((p) => window.run(p), params)
const flat = {
  cornerRadius: 0,
  fieldOfView: 27,
  offset: [0, 0],
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 0.5,
  strokeWidth: 0,
  strokeColor: "#ffffff",
}
const a = await run(flat)
const b = await run({
  ...flat,
  rotationY: 25,
  strokeWidth: 24,
  cornerRadius: 24,
})
const red = (p) => p[0] > 0.9 && p[1] < 0.1 && p[2] < 0.1
const blue = (p) => p[0] < 0.1 && p[2] > 0.9
const white = (p) => p[0] > 0.8 && p[1] > 0.8 && p[2] > 0.8
// Flat 16:9 media at scale 0.5 on a 16:9 frame spans the middle half horizontally.
const firstRed = a.row.findIndex(red)
const lastRed = a.row.length - 1 - [...a.row].reverse().findIndex(red)
const checks = [
  ["plane centre shows the media", red(a.center)],
  ["outside the plane shows the layers below", blue(a.corner)],
  [
    "flat plane spans half the frame width (scale 0.5)",
    Math.abs(firstRed - 80) <= 2 && Math.abs(lastRed - 239) <= 2,
  ],
  ["depth is 0.5 at the plane centre", Math.abs(a.depthCenter - 0.5) < 0.01],
  ["no scene depth outside the plane", a.depthCorner === 0],
  ["turned plane: nearer side has higher depth", b.depthLeft > b.depthRight],
  ["stroke is drawn at the plane edge", b.row.some(white)],
  [
    "turned plane still shows media and background",
    red(b.center) && blue(b.corner),
  ],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
if (failed)
  console.log(
    "INFO",
    JSON.stringify({
      a: { ...a, row: undefined, firstRed, lastRed },
      b: { ...b, row: undefined },
    })
  )
await browser.close()
server.stop()
process.exit(failed ? 1 : 0)
