import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import {
  planUploads,
  validateDraftPayload,
  validateProjectFilePayload,
} from "@/lib/community/publish"
import { describePublishPlan, saveDraft } from "@/lib/community/publish-client"
import { MAX_ASSET_BYTES, MAX_IMAGE_BYTES } from "@/lib/community/upload-limits"
import { buildViewerAudio } from "@/lib/community/viewer-audio"
import * as analysis from "@/lib/editor/audio/analyze-client"
import { computeEnvelopeSet } from "@/lib/editor/audio/envelope"
import { analyzeSpectrogram } from "@/lib/editor/audio/spectrogram"
import { getBlankProjectFile } from "@/lib/editor/blank-project"
import { getLayerDefinitions } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import { normalizeAssetMimeType } from "@/lib/editor/media-file"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  buildPublishableProjectFile,
  buildViewerProjectState,
  type LabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildRendererFrame } from "@/renderer/contracts"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"

afterEach(() => mock.restore())

function uploadPlan(contentType: string, contentLength = 100) {
  return planUploads({
    draftId: "scn_test",
    requested: [{ contentType, contentLength, sha256: "a".repeat(64) }],
    storedUrls: new Map(),
  })
}

describe("V3 media uploads", () => {
  test.each([
    ["logo.GLB", "application/octet-stream", "model/gltf-binary", "glb"],
    ["logo.glb", "", "model/gltf-binary", "glb"],
    ["logo.gltf", "application/json", "model/gltf+json", "gltf"],
    ["studio.hdr", "application/octet-stream", "image/vnd.radiance", "hdr"],
    ["studio.hdr", "", "image/vnd.radiance", "hdr"],
    ["logo.svg", "", "image/svg+xml", "svg"],
    ["song.wav", "audio/x-wav", "audio/wav", "wav"],
    ["song.mp3", "audio/mp3", "audio/mpeg", "mp3"],
    ["song.flac", "audio/x-flac", "audio/flac", "bin"],
    ["song.opus", "audio/opus", "audio/ogg", "bin"],
    ["song.m4a", "", "audio/mp4", "bin"],
    ["clip.mov", "", "video/quicktime", "mov"],
  ])("normalizes %s (%s) through the upload planner", (fileName, mimeType, expected, extension) => {
    const canonical = normalizeAssetMimeType({ fileName, mimeType })
    expect(canonical).toBe(expected)
    const plan = uploadPlan(canonical)
    if ("error" in plan) throw new Error(plan.error)
    expect(plan.uploads[0]?.contentType).toBe(expected)
    expect(plan.uploads[0]?.key).toEndWith(`.${extension}`)
    expect(plan.signedBytes).toBe(100)
  })

  test("HDR and models use the asset cap while ordinary images retain their cap", () => {
    for (const mime of [
      "image/vnd.radiance",
      "model/gltf-binary",
      "model/gltf+json",
    ]) {
      expect(uploadPlan(mime, MAX_ASSET_BYTES)).toHaveProperty("uploads")
      expect(uploadPlan(mime, MAX_ASSET_BYTES + 1)).toHaveProperty("error")
    }
    for (const mime of ["image/png", "image/svg+xml"]) {
      expect(uploadPlan(mime, MAX_IMAGE_BYTES)).toHaveProperty("uploads")
      expect(uploadPlan(mime, MAX_IMAGE_BYTES + 1)).toHaveProperty("error")
    }
    expect(uploadPlan("image/vnd.radiance", 0)).toHaveProperty("error")
    expect(uploadPlan("application/octet-stream")).toHaveProperty("error")
    expect(uploadPlan("text/html")).toHaveProperty("error")
  })

  test("normalizes existing local HDR metadata before publish preflight", () => {
    const layer = { ...createLayer("model"), environmentAssetId: "hdr" }
    useLayerStore.getState().replaceState([layer], layer.id, null)
    useAssetStore.getState().replaceAssets([
      {
        id: "hdr",
        kind: "environment",
        fileName: "studio.hdr",
        mimeType: "image/vnd.radiance",
        sizeBytes: 8 * 1024 * 1024,
        url: "blob:fixture",
        source: "local",
        status: "ready",
        error: null,
        createdAt: "2026-01-01",
        width: null,
        height: null,
        duration: null,
      },
    ])
    expect(describePublishPlan().problem).toBeNull()
  })

  test("an old GLTF/HDR draft sends canonical MIME types through signed PUTs", async () => {
    const model = await useAssetStore.getState().loadAsset(
      new File(['{"asset":{"version":"2.0"}}'], "scene.gltf", {
        type: "application/json",
      })
    )
    const environment = await useAssetStore.getState().loadAsset(
      new File(["#?RADIANCE\n"], "studio.hdr", {
        type: "application/octet-stream",
      })
    )
    expect(model.mimeType).toBe("model/gltf+json")
    expect(environment.mimeType).toBe("image/vnd.radiance")
    const layer = {
      ...createLayer("model"),
      assetId: model.id,
      environmentAssetId: environment.id,
    }
    useLayerStore.getState().replaceState([layer], layer.id, null)
    // Simulate an autosave created before MIME normalization was added.
    useAssetStore.getState().replaceAssets(
      [model, environment].map((asset) => ({
        ...asset,
        mimeType: "application/octet-stream",
      }))
    )
    const realFetch = globalThis.fetch
    const putTypes: string[] = []
    let savedProject: LabProjectFile | null = null
    spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (...[input, init]: Parameters<typeof fetch>) => {
          const url = String(input)
          if (url.startsWith("blob:")) return realFetch(input, init)
          if (url === "/api/community/drafts") {
            const body = JSON.parse(String(init?.body))
            const plan = planUploads({
              draftId: "scn_fixture",
              requested: body.uploads,
              storedUrls: new Map(),
            })
            if ("error" in plan) throw new Error(plan.error)
            return Response.json({
              draftId: "scn_fixture",
              uploads: plan.uploads.map((upload) => ({
                ...upload,
                uploadUrl: `https://upload.invalid/${upload.key}`,
                publicUrl: `/scenes/default/${upload.key}`,
              })),
            })
          }
          if (url.startsWith("https://upload.invalid/")) {
            putTypes.push(new Headers(init?.headers).get("content-type")!)
            return new Response(null, { status: 200 })
          }
          if (url === "/api/community/drafts/scn_fixture") {
            savedProject = validateDraftPayload(
              JSON.parse(String(init?.body)).projectFile
            ).projectFile
            return Response.json({
              draft: {
                id: "scn_fixture",
                title: "Fixture",
                savedAt: "2026-01-01",
              },
            })
          }
          throw new Error(`Unexpected request: ${url}`)
        },
        { preconnect: realFetch.preconnect }
      )
    )
    const result = await saveDraft({ asNewDraft: true, withThumbnail: false })
    expect(result.skipped).toEqual([])
    expect(putTypes).toEqual(["model/gltf+json", "image/vnd.radiance"])
    expect(savedProject).not.toBeNull()
    expect((savedProject as unknown as LabProjectFile).assets).toHaveLength(2)
    URL.revokeObjectURL(model.url)
    URL.revokeObjectURL(environment.url)
  })
})

