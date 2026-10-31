"use client"

import { create } from "zustand"
import type { EditorAsset } from "@/types/editor"

/**
 * Preview proxies: small, keyframe-dense transcodes of heavy video sources,
 * generated in the browser. Preview renders from the proxy; export always
 * reads the original. Session-only (blob URLs), never saved in projects.
 */

const PROXY_LONG_EDGE = 960
const PROXY_KEYFRAME_SECONDS = 1

export type ProxyEntry =
  | { progress: number; status: "generating" }
  | { status: "ready"; url: string }
  | { error: string; status: "error" }

interface ProxyStoreState {
  enabled: boolean
  proxies: Record<string, ProxyEntry>
  generate: (asset: EditorAsset) => Promise<void>
  remove: (assetId: string) => void
  setEnabled: (enabled: boolean) => void
}

const cancels = new Map<string, () => Promise<void>>()

function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

export const useProxyStore = create<ProxyStoreState>((set, get) => ({
  enabled: true,
  proxies: {},

  async generate(asset) {
    if (
      asset.kind !== "video" ||
      get().proxies[asset.id]?.status === "generating"
    ) {
      return
    }

    const setEntry = (entry: ProxyEntry) =>
      set((state) => ({ proxies: { ...state.proxies, [asset.id]: entry } }))

    setEntry({ progress: 0, status: "generating" })

    try {
      const mediabunny = await import("mediabunny")
      const input = new mediabunny.Input({
        formats: mediabunny.ALL_FORMATS,
        source: new mediabunny.UrlSource(asset.url),
      })
      const track = await input.getPrimaryVideoTrack()

      if (!track) {
        throw new Error("No video track")
      }

      const scale = Math.min(
        1,
        PROXY_LONG_EDGE / Math.max(track.displayWidth, track.displayHeight)
      )
      const target = new mediabunny.BufferTarget()
      const output = new mediabunny.Output({
        format: new mediabunny.WebMOutputFormat(),
        target,
      })
      const conversion = await mediabunny.Conversion.init({
        audio: { discard: true },
        input,
        output,
        video: {
          bitrate: mediabunny.QUALITY_MEDIUM,
          codec: "vp9",
          // Both sides are derived from the source aspect, so fill is exact.
          fit: "fill",
          height: evenDimension(track.displayHeight * scale),
          keyFrameInterval: PROXY_KEYFRAME_SECONDS,
          width: evenDimension(track.displayWidth * scale),
        },
      })

      if (!conversion.isValid) {
        throw new Error("This browser cannot encode a proxy for this file")
      }

      cancels.set(asset.id, () => conversion.cancel())
      conversion.onProgress = (progress) => {
        setEntry({ progress, status: "generating" })
      }
      await conversion.execute()
      input.dispose()

      if (!target.buffer) {
        throw new Error("Proxy encoding produced no data")
      }

      const url = URL.createObjectURL(
        new Blob([target.buffer], { type: "video/webm" })
      )
      setEntry({ status: "ready", url })
    } catch (error) {
      if (get().proxies[asset.id]) {
        setEntry({
          error: error instanceof Error ? error.message : String(error),
          status: "error",
        })
      }
    } finally {
      cancels.delete(asset.id)
    }
  },

  remove(assetId) {
    const entry = get().proxies[assetId]

    void cancels.get(assetId)?.()
    if (entry?.status === "ready") URL.revokeObjectURL(entry.url)

    set((state) => {
      const { [assetId]: _removed, ...rest } = state.proxies
      return { proxies: rest }
    })
  },

  setEnabled(enabled) {
    set({ enabled })
  },
}))

/** Assets with ready proxies swapped in (preview only). */
export function withPreviewProxies(assets: EditorAsset[]): EditorAsset[] {
  const { enabled, proxies } = useProxyStore.getState()

  if (!enabled) {
    return assets
  }

  let changed = false
  const mapped = assets.map((asset) => {
    const entry = proxies[asset.id]

    if (entry?.status !== "ready") {
      return asset
    }

    changed = true
    return { ...asset, url: entry.url }
  })

  return changed ? mapped : assets
}
