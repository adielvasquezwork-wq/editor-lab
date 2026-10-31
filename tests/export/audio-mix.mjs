// Renders the timeline audio mix in Chromium's OfflineAudioContext and checks
// placement, source offsets, fades and ducking. Run: bun run test:export-audio
import { resolve } from "node:path"
import { chromium } from "playwright"

const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "audio-mix-page.mjs")],
  target: "browser",
})
if (!bundle.success)
  throw new AggregateError(bundle.logs, "Harness failed to bundle")
const script = await bundle.outputs.at(-1).text()
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/page.js")
      return new Response(script, {
        headers: { "Content-Type": "text/javascript" },
      })
    return new Response(
      '<!doctype html><script type="module" src="/page.js"></script>',
      { headers: { "Content-Type": "text/html" } }
    )
  },
})
const browser = await chromium.launch()
let failed = false
try {
  const page = await browser.newPage()
  page.on("pageerror", (e) => {
    failed = true
    console.error(e.message)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`)
  await page.waitForFunction(() => window.ready)
  const r = await page.evaluate(() => window.runMix())
  const duckRatio = r.musicDucked / r.musicFull
  const checks = [
    // Linear 1s fade: RMS gain over the first 0.1s is 0.1/sqrt(3).
    [
      "music fades in linearly",
      Math.abs(r.fadeStart / r.musicFull - 0.1 / Math.sqrt(3)) < 0.002,
    ],
    [
      "music ducks ~-12 dB under dialogue",
      Math.abs(20 * Math.log10(duckRatio) + 12) < 0.5,
    ],
    [
      "music recovers after dialogue",
      Math.abs(r.musicRecovered / r.musicFull - 1) < 0.02,
    ],
    ["dialogue is mixed in", r.mixedDuringVoice > r.musicDucked * 1.5],
    ["silence before clip", r.silenceBefore < 1e-6],
    [
      "clip starts at its source in-point",
      Math.abs(r.sourceAtStart - 3) < 0.01,
    ],
    ["source advances with the timeline", Math.abs(r.sourceLater - 5) < 0.01],
    ["silence after clip", r.silenceAfter < 1e-6],
  ]
  for (const [label, ok] of checks) {
    if (!ok) failed = true
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
  }
  console.log(
    "INFO",
    JSON.stringify({ duckDb: +(20 * Math.log10(duckRatio)).toFixed(2), ...r })
  )
} finally {
  await browser.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