function unavailableProject(version = 7) {
  const known = createLayer("gradient")
  const original = {
    ...createLayer("blur"),
    type: "retired-effect",
    name: "Old effect",
    assetId: "original-media",
    params: { amount: 0.72 },
    futureField: { preserve: [1, 2, 3] },
  }
  const raw = {
    ...getBlankProjectFile(),
    version,
    layers: [original, known],
    selectedLayerId: original.id,
    assets: [
      {
        id: "original-media",
        kind: "image",
        fileName: "original.png",
        url: "/scenes/default/original.png",
      },
    ],
    timeline: {
      duration: 10,
      loop: true,
      tracks: [
        {
          id: "original-track",
          layerId: original.id,
          enabled: true,
          binding: { kind: "param", key: "amount" },
          keyframes: [{ id: "key", time: 0, value: 0.5 }],
        },
      ],
    },
  }
  return { original, known, raw, parsed: parseLabProjectFileValue(raw) }
}

describe("project compatibility", () => {
  test("all registered V3 and legacy layer types parse and hydrate", () => {
    for (const definition of getLayerDefinitions()) {
      const file = {
        ...getBlankProjectFile(),
        layers: [createLayer(definition.type)],
      }
      const project = buildViewerProjectState(parseLabProjectFileValue(file))
      expect(project.layers[0]?.type).toBe(definition.type)
    }
  })

  test.each([
    6, 7,
  ])("unknown types in v%i preserve data, assets, and tracks across import/export", (version) => {
    const { parsed, original } = unavailableProject(version)
    expect(parsed.layers[0]?.unavailableLayer).toEqual(original)
    expect(parsed.layers[0]?.visible).toBe(false)
    expect(parsed.layers[0]?.runtimeError).toContain("unavailable")
    applyLabProjectFile(parsed, [])
    const saved = buildLabProjectFile()
    expect(saved.layers[0]?.unavailableLayer).toEqual(original)
    expect(saved.timeline.tracks).toHaveLength(1)
    expect(saved.timeline.tracks[0]).toMatchObject(parsed.timeline.tracks[0]!)
    expect(saved.assets[0]?.id).toBe("original-media")
    expect(saved.layers[0]?.assetId).toBe("original-media")
    const reloaded = parseLabProjectFileValue(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.layers[0]?.unavailableLayer).toEqual(original)
    expect(reloaded.layers[0]?.name).toBe(parsed.layers[0]?.name)
  })

  test("unknown layers are never rendered, even if their visibility is toggled", () => {
    const { parsed, known } = unavailableProject()
    const project = buildViewerProjectState(parsed)
    const frame = buildRendererFrame({
      ...project,
      audio: null,
      layers: project.layers.map((layer) => ({ ...layer, visible: true })),
      delta: 0,
      outputSize: project.composition,
      pixelRatio: 1,
      viewportSize: project.composition,
    })
    expect(frame.layers).toHaveLength(1)
    expect(frame.layers[0]).toHaveProperty("layer.id", known.id)
  })

  test("an unavailable leaf does not consume another group nesting level", () => {
    const { raw, original } = unavailableProject()
    const groups = Array.from({ length: 8 }, (_, index) => ({
      ...createLayer("group"),
      id: `group-${index}`,
      parentId: index > 0 ? `group-${index - 1}` : null,
    }))
    const parsed = parseLabProjectFileValue({
      ...raw,
      layers: [...groups, { ...original, parentId: "group-7" }],
    })
    expect(parsed.layers.at(-1)?.unavailableLayer).toBeDefined()
    applyLabProjectFile(parsed, [])
    expect(buildLabProjectFile().layers).toHaveLength(9)
  })

  test("drafts preserve unavailable layers; publish reports them before pruning", () => {
    const { raw, parsed } = unavailableProject()
    const draft = validateDraftPayload(JSON.stringify(raw))
    expect(JSON.parse(draft.body).layers[0].type).toBe("retired-effect")
    expect(buildPublishableProjectFile(parsed).layers).toHaveLength(2)
    expect(() => validateProjectFilePayload(JSON.stringify(raw))).toThrow(
      "unavailable layer"
    )
    applyLabProjectFile(parsed, [])
    expect(describePublishPlan().problem).toContain("unavailable layer")
  })

  test("malformed known layers and invalid hierarchies still fail validation", () => {
    const { raw, known } = unavailableProject()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, opacity: "broken" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, kind: "effect" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, parentId: "missing" }],
      })
    ).toThrow()
    expect(() =>
      parseLabProjectFileValue({
        ...raw,
        layers: [{ ...known, unavailableLayer: { type: "bad" } }],
      })
    ).toThrow()
    expect(() => parseLabProjectFileValue({ ...raw, version: 999 })).toThrow(
      "version"
    )
  })

  test("a saved placeholder restores when its original type is supported", () => {
    const original = createLayer("blur")
    const file = {
      ...getBlankProjectFile(),
      layers: [
        {
          ...createLayer("group"),
          id: original.id,
          unavailableLayer: original,
        },
      ],
    }
    expect(parseLabProjectFileValue(file).layers[0]?.type).toBe("blur")
    expect(parseLabProjectFileValue(file).layers[0]?.params).toEqual(
      original.params
    )
  })
})

