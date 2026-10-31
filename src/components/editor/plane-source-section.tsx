"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import { getSeedableMediaDuration } from "@/lib/editor/timeline-duration"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

/** Picks the image or video shown on a Screen Plane layer. */
export function PlaneSourceSection({ layerId }: { layerId: string }) {
  const assetId = useLayerStore(
    (state) =>
      state.layers.find((layer) => layer.id === layerId)?.assetId ?? null
  )
  const asset = useAssetStore((state) =>
    assetId
      ? (state.assets.find((entry) => entry.id === assetId) ?? null)
      : null
  )
  const assets = useAssetStore((state) => state.assets)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reusable = assets.filter(
    (entry) =>
      (entry.kind === "image" || entry.kind === "video") && entry.id !== assetId
  )

  const load = async (file: File) => {
    setError(null)
    const store = useAssetStore.getState()

    try {
      const loaded = await store.loadAsset(file)

      if (!(loaded.kind === "image" || loaded.kind === "video")) {
        store.removeAsset(loaded.id)
        setError("Choose an image or a video file.")
        return
      }

      useLayerStore.getState().setLayerAsset(layerId, loaded.id)
      useTimelineStore
        .getState()
        .seedDurationFromMedia(getSeedableMediaDuration(loaded))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4">
      <Typography className="uppercase" tone="secondary" variant="overline">
        Screen
      </Typography>
      <div className="flex items-center justify-between gap-2">
        <Typography className="truncate" tone="secondary" variant="monoXs">
          {asset ? asset.fileName : "No media yet"}
        </Typography>
        <Button
          onClick={() => inputRef.current?.click()}
          size="compact"
          variant="secondary"
        >
          {asset ? "Replace" : "Choose image or video"}
        </Button>
      </div>
      {reusable.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {reusable.slice(0, 6).map((entry) => (
            <Button
              key={entry.id}
              onClick={() =>
                useLayerStore.getState().setLayerAsset(layerId, entry.id)
              }
              size="compact"
              title={`Use ${entry.fileName}`}
              variant="ghost"
            >
              {entry.kind === "video" ? "▶ " : ""}
              {entry.fileName.length > 18
                ? `${entry.fileName.slice(0, 16)}…`
                : entry.fileName}
            </Button>
          ))}
        </div>
      ) : null}
      <Typography tone="muted" variant="caption">
        For depth of field along the tilted screen, add Focus Blur above this
        layer with Blur From set to Depth.
      </Typography>
      {error ? (
        <Typography tone="secondary" variant="caption">
          {error}
        </Typography>
      ) : null}
      <input
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void load(file)
        }}
        ref={inputRef}
        type="file"
      />
    </section>
  )
}
