// Renders the Color LUT pass on headless WebGPU (SwiftShader) and checks LUT
// lookup, intensity and the camera-log decodes. Run: bun run test:film
import { chromium } from "playwright"
import { resolve } from "node:path"
const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "color-lut-page.mjs")],
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
const ident = (n) => {
  const l = [`LUT_3D_SIZE ${n}`]
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++)
        l.push(`${r / (n - 1)} ${g / (n - 1)} ${b / (n - 1)}`)
  return l.join("\n")
}
const inv = (n) => {
  const l = [`LUT_3D_SIZE ${n}`]
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++)
        l.push(`${1 - r / (n - 1)} ${1 - g / (n - 1)} ${1 - b / (n - 1)}`)
  return l.join("\n")
}
const run = (c) => page.evaluate((c) => window.run(c), c)
const p = (intensity, inputTransform = "none") => ({
  intensity,
  inputTransform,
})
const r = {
  noLut: await run({ lut: null, params: p(1), inputCode: 0.5 }),
  identity: await run({ lut: ident(17), params: p(1), inputCode: 0.37 }),
  invert: await run({ lut: inv(17), params: p(1), inputCode: 0.3 }),
  invertHalf: await run({ lut: inv(17), params: p(0.5), inputCode: 0.3 }),
  // Published 18% grey code values for each log curve.
  slog3: await run({ lut: null, params: p(1, "slog3"), inputCode: 420 / 1023 }),
  logc3: await run({ lut: null, params: p(1, "logc3"), inputCode: 0.391007 }),
  vlog: await run({ lut: null, params: p(1, "vlog"), inputCode: 0.423311 }),
}
// Rec.709 OETF of 0.18.
const grey709 = 1.099 * 0.18 ** 0.45 - 0.099
const checks = [
  [
    "no LUT + Display input is a passthrough",
    Math.abs(r.noLut.outCode - 0.5) < 1e-4,
  ],
  [
    "identity LUT is a passthrough within 8-bit precision",
    Math.abs(r.identity.outCode - 0.37) < 2 / 255,
  ],
  [
    "inverting LUT inverts code values",
    Math.abs(r.invert.outCode - 0.7) < 2 / 255,
  ],
  [
    "intensity mixes in code space",
    Math.abs(r.invertHalf.outCode - 0.5) < 2 / 255,
  ],
  [
    "S-Log3 18% grey -> Rec.709 0.409",
    Math.abs(r.slog3.outCode - grey709) < 1e-3,
  ],
  [
    "LogC3 18% grey -> Rec.709 0.409",
    Math.abs(r.logc3.outCode - grey709) < 1e-3,
  ],
  [
    "V-Log 18% grey -> Rec.709 0.409",
    Math.abs(r.vlog.outCode - grey709) < 1e-3,
  ],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
await browser.close()
server.stop()
process.exit(failed ? 1 : 0)
