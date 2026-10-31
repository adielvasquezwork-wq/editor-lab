// Verifies the WebCodecs export decoder (src/renderer/export-video-decoder.ts)
// picks exactly the frame the <video> element would show, with matching color,
// and reports its speed against the legacy per-frame seek.
//
// Requires ffmpeg (fixtures and ground truth are generated) and the
// preinstalled Playwright Chromium. Run: bun run test:export-decode
import { mkdir } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { $ } from "bun"
import { chromium } from "playwright"

const root = resolve(import.meta.dir, "../..")
const fixtures = resolve(root, ".context/export-test")
await mkdir(fixtures, { recursive: true })

const tagged =
  "-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv".split(
    " "
  )
const fixtureSpecs = [
  // name, testsrc2 size, fps, seconds, codec args (long GOPs on purpose)
  [
    "tagged-25fps.webm",
    "640x360",
    25,
    6,
    [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-g",
      "100",
      ...tagged,
    ],
  ],
  [
    "tagged-24fps.mp4",
    "640x360",
    24,
    5,
    [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-g",
      "96",
      ...tagged,
    ],
  ],
  [
    "untagged-30fps.webm",
    "640x360",
    30,
    3,
    [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-g",
      "90",
    ],
  ],
  [
    "speed-720p.webm",
    "1280x720",
    30,
    11,
    [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-g",
      "120",
      "-b:v",
      "2M",
      ...tagged,
    ],
  ],
]
for (const [name, size, fps, seconds, codec] of fixtureSpecs) {
  const file = resolve(fixtures, name)
  if (!(await Bun.file(file).exists()))
    await $`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=${size}:rate=${fps} -t ${seconds} -vf format=yuv420p ${codec} ${file}`
  if (!(await Bun.file(`${file}.rgba`).exists()))
    await $`ffmpeg -loglevel error -y -i ${file} -f rawvideo -pix_fmt rgba ${file}.rgba`
}

const bundle = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "decode-page.mjs")],
  target: "browser",
})
if (!bundle.success)
  throw new AggregateError(bundle.logs, "Harness failed to bundle")
const script = await bundle.outputs.at(-1).text()

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/")
      return new Response(
        '<!doctype html><script type="module" src="/page.js"></script>',
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    if (path === "/page.js")
      return new Response(script, {
        headers: { "Content-Type": "text/javascript" },
      })
    const file = resolve(fixtures, `.${path}`)
    if (
      !(file.startsWith(`${fixtures}${sep}`) && (await Bun.file(file).exists()))
    )
      return new Response("Not found", { status: 404 })
    return new Response(Bun.file(file))
  },
})

const frames = (fps, seconds, start = 0) =>
  Array.from({ length: Math.round(seconds * fps) }, (_, i) => start + i / fps)

let failed = false
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  page.setDefaultTimeout(300_000)
  page.on("pageerror", (error) => {
    failed = true
    console.error("page error:", error.message)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`)
  await page.waitForFunction(() => window.ready)

  const cases = [
    ["30fps export of 25fps source", "/tagged-25fps.webm", 25, frames(30, 5.9)],
    [
      "loop wrap (backwards jump)",
      "/tagged-25fps.webm",
      25,
      [...frames(25, 3, 2), ...frames(25, 2, 0.5)],
    ],
    ["60fps export of 24fps source", "/tagged-24fps.mp4", 24, frames(60, 4.9)],
    [
      "random access",
      "/tagged-24fps.mp4",
      24,
      [0, 4.2, 0.3, 2.9, 2.95, 1, 4.95],
    ],
  ]
  for (const [label, url, fps, times] of cases) {
    const result = await page.evaluate(
      ([u, f, t]) => window.checkAccuracy(u, f, t),
      [url, fps, times]
    )
    const ok =
      result.fastPath &&
      result.wrong.length === 0 &&
      result.decodedColorDiff <= result.seekColorDiff + 0.5
    if (!ok) failed = true
    console.log(
      `${ok ? "PASS" : "FAIL"} ${label}: ${times.length} frames, wrong=${result.wrong?.length}, color diff decoded=${result.decodedColorDiff?.toFixed(2)} seek=${result.seekColorDiff?.toFixed(2)}`,
      result.wrong?.slice(0, 5).join(", ") ?? ""
    )
  }

  const untagged = await page.evaluate(
    ([u, f, t]) => window.checkAccuracy(u, f, t),
    ["/untagged-30fps.webm", 30, [0, 1]]
  )
  const fallbackOk = untagged.fastPath === false
  if (!fallbackOk) failed = true
  console.log(
    `${fallbackOk ? "PASS" : "FAIL"} untagged color falls back to seeking`
  )

  const disposal = await page.evaluate(
    (u) => window.checkDisposeWhileDecoded(u),
    "/tagged-25fps.webm"
  )
  const disposalOk = disposal.ok && disposal.holdsFrame
  if (!disposalOk) failed = true
  console.log(
    `${disposalOk ? "PASS" : "FAIL"} disposing a texture that holds a decoded frame`,
    disposal.ok ? "" : (disposal.error ?? ""),
    disposal.holdsFrame ? "" : "(fast path not exercised)"
  )

  const speed = await page.evaluate(
    ([u, t]) => window.measureSpeed(u, t),
    ["/speed-720p.webm", frames(30, 10)]
  )
  console.log(
    `INFO 300 frames of 720p long-GOP: decoder ${Math.round(speed.decodeMs)}ms, seek ${Math.round(speed.seekMs)}ms (${(speed.seekMs / speed.decodeMs).toFixed(1)}x)`
  )
} finally {
  await browser.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
