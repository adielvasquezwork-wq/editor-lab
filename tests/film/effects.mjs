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
// Light leak and lens distortion.
const leak = (params, rgb = [40, 40, 40]) =>
  run(
    "light-leak",
    {
      blend: "screen",
      edge: "right",
      hue: 22,
      hueSpread: 45,
      intensity: 1,
      progress: 0.5,
      seed: 7,
      size: 1,
      ...params,
    },
    rgb
  )
const lens = (params, rgb = { edge: 0.8 }) =>
  run(
    "lens-distortion",
    { center: [0, 0], chromatic: 0, k1: 0, k2: 0, scale: 1, ...params },
    rgb,
    { height: 108, width: 192 }
  )
const sum = (px) => px[0] + px[1] + px[2]
const brightest = (res) => Math.max(...res.row.map(sum))
const brightestPixel = (res) =>
  res.row.reduce((a, px) => (sum(a) > sum(px) ? a : px))
r.leakOff0 = await leak({ progress: 0 })
r.leakOff1 = await leak({ progress: 1 })
r.leakMid = await leak({ progress: 0.5 })
r.leakMidAgain = await leak({ progress: 0.5 })
r.leakSeed = await leak({ progress: 0.5, seed: 8 })
r.leakZero = await leak({ intensity: 0, progress: 0.5 })
r.leakBlue = await leak({ hue: 220, progress: 0.5 })
r.leakAdd = await leak({ blend: "add", progress: 0.5 }, [200, 200, 200])
r.leakScreen = await leak({ blend: "screen", progress: 0.5 }, [200, 200, 200])
r.lensId = await lens({})
r.lensBarrel = await lens({ k1: 0.4 })
r.lensPin = await lens({ k1: -0.08 })
r.lensPinStrong = await lens({ k1: -0.4 })
r.lensZoom = await lens({ scale: 2 }, "edge")
r.lensFringe = await lens({ chromatic: 1, k1: 0.4 })
// Velocity blur on a vertical edge (white left of 0.5, black right).
const vblur = (params) =>
  run(
    "velocity-blur",
    {
      angle: 0,
      gain: 1,
      maxLength: 160,
      shutter: 360,
      source: "manual",
      speed: 0,
      ...params,
    },
    { edge: 0.5 },
    { height: 36, width: 64 }
  )
const transitionWidth = (res) => {
  const greys = res.row.filter((px) => px[1] > 8 && px[1] < 247).length
  return greys
}
r.vbStill = await vblur({ speed: 0 })
r.vbAlong = await vblur({ angle: 0, speed: 16 })
r.vbAcross = await vblur({ angle: 90, speed: 16 })
r.vbAuto = await vblur({ source: "keyframes", velocityX: 16, velocityY: 0 })
r.vbAutoStill = await vblur({ source: "keyframes", velocityX: 0, velocityY: 0 })
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
  [
    "light leak at progress 0 is an exact passthrough",
    r.leakOff0.row.every((px) => near(px, grey(40), 0)),
  ],
  [
    "light leak at progress 1 is an exact passthrough",
    r.leakOff1.row.every((px) => near(px, grey(40), 0)),
  ],
  [
    "light leak at progress 0.5 adds light somewhere on the frame",
    brightest(r.leakMid) > 3 * 40 + 60,
  ],
  [
    "light leak is deterministic (same seed + progress = same pixels)",
    r.leakMid.hash === r.leakMidAgain.hash,
  ],
  [
    "a different seed gives a different leak",
    r.leakMid.hash !== r.leakSeed.hash,
  ],
  [
    "intensity 0 is a passthrough",
    r.leakZero.row.every((px) => near(px, grey(40), 0)),
  ],
  [
    "hue changes the leak colour (22° warm vs 220° blue)",
    brightestPixel(r.leakMid)[0] > brightestPixel(r.leakMid)[2] &&
      brightestPixel(r.leakBlue)[2] > brightestPixel(r.leakBlue)[0],
  ],
  [
    "screen never exceeds white; add is brighter than screen",
    r.leakScreen.row.every((px) => px.every((v) => v <= 255)) &&
      brightest(r.leakAdd) >= brightest(r.leakScreen),
  ],
  [
    "lens distortion with k = 0, scale 1 is a passthrough (edge stays at 0.8)",
    Math.abs(r.lensId.edgeAt - 0.8) < 0.011,
  ],
  [
    "barrel (k1 > 0) pulls the edge toward the centre (0.8 → ~0.71)",
    r.lensBarrel.edgeAt < 0.8 - 0.05 && r.lensBarrel.edgeAt > 0.6,
  ],
  [
    "pincushion (k1 < 0) pushes the edge outward (0.8 → ~0.84)",
    r.lensPin.edgeAt > 0.8 + 0.02 && r.lensPin.edgeAt < 0.95,
  ],
  [
    "strong pincushion stretches but never folds (row is white, then black)",
    (() => {
      const g = r.lensPinStrong.row.map((px) => px[1] > 128)
      const firstDark = g.indexOf(false)
      return firstDark === -1 || g.slice(firstDark).every((white) => !white)
    })(),
  ],
  [
    "edge scale 2 zooms in (the edge moves to 0.7)",
    Math.abs(r.lensZoom.edgeAt - 0.7) < 0.011,
  ],
  [
    "colour fringe separates red and blue at the edge",
    r.lensFringe.row.some((px) => Math.abs(px[0] - px[2]) > 60),
  ],
  [
    "velocity blur at speed 0 is a passthrough (sharp edge)",
    transitionWidth(r.vbStill) <= 1,
  ],
  [
    "a 16 px/f horizontal speed at 360° smears the edge over ~16 px",
    transitionWidth(r.vbAlong) >= 12 && transitionWidth(r.vbAlong) <= 18,
  ],
  [
    "the same speed across the edge (90°) leaves it sharp",
    transitionWidth(r.vbAcross) <= 1,
  ],
  [
    "keyframe mode uses the injected velocity",
    transitionWidth(r.vbAuto) >= 12 && transitionWidth(r.vbAutoStill) <= 1,
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