function audioProject(sourceKind: "asset" | "video-layer" = "asset") {
  const layer = { ...createLayer("video"), assetId: "media" }
  const file: LabProjectFile = {
    ...getBlankProjectFile(),
    layers: [layer],
    assets: [
      {
        id: "media",
        fileName: "audio.wav",
        kind: "audio",
        url: "/scenes/default/audio.wav",
      },
    ],
  }
  file.audio = {
    ...getBlankProjectFile().audio!,
    offsetSeconds: 0.5,
    source:
      sourceKind === "asset"
        ? { kind: "asset", assetId: "media" }
        : { kind: "video-layer", layerId: layer.id },
    links: [
      {
        id: "link",
        layerId: layer.id,
        band: "level",
        enabled: true,
        binding: {
          kind: "layer",
          property: "opacity",
          label: "Opacity",
          valueType: "number",
        },
        outMin: 0,
        outMax: 1,
      },
    ],
  }
  return buildViewerProjectState(file)
}

describe("community audio reactivity", () => {
  test.each([
    "asset",
    "video-layer",
  ] as const)("analyzes a %s source with the saved bands, links, and offset", async (kind) => {
    const project = audioProject(kind)
    const samples = Float32Array.from({ length: 22050 }, (_, i) =>
      i < 11025 ? 0 : Math.sin((2 * Math.PI * 440 * i) / 22050)
    )
    const spectrogram = analyzeSpectrogram(samples, 22050)
    const analyze = spyOn(analysis, "analyzeAudioSource").mockResolvedValue(
      spectrogram
    )
    const audio = await buildViewerAudio(project, new AbortController().signal)
    expect(analyze).toHaveBeenCalledWith(
      "/scenes/default/audio.wav",
      expect.anything()
    )
    expect(audio).toEqual({
      envelopes: computeEnvelopeSet(spectrogram, project.audio.bands),
      links: project.audio.links,
      offsetSeconds: 0.5,
    })
    const render = (time: number) =>
      buildRendererFrame({
        ...project,
        audio,
        delta: 0,
        outputSize: project.composition,
        pixelRatio: 1,
        viewportSize: project.composition,
        timeline: { ...project.timeline, currentTime: time },
      })
    expect(render(-0.5).layers).not.toEqual(render(0.4).layers)
  })

  test("skips analysis without active links and tolerates missing or broken media", async () => {
    const analyze = spyOn(analysis, "analyzeAudioSource").mockRejectedValue(
      new Error("404")
    )
    const project = audioProject()
    const signal = new AbortController().signal
    expect(
      await buildViewerAudio({ ...project, assets: [] }, signal)
    ).toBeNull()
    expect(
      await buildViewerAudio(
        { ...project, audio: { ...project.audio, links: [] } },
        signal
      )
    ).toBeNull()
    expect(analyze).not.toHaveBeenCalled()
    expect(await buildViewerAudio(project, signal)).toBeNull()
  })

  test("passes cancellation through instead of treating unmount as a media failure", async () => {
    const controller = new AbortController()
    controller.abort()
    spyOn(analysis, "analyzeAudioSource").mockRejectedValue(
      new DOMException("Aborted", "AbortError")
    )
    await expect(
      buildViewerAudio(audioProject(), controller.signal)
    ).rejects.toThrow("Aborted")
  })
})
