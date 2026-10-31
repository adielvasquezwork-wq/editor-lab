// Renders the Editor Lab effects (vignette, split tone, exposure) on
// headless WebGPU (SwiftShader) and checks their behaviour. Run: bun run test:film
import { chromium } from "playwright"
import { resolve } from "node:path"
const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "effects-page.mjs")],
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
const run = (type, params, rgb = [128, 128, 128], size = {}) =>
  page.evaluate((input) => window.run(input), { params, rgb, type, ...size })
const near = (a, b, eps = 2) => a.every((v, i) => Math.abs(v - b[i]) <= eps)
const grey = (v) => [v, v, v]
// Display code of a linear value scaled by 2^-stops (sRGB transfer).
const dec = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const enc = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)
const stops = (code, s) => Math.round(enc(dec(code / 255) * 2 ** s) * 255)

const vig = (params) => ({
  amount: 2,
  center: [0, 0],
  color: "#000000",
  linearLight: true,
  radius: 0,
  roundness: 0,
  softness: 1,
  squareness: 0,
  ...params,
})
const r = {
  vigOff: await run("vignette", vig({ amount: 0 })),
  vig: await run("vignette", vig({})),
  vigDisplay: await run("vignette", vig({ linearLight: false })),
  vigWhite: await run("vignette", vig({ color: "#ffffff" })),
  vigOval: await run(
    "vignette",
    vig({ radius: 0.5, softness: 0.5, squareness: 0 })
  ),
  vigSquare: await run(
    "vignette",
    vig({ radius: 0.5, softness: 0.5, squareness: 1 })
  ),
  vigCircle: await run(
    "vignette",
    vig({ radius: 0.5, softness: 0.3, roundness: 1 })
  ),
  vigShifted: await run(
    "vignette",
    vig({ center: [0.5, 0], radius: 0.2, softness: 0.4 })
  ),
  splitOff: await run("split-tone", {
    balance: 0,
    highlightHue: 35,
    highlightSaturation: 0,
    shadowHue: 195,
    shadowSaturation: 0,
  }),
  splitDark: await run(
    "split-tone",
    {
      balance: 0,
      highlightHue: 300,
      highlightSaturation: 1,
      shadowHue: 180,
      shadowSaturation: 1,
    },
    [40, 40, 40]
  ),
  splitBright: await run(
    "split-tone",
    {
      balance: 0,
      highlightHue: 300,
      highlightSaturation: 1,
      shadowHue: 180,
      shadowSaturation: 1,
    },
    [215, 215, 215]
  ),
  splitMid: await run(
    "split-tone",
    {
      balance: 0,
      highlightHue: 300,
      highlightSaturation: 1,
      shadowHue: 180,
      shadowSaturation: 1,
    },
    [128, 128, 128]
  ),
  expZero: await run("exposure", { stops: 0 }, [90, 140, 200]),
  expDown: await run("exposure", { stops: -2 }, [128, 128, 128]),
  expUp: await run("exposure", { stops: 1 }, [64, 64, 64]),
}
const luma = ([red, green, blue]) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue
const checks = [
  [
    "vignette amount 0 is a passthrough",
    near(r.vigOff.corner, grey(128), 1) && near(r.vigOff.center, grey(128), 1),
  ],
  ["vignette keeps the centre", near(r.vig.center, grey(128), 1)],
  [
    `vignette darkens the corner by its stops (~${stops(128, -2)})`,
    near(r.vig.corner, grey(stops(128, -2)), 3),
  ],
  [
    "display-space mode darkens harder than linear light",
    r.vigDisplay.corner[0] < r.vig.corner[0] - 10,
  ],
  [
    "vignette colour: white fades the edges to white",
    r.vigWhite.corner[0] > 200 && near(r.vigWhite.center, grey(128), 1),
  ],
  [
    "squareness darkens the edge midpoints more (rounded rectangle)",
    r.vigSquare.edgeLeft[0] < r.vigOval.edgeLeft[0] - 5,
  ],
  [
    "roundness 1 (circle): on 16:9 the side edges darken, the top edge stays clear",
    r.vigCircle.edgeLeft[0] < r.vigCircle.edgeTop[0] - 20,
  ],
  [
    "center offset moves the clear area",
    r.vigShifted.offCenter[0] > r.vigShifted.edgeLeft[0] + 20,
  ],
  [
    "split tone at zero saturation is a passthrough",
    near(r.splitOff.center, grey(128), 1),
  ],
  [
    "split tone tints shadows toward the shadow hue (teal)",
    r.splitDark.center[0] < r.splitDark.center[1] &&
      r.splitDark.center[0] < r.splitDark.center[2],
  ],
  [
    "split tone tints highlights toward the highlight hue (magenta)",
    r.splitBright.center[1] < r.splitBright.center[0] &&
      r.splitBright.center[1] < r.splitBright.center[2],
  ],
  [
    "split tone keeps brightness (luma within 3)",
    Math.abs(luma(r.splitDark.center) - 40) < 3 &&
      Math.abs(luma(r.splitBright.center) - 215) < 3,
  ],
  [
    "split tone leaves the pivot (mid grey) neutral",
    near(r.splitMid.center, grey(128), 2),
  ],
  ["exposure 0 is a passthrough", near(r.expZero.center, [90, 140, 200], 1)],
  [
    `exposure -2 stops (~${stops(128, -2)})`,
    near(r.expDown.center, grey(stops(128, -2)), 2),
  ],
  [
    `exposure +1 stop (~${stops(64, 1)})`,
    near(r.expUp.center, grey(stops(64, 1)), 2),
  ],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
if (failed) console.log(JSON.stringify(r))
await browser.close()
server.stop()
process.exit(failed ? 1 : 0)
