/**
 * `editorlab render --in <png dir> --stack <stack.json> --out <png dir>`
 *
 * Stage 2 of the pipeline (handoff T12): applies an effect stack to a PNG
 * sequence with the real Editor Lab passes in headless Chromium (WebGPU),
 * one frame per input PNG, deterministically. Frame i is rendered at
 * t = start + i / fps. With --time-step n only every nth frame renders;
 * the held ones are byte copies.
 */
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"
import { parseEffectStack } from "@/editorlab/stack/stack-json"

export interface RenderCliOptions {
  fps?: number
  frames?: number
  inDir: string
  outDir: string
  software?: boolean
  stackPath: string
  start?: number
  timeStep?: number
}

export function parseRenderArgs(argv: string[]): RenderCliOptions {
  const read = (flag: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const num = (flag: string) => {
    const raw = read(flag)
    if (raw === undefined) return undefined
    const value = Number(raw)
    if (!Number.isFinite(value))
      throw new Error(`${flag} expects a number, got "${raw}".`)
    return value
  }
  const inDir = read("--in")
  const outDir = read("--out")
  const stackPath = read("--stack")
  if (!(inDir && outDir && stackPath)) {
    throw new Error(
      "Usage: editorlab render --in <png dir> --stack <stack.json> --out <png dir> [--fps 24] [--time-step n] [--start 0] [--frames N] [--software]"
    )
  }
  const fps = num("--fps")
  const timeStep = num("--time-step")
  const start = num("--start")
  const frames = num("--frames")
  return {
    inDir: resolve(inDir),
    outDir: resolve(outDir),
    software: argv.includes("--software"),
    stackPath: resolve(stackPath),
    ...(fps !== undefined ? { fps } : {}),
    ...(timeStep !== undefined ? { timeStep } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(frames !== undefined ? { frames } : {}),
  }
}

/** PNG files in a folder, in name order (frame order for `name_0000.png`). */
export async function listPngFrames(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  return entries
    .filter((name) => extname(name).toLowerCase() === ".png")
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
}

/** Source frame index for output frame `index` when stepping on `n`. */
export function heldSourceIndex(
  index: number,
  timeStep: number | undefined
): number {
  const n = timeStep && timeStep >= 2 ? Math.round(timeStep) : 1
  return Math.floor(index / n) * n
}

function pngSize(bytes: Uint8Array): { height: number; width: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new Error("Not a PNG file.")
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { height: view.getUint32(20, false), width: view.getUint32(16, false) }
}

export async function runRender(
  options: RenderCliOptions
): Promise<{ frames: number; rendered: number }> {
  const { chromium } = await import("playwright")
  const stackSource = await Bun.file(options.stackPath).text()
  const stack = parseEffectStack(stackSource)
  const fps = options.fps ?? stack.fps ?? 24
  const names = await listPngFrames(options.inDir)
  if (names.length === 0) throw new Error(`No PNG frames in ${options.inDir}.`)
  const first = new Uint8Array(
    await Bun.file(resolve(options.inDir, names[0]!)).arrayBuffer()
  )
  const size = pngSize(first)
  const startFrame = Math.max(0, Math.round(options.start ?? 0))
  const frameCount = Math.min(
    names.length - startFrame,
    options.frames ?? names.length
  )
  if (frameCount <= 0) throw new Error("No frames to render in that range.")
  await mkdir(options.outDir, { recursive: true })

  const bundle = await Bun.build({
    define: { "process.env": "{}" },
    entrypoints: [resolve(import.meta.dir, "render-page.mjs")],
    target: "browser",
  })
  if (!bundle.success) {
    throw new Error(bundle.logs.map((log) => log.message).join("\n"))
  }
  const js = await bundle.outputs.at(-1)!.text()
  const server = Bun.serve({
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname)
      if (path === "/p.js") {
        return new Response(js, {
          headers: { "content-type": "text/javascript" },
        })
      }
      if (path.startsWith("/in/")) {
        return new Response(Bun.file(resolve(options.inDir, basename(path))))
      }
      return new Response(
        `<!doctype html><body style="margin:0"><script type=module src=/p.js></script>`,
        {
          headers: { "content-type": "text/html" },
        }
      )
    },
    hostname: "127.0.0.1",
    port: 0,
  })
  const browser = await chromium.launch({
    args: options.software
      ? [
          "--enable-unsafe-webgpu",
          "--use-webgpu-adapter=swiftshader",
          "--enable-unsafe-swiftshader",
        ]
      : [
          "--enable-unsafe-webgpu",
          "--ignore-gpu-blocklist",
          "--enable-features=Vulkan",
        ],
  })
  let rendered = 0

  try {
    const page = await browser.newPage({
      viewport: { height: size.height, width: size.width },
    })
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.port}/`)
    await page.waitForFunction(
      () => (window as unknown as { ready?: boolean }).ready
    )
    await page.evaluate(
      (input) =>
        (
          window as unknown as { setup: (i: unknown) => Promise<unknown> }
        ).setup(input),
      { height: size.height, stack, width: size.width }
    )
    let previousSource = -1
    let previousOut = ""

    for (let index = 0; index < frameCount; index += 1) {
      const outName = `${basename(names[startFrame]!, ".png").replace(/_?\d+$/, "") || "frame"}_${String(startFrame + index).padStart(4, "0")}.png`
      const outPath = resolve(options.outDir, outName)
      const source = heldSourceIndex(index, options.timeStep)

      if (source === previousSource && previousOut) {
        await copyFile(previousOut, outPath)
        continue
      }

      const name = names[startFrame + source]!
      const time = (startFrame + source) / fps
      const base64 = await page.evaluate(
        (input) =>
          (
            window as unknown as {
              renderFrame: (i: unknown) => Promise<string>
            }
          ).renderFrame(input),
        {
          delta: index === 0 ? 0 : 1 / fps,
          time,
          url: `/in/${encodeURIComponent(name)}`,
        }
      )
      if (pageErrors.length > 0) {
        throw new Error(
          `Render failed in the browser: ${pageErrors.join("; ")}`
        )
      }
      await writeFile(outPath, Buffer.from(base64, "base64"))
      rendered += 1
      previousSource = source
      previousOut = outPath
      process.stderr.write(`\rframe ${index + 1}/${frameCount}`)
    }
    process.stderr.write("\n")
  } finally {
    await browser.close()
    server.stop()
  }

  return { frames: frameCount, rendered }
}
