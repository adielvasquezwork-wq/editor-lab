import { describe, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  heldSourceIndex,
  listPngFrames,
  parseRenderArgs,
} from "@/editorlab/cli/render"

describe("editorlab render arguments", () => {
  test("parses the required and optional flags", () => {
    const options = parseRenderArgs([
      "--in",
      "in",
      "--stack",
      "s.json",
      "--out",
      "out",
      "--fps",
      "25",
      "--time-step",
      "3",
      "--start",
      "12",
      "--frames",
      "4",
      "--software",
    ])
    expect(options.inDir.endsWith("/in")).toBe(true)
    expect(options.stackPath.endsWith("/s.json")).toBe(true)
    expect(options).toMatchObject({
      fps: 25,
      frames: 4,
      software: true,
      start: 12,
      timeStep: 3,
    })
  })

  test("missing flags and bad numbers are errors", () => {
    expect(() => parseRenderArgs(["--in", "in"])).toThrow(/Usage/)
    expect(() =>
      parseRenderArgs([
        "--in",
        "in",
        "--stack",
        "s",
        "--out",
        "o",
        "--fps",
        "x",
      ])
    ).toThrow(/--fps/)
    const plain = parseRenderArgs(["--in", "in", "--stack", "s", "--out", "o"])
    expect("fps" in plain).toBe(false)
    expect(plain.software).toBe(false)
  })
})

describe("held frames", () => {
  test("stepping on n holds n frames and starts each hold on a multiple of n", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => heldSourceIndex(i, 3))).toEqual([
      0, 0, 0, 3, 3, 3, 6,
    ])
    expect([0, 1, 2].map((i) => heldSourceIndex(i, undefined))).toEqual([
      0, 1, 2,
    ])
    expect([0, 1, 2].map((i) => heldSourceIndex(i, 1))).toEqual([0, 1, 2])
  })
})

describe("input listing", () => {
  test("lists PNGs in frame order, ignoring other files", async () => {
    const dir = resolve(import.meta.dir, "../../.context/render-cli-list")
    await rm(dir, { force: true, recursive: true })
    await mkdir(dir, { recursive: true })
    for (const name of [
      "plate_0010.png",
      "plate_0002.png",
      "plate_0001.png",
      "notes.txt",
      "plate_0100.PNG",
    ]) {
      await writeFile(resolve(dir, name), "")
    }
    expect(await listPngFrames(dir)).toEqual([
      "plate_0001.png",
      "plate_0002.png",
      "plate_0010.png",
      "plate_0100.PNG",
    ])
  })
})
