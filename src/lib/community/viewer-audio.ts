import { analyzeAudioSource } from "@/lib/editor/audio/analyze-client"
import { computeEnvelopeSet } from "@/lib/editor/audio/envelope"
import type { AudioModulationInput } from "@/lib/editor/audio/links"
import type { ViewerProjectState } from "@/lib/editor/project-file"

/** Silent analysis: reactive visuals use the same envelopes and offset as the editor. */
export async function buildViewerAudio(
  project: ViewerProjectState,
  signal: AbortSignal
): Promise<AudioModulationInput | null> {
  const { source, links, bands, offsetSeconds } = project.audio
  if (!(source && links.some((link) => link.enabled))) return null

  const assetId =
    source.kind === "asset"
      ? source.assetId
      : project.layers.find((layer) => layer.id === source.layerId)?.assetId
  const asset = project.assets.find((entry) => entry.id === assetId)
  if (!asset) return null

  try {
    const spectrogram = await analyzeAudioSource(asset.url, {
      // An unavailable audio file must not strand the viewer on its poster.
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    })
    return {
      envelopes: computeEnvelopeSet(spectrogram, bands),
      links,
      offsetSeconds,
    }
  } catch (error) {
    if (signal.aborted) throw error
    return null
  }
}
