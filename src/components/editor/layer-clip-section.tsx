"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"
import {
  getClipDuration,
  moveClip,
  setClipFades,
  trimClipEnd,
} from "@/lib/editor/clip"
import {
  addClipToLayer,
  getLayerSourceDuration,
  removeClipFromLayer,
  updateLayerClip,
} from "@/lib/editor/clip-editing"
import { applyKenBurns } from "@/lib/editor/presets/ken-burns"
import { formatSrt, parseSubtitles } from "@/lib/editor/subtitles"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import { useProxyStore } from "@/store/proxy-store"

const formatSeconds = (value: number) => `${value.toFixed(2)}s`
const parseSeconds = (raw: string) => Number.parseFloat(raw.replace(/s$/i, ""))

function Row({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
      <Typography tone="secondary" variant="label">
        {label}
      </Typography>
      {children}
    </div>
  )
}

function SecondsInput({
  label,
  min = 0,
  onChange,
  value,
}: {
  label: string
  min?: number
  onChange: (value: number) => void
  value: number
}) {
  return (
    <NumberInput
      aria-label={label}
      formatValue={formatSeconds}
      min={min}
      onChange={(next) => {
        if (Number.isFinite(next)) onChange(next)
      }}
      parseValue={parseSeconds}
      step={0.04}
      value={value}
    />
  )
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ProxyControl({ assetId }: { assetId: string }) {
  const asset = useAssetStore(
    (state) => state.assets.find((entry) => entry.id === assetId) ?? null
  )
  const entry = useProxyStore((state) => state.proxies[assetId])
  const generate = useProxyStore((state) => state.generate)
  const remove = useProxyStore((state) => state.remove)

  if (!asset || asset.kind !== "video") {
    return null
  }

  let control: React.ReactNode

  if (entry?.status === "generating") {
    control = (
      <Button onClick={() => remove(assetId)} size="compact" variant="ghost">
        {Math.round(entry.progress * 100)}% · Cancel
      </Button>
    )
  } else if (entry?.status === "ready") {
    control = (
      <Button
        onClick={() => remove(assetId)}
        size="compact"
        title="Preview uses a 960px proxy; export uses the original"
        variant="ghost"
      >
        Using proxy · Remove
      </Button>
    )
  } else {
    const failed = entry?.status === "error" ? entry.error : null
    control = (
      <Button
        onClick={() => void generate(asset)}
        size="compact"
        title={
          failed
            ? `Last attempt failed: ${failed}`
            : "Transcode a small proxy for smoother preview of heavy footage"
        }
        variant="secondary"
      >
        {failed ? "Retry" : "Generate"}
      </Button>
    )
  }

  return <Row label="Preview proxy">{control}</Row>
}

/** Clip range, fades and (for text layers) subtitles for the selected layer. */
export function LayerClipSection({ layerId }: { layerId: string }) {
  const layer = useLayerStore(
    (state) => state.layers.find((entry) => entry.id === layerId) ?? null
  )
  const setLayerSubtitles = useLayerStore((state) => state.setLayerSubtitles)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!layer || layer.kind === "group") {
    return null
  }

  const clip = layer.clip ?? null
  const hasSource = getLayerSourceDuration(layer) !== null

  const importSubtitles = async (file: File) => {
    const cues = parseSubtitles(await file.text())
    setLayerSubtitles(layerId, cues.length > 0 ? cues : null)
  }

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
      <div className="flex items-center justify-between">
        <Typography className="uppercase" tone="secondary" variant="overline">
          Clip
        </Typography>
        {clip ? (
          <Button
            onClick={() => removeClipFromLayer(layerId)}
            size="compact"
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
      </div>

      {clip ? (
        <>
          <Row label="Start">
            <SecondsInput
              label="Clip start"
              onChange={(start) =>
                updateLayerClip(layerId, (current) => moveClip(current, start))
              }
              value={clip.start}
            />
          </Row>
          <Row label="End">
            <SecondsInput
              label="Clip end"
              onChange={(end) =>
                updateLayerClip(layerId, (current, target) =>
                  trimClipEnd(
                    current,
                    end,
                    getLayerSourceDuration(target),
                    typeof target.params.playbackRate === "number"
                      ? target.params.playbackRate
                      : 1
                  )
                )
              }
              value={clip.end}
            />
          </Row>
          {hasSource ? (
            <Row label="Source in">
              <SecondsInput
                label="Source in-point"
                onChange={(sourceIn) =>
                  updateLayerClip(layerId, (current) => ({
                    ...current,
                    sourceIn: Math.max(0, sourceIn),
                  }))
                }
                value={clip.sourceIn}
              />
            </Row>
          ) : null}
          <Row label="Fade in">
            <SecondsInput
              label="Fade in"
              onChange={(fadeIn) =>
                updateLayerClip(layerId, (current) =>
                  setClipFades(current, fadeIn, current.fadeOut)
                )
              }
              value={clip.fadeIn}
            />
          </Row>
          <Row label="Fade out">
            <SecondsInput
              label="Fade out"
              onChange={(fadeOut) =>
                updateLayerClip(layerId, (current) =>
                  setClipFades(current, current.fadeIn, fadeOut)
                )
              }
              value={clip.fadeOut}
            />
          </Row>
          {layer.type === "video" ? (
            <>
              <Row label="Audio">
                <select
                  aria-label="Clip audio role"
                  className="rounded-[6px] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-1.5 py-1 text-[12px] text-[var(--ds-color-text-secondary)]"
                  onChange={(event) =>
                    updateLayerClip(layerId, (current) => ({
                      ...current,
                      audioRole: event.target.value as NonNullable<
                        typeof current.audioRole
                      >,
                    }))
                  }
                  value={clip.audioRole ?? "ambience"}
                >
                  <option value="ambience">Ambience</option>
                  <option value="dialogue">Dialogue (ducks music)</option>
                  <option value="music">Music</option>
                  <option value="mute">Muted</option>
                </select>
              </Row>
              {clip.audioRole !== "mute" ? (
                <Row label="Volume">
                  <input
                    aria-label="Clip audio volume"
                    max={2}
                    min={0}
                    onChange={(event) => {
                      const volume = Number(event.target.value)
                      updateLayerClip(layerId, (current) => ({
                        ...current,
                        volume,
                      }))
                    }}
                    step={0.01}
                    type="range"
                    value={clip.volume ?? 1}
                  />
                </Row>
              ) : null}
            </>
          ) : null}
          <Typography tone="muted" variant="monoXs">
            Duration {formatSeconds(getClipDuration(clip))}. Overlap two clips
            with fades for a cross-dissolve.
          </Typography>
        </>
      ) : (
        <Button
          onClick={() => addClipToLayer(layerId)}
          size="compact"
          variant="secondary"
        >
          Place on timeline
        </Button>
      )}

      {layer.type === "video" && layer.assetId ? (
        <ProxyControl assetId={layer.assetId} />
      ) : null}

      {layer.type === "image" || layer.type === "video" ? (
        <Row label="Ken Burns">
          <div className="flex gap-1.5">
            <Button
              onClick={() => applyKenBurns(layerId)}
              size="compact"
              title="Slow push-in with a gentle pan across the clip (adds keyframes)"
              variant="secondary"
            >
              In
            </Button>
            <Button
              onClick={() => applyKenBurns(layerId, { reverse: true })}
              size="compact"
              title="Slow pull-out across the clip (adds keyframes)"
              variant="secondary"
            >
              Out
            </Button>
          </div>
        </Row>
      ) : null}

      {layer.type === "text" ? (
        <div className="flex flex-col gap-2">
          <Row label="Subtitles">
            <Typography tone="secondary" variant="monoXs">
              {layer.subtitles ? `${layer.subtitles.length} cues` : "None"}
            </Typography>
          </Row>
          <div className="flex flex-wrap gap-1.5">
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="compact"
              variant="secondary"
            >
              Import SRT/VTT
            </Button>
            {layer.subtitles ? (
              <>
                <Button
                  onClick={() =>
                    downloadText(
                      `${layer.name || "subtitles"}.srt`,
                      formatSrt(layer.subtitles ?? [])
                    )
                  }
                  size="compact"
                  variant="ghost"
                >
                  Export SRT
                </Button>
                <Button
                  onClick={() => setLayerSubtitles(layerId, null)}
                  size="compact"
                  variant="ghost"
                >
                  Clear
                </Button>
              </>
            ) : null}
          </div>
          <input
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void importSubtitles(file)
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>
      ) : null}
    </section>
  )
}
