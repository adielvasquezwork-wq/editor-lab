import { analyzeAudioSource } from "@/lib/editor/audio/analyze-client"
import { computeEnvelopeSet } from "@/lib/editor/audio/envelope"
import type { AudioModulationInput } from "@/lib/editor/audio/links"
import type { ViewerProjectState } from "@/lib/editor/project-file"

/** Silent analysis: reactive visuals use the same envelopes and offset as the editor. */
export async function buildViewerAudio(
  project: ViewerProjectState,
  signal: AbortSignal
): Promise<AudioModulationInput | null> {
  const { source, links, bands, offsetSeconds } = project.audioSnapshot
  if (!(source && links.some((link) => link.enabled))) return null

  const assetId =
    source.kind === "asset"
      ? source.assetId
      : project.layers.find((layer) => layer.id === source.layerId)?.assetId
  const asset = project.assets.find((entry) => entry.id === assetId)
  if (!asset) return null

  signal.throwIfAborted()
  const analysisSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)])
  let onAbort: () => void = () => undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(analysisSignal.reason)
    analysisSignal.addEventListener("abort", onAbort, { once: true })
    if (analysisSignal.aborted) onAbort()
  })

  try {
    // decodeAudioData cannot be interrupted. Stop waiting at the deadline even
    // if decoding is still running; the signal also cancels fetch/worker work.
    const spectrogram = await Promise.race([
      analyzeAudioSource(asset.url, { signal: analysisSignal }),
      cancelled,
    ])
    return {
      envelopes: computeEnvelopeSet(spectrogram, bands),
      links,
      offsetSeconds,
    }
  } catch (error) {
    if (signal.aborted) throw error
    return null
  } finally {
    analysisSignal.removeEventListener("abort", onAbort)
  }
}
