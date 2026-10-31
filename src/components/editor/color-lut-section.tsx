"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import { cubeLutToPngFile, parseCubeLut } from "@/lib/editor/cube-lut"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"

/** Loads a .cube LUT into a Color LUT layer (stored as a PNG strip asset). */
export function ColorLutSection({ layerId }: { layerId: string }) {
  const assetId = useLayerStore(
    (state) =>
      state.layers.find((layer) => layer.id === layerId)?.assetId ?? null
  )
  const asset = useAssetStore((state) =>
    assetId
      ? (state.assets.find((entry) => entry.id === assetId) ?? null)
      : null
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (file: File) => {
    setError(null)

    try {
      const lut = parseCubeLut(await file.text())
      const png = await cubeLutToPngFile(lut, file.name)
      const loaded = await useAssetStore
        .getState()
        .loadAsset(png, { kind: "image" })
      useLayerStore.getState().setLayerAsset(layerId, loaded.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4">
      <Typography className="uppercase" tone="secondary" variant="overline">
        LUT
      </Typography>
      <div className="flex items-center justify-between gap-2">
        <Typography tone="secondary" variant="monoXs">
          {asset
            ? asset.fileName.replace(/\.lut\.png$/, ".cube")
            : "No LUT loaded"}
        </Typography>
        <div className="flex gap-1.5">
          <Button
            onClick={() => inputRef.current?.click()}
            size="compact"
            variant="secondary"
          >
            {asset ? "Replace" : "Load .cube"}
          </Button>
          {asset ? (
            <Button
              onClick={() =>
                useLayerStore.getState().setLayerAsset(layerId, null)
              }
              size="compact"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Typography tone="secondary" variant="caption">
          {error}
        </Typography>
      ) : null}
      <input
        accept=".cube"
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
