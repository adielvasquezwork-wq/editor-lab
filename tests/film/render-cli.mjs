// `editorlab render` end to end (handoff T12): a generated PNG sequence
// through a stack with keyframes, a seeded effect and stepped timing, on
// headless WebGPU (SwiftShader). Checks the effects apply, held frames are
// byte copies, and two runs are byte-identical. Requires ffmpeg.
// Run: bun run test:film
import { mkdir, readdir, readFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { $ } from "bun"

const root = resolve(import.meta.dir, "../..")
const work = resolve(root, ".context/render-cli-test")
await rm(work, { force: true, recursive: true })
await mkdir(resolve(work, "in"), { recursive: true })
await $`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=64x36:rate=24 -frames:v 40 ${work}/in/plate_%04d.png`

const stack = {
  format: "editorlab-stack",
  fps: 24,
  layers: [
    { id: "light-leak", params: { progress: 0.5, seed: 3 } },
    {
      id: "exposure",
      keys: {
        stops: [
          { t: 0, v: 0 },
          { easing: "linear", t: 5 / 24, v: -2 },
        ],
      },
    },
    { id: "vignette", params: { amount: 3, radius: 0.1, softness: 0.6 } },
  ],
  version: 1,
}
await Bun.write(resolve(work, "stack.json"), JSON.stringify(stack))
await Bun.write(
  resolve(work, "identity.json"),
  JSON.stringify({ format: "editorlab-stack", layers: [], version: 1 })
)

const cli = (args) =>
  $`bun ${resolve(root, "scripts/editorlab.ts")} render ${args} --software`
    .cwd(root)
    .quiet()

const outA = resolve(work, "a")
const outB = resolve(work, "b")
const outHeld = resolve(work, "held")
const outId = resolve(work, "identity")
const stackPath = resolve(work, "stack.json")
const identityPath = resolve(work, "identity.json")
const inDir = resolve(work, "in")
const resultA = JSON.parse(
  (
    await cli(["--in", inDir, "--stack", stackPath, "--out", outA])
  ).stdout.toString()
)
await cli(["--in", inDir, "--stack", stackPath, "--out", outB])
const resultHeld = JSON.parse(
  (
    await cli([
      "--in",
      inDir,
      "--stack",
      stackPath,
      "--out",
      outHeld,
      "--time-step",
      "3",
    ])
  ).stdout.toString()
)
await cli(["--in", inDir, "--stack", identityPath, "--out", outId])

const files = (await readdir(outA)).sort()
const bytes = async (dir, name) => readFile(resolve(dir, name))
const stats = async (path) => {
  const text =
    await $`python3 -I -c "from PIL import Image, ImageStat; im=Image.open('${path}').convert('RGB'); s=ImageStat.Stat(im); print(','.join(str(round(m,2)) for m in s.mean)); print(im.getpixel((1,1))); print(im.getpixel((32,18)))"`
      .quiet()
      .text()
  const [mean, corner, centre] = text.trim().split("\n")
  return {
    centre: JSON.parse(centre.replace("(", "[").replace(")", "]")),
    corner: JSON.parse(corner.replace("(", "[").replace(")", "]")),
    mean: mean.split(",").map(Number),
  }
}
const sum = (rgb) => rgb[0] + rgb[1] + rgb[2]
const inStats = await stats(resolve(inDir, "plate_0001.png"))
const frame0 = await stats(resolve(outA, "plate_0000.png"))
const frame5 = await stats(resolve(outA, "plate_0005.png"))
const identity0 = await stats(resolve(outId, "plate_0000.png"))
// A flat grey plate for an exact value check.
await mkdir(resolve(work, "grey"), { recursive: true })
await $`python3 -I -c "from PIL import Image; Image.new('RGB',(64,36),(128,128,128)).save('${work}/grey/grey_0000.png')"`.quiet()
await Bun.write(
  resolve(work, "grey.json"),
  JSON.stringify({
    format: "editorlab-stack",
    layers: [{ id: "exposure", params: { stops: -3 } }],
    version: 1,
  })
)
await cli([
  "--in",
  resolve(work, "grey"),
  "--stack",
  resolve(work, "grey.json"),
  "--out",
  resolve(work, "grey-out"),
])
const grey = await stats(resolve(work, "grey-out/grey_0000.png"))
// Frames rendered out of order and in isolation must match the sequential run.
for (const start of [37, 12, 37]) {
  await cli([
    "--in",
    inDir,
    "--stack",
    stackPath,
    "--out",
    resolve(work, `solo-${start}`),
    "--start",
    String(start),
    "--frames",
    "1",
  ])
}
const same = async (dirA, dirB, name) =>
  Buffer.compare(await bytes(dirA, name), await bytes(dirB, name)) === 0

let failed = false
const checks = [
  [
    "renders one PNG per input frame, numbered from 0",
    files.length === 40 &&
      files[0] === "plate_0000.png" &&
      files[39] === "plate_0039.png" &&
      resultA.rendered === 40,
  ],
  [
    "an empty stack reproduces the plate (mean within 1 level)",
    identity0.mean.every((v, i) => Math.abs(v - inStats.mean[i]) < 1) &&
      identity0.corner.join() === inStats.corner.join(),
  ],
  [
    "the vignette darkens the corner (amount 3 at radius 0.1)",
    sum(frame0.corner) < sum(inStats.corner) * 0.5,
  ],
  [
    "exposure keyframes 0 → -2 stops darken frame 5 against frame 0",
    sum(frame5.mean) < sum(frame0.mean) * 0.9,
  ],
  [
    "exposure -3 on flat grey 128 gives 46 (sRGB in, linear maths, sRGB out)",
    Math.abs(grey.centre[0] - 46) <= 1 && Math.abs(grey.corner[1] - 46) <= 1,
  ],
  [
    "frames 37 and 12 rendered in isolation match the sequential run",
    (await same(outA, resolve(work, "solo-37"), "plate_0037.png")) &&
      (await same(outA, resolve(work, "solo-12"), "plate_0012.png")),
  ],
  [
    "two runs are byte-identical",
    (await Promise.all(files.map((name) => same(outA, outB, name)))).every(
      Boolean
    ),
  ],
  [
    "--time-step 3 renders every third frame and copies the held ones",
    resultHeld.rendered === 14 &&
      Buffer.compare(
        await bytes(outHeld, "plate_0000.png"),
        await bytes(outHeld, "plate_0001.png")
      ) === 0 &&
      Buffer.compare(
        await bytes(outHeld, "plate_0000.png"),
        await bytes(outHeld, "plate_0002.png")
      ) === 0 &&
      Buffer.compare(
        await bytes(outHeld, "plate_0000.png"),
        await bytes(outHeld, "plate_0003.png")
      ) !== 0,
  ],
  [
    "held frames equal the full-rate render of the frame they hold",
    (await same(outHeld, outA, "plate_0000.png")) &&
      (await same(outHeld, outA, "plate_0003.png")),
  ],
]
for (const [label, ok] of checks) {
  if (!ok) failed = true
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`)
}
if (failed)
  console.log(
    JSON.stringify({ frame0, frame5, identity0, inStats, resultA, resultHeld })
  )
process.exit(failed ? 1 : 0)
