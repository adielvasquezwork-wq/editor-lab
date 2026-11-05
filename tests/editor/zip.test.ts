import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { frameFileName } from "@/editorlab/export/frame-sink"
import { crc32, MemorySink, ZipWriter } from "@/editorlab/export/zip"

describe("frame file names", () => {
  test("zero-padded index with a sanitised prefix", () => {
    expect(frameFileName("frame", 0)).toBe("frame_0000.png")
    expect(frameFileName("shot 010/take", 37)).toBe("shot_010_take_0037.png")
    expect(frameFileName("", 5)).toBe("frame_0005.png")
    expect(frameFileName("x", 12345)).toBe("x_12345.png")
  })
})

describe("zip writer", () => {
  test("crc32 matches the reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })

  test("writes a valid stored archive that python can verify, byte-identical between runs", async () => {
    const build = async () => {
      const sink = new MemorySink()
      const writer = new ZipWriter(sink)
      await writer.addFile("frame_0000.png", new TextEncoder().encode("first frame"))
      await writer.addFile("frame_0001.png", new Uint8Array([0, 1, 2, 3, 255]))
      const size = await writer.finish()
      const bytes = sink.toBytes()
      expect(bytes.length).toBe(size)
      return bytes
    }
    const a = await build()
    const b = await build()
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    const path = `${import.meta.dir}/../../.context/zip-test.zip`
    await Bun.write(path, a)
    const listing = await $`python3 -I -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); print([ (i.filename, i.file_size, i.compress_type) for i in z.infolist()]); print(z.read('frame_0000.png').decode())" ${path}`
      .quiet()
      .text()
    expect(listing).toContain("None")
    expect(listing).toContain("('frame_0000.png', 11, 0)")
    expect(listing).toContain("('frame_0001.png', 5, 0)")
    expect(listing).toContain("first frame")
  })
})
