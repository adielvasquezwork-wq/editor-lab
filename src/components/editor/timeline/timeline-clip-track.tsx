"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { NumberInput } from "@/components/ui/number-input"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  type LayerClip,
  moveClip,
  trimClipEnd,
  trimClipStart,
} from "@/lib/editor/clip"
import {
  addCaptionLayer,
  addClipToLayer,
  addLowerThird,
  ensureTimelineCoversClips,
  getLayerSourceDuration,
  removeClipFromLayer,
  rippleDeleteLayers,
  splitLayersAt,
} from "@/lib/editor/clip-editing"
import {
  AUDIO_CLIP_ROLES,
  type AudioClip,
  type AudioClipRole,
  DEFAULT_AUDIO_DUCKING,
} from "@/lib/editor/audio-clips"
import { AUDIO_FILE_ACCEPT } from "@/lib/editor/media-file"
import { parseSubtitles } from "@/lib/editor/subtitles"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { EditorLayer } from "@/types/editor"

type ClipDragMode = "move" | "trim-end" | "trim-start"

type ClipTarget = { id: string; kind: "audio" | "layer" }

type ClipDrag = {
  target: ClipTarget
  mode: ClipDragMode
  originClientX: number
  originalClip: LayerClip
  playbackRate: number
  sourceDuration: number | null
  /** Clip edges and playhead (seconds) to snap to. */
  snapTimes: number[]
}

const ROLE_COLORS: Record<AudioClipRole, string> = {
  ambience: "bg-emerald-500/18",
  dialogue: "bg-sky-500/20",
  music: "bg-violet-500/20",
}

const ROW_HEIGHT = 26
const SNAP_PX = 6
const MAX_VISIBLE_ROWS = 4

function getRate(layer: EditorLayer): number {
  const rate = layer.params.playbackRate
  return typeof rate === "number" && rate > 0 ? rate : 1
}

function snap(value: number, targets: number[], secondsPerPx: number): number {
  let best = value
  let bestDistance = SNAP_PX * secondsPerPx

  for (const target of targets) {
    const distance = Math.abs(target - value)

    if (distance < bestDistance) {
      best = target
      bestDistance = distance
    }
  }

  return best
}

/**
 * Clip lanes for the video-editing workflow: one row per layer that has a
 * clip. Drag a bar to move it, drag its edges to trim, B splits at the
 * playhead, Shift+Delete ripple-deletes.
 */
export function TimelineClipTrack({ duration }: { duration: number }) {
  const layers = useLayerStore((state) => state.layers)
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const currentTime = useTimelineStore((state) => state.currentTime)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<ClipDrag | null>(null)
  const audioClips = useAudioStore((state) => state.clips)
  const ducking = useAudioStore((state) => state.ducking)
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const audioFileRef = useRef<HTMLInputElement | null>(null)
  const captionFileRef = useRef<HTMLInputElement | null>(null)
  const selectedAudio =
    audioClips.find((clip) => clip.id === selectedAudioId) ?? null

  const clipLayers = layers.filter(
    (layer): layer is EditorLayer & { clip: LayerClip } =>
      Boolean(layer.clip) && layer.kind !== "group"
  )
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId)
  const canAddClip =
    selectedLayer !== undefined &&
    selectedLayer.kind !== "group" &&
    !selectedLayer.clip
  const safeDuration = Math.max(duration, 0.001)

  const getSnapTimes = (excludeId: string) => {
    const snapTimes = [useTimelineStore.getState().currentTime, 0]

    for (const other of clipLayers) {
      if (other.id !== excludeId)
        snapTimes.push(other.clip.start, other.clip.end)
    }

    for (const other of audioClips) {
      if (other.id !== excludeId) snapTimes.push(other.start, other.end)
    }

    return snapTimes
  }

  const beginDrag = (
    event: React.PointerEvent,
    layer: EditorLayer & { clip: LayerClip },
    mode: ClipDragMode
  ) => {
    if (event.button !== 0 || layer.locked) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    useLayerStore.getState().selectLayer(layer.id)
    setSelectedAudioId(null)
    useEditorStore.getState().beginInteractiveEdit()

    setDrag({
      mode,
      originClientX: event.clientX,
      originalClip: layer.clip,
      playbackRate: getRate(layer),
      snapTimes: getSnapTimes(layer.id),
      sourceDuration: getLayerSourceDuration(layer),
      target: { id: layer.id, kind: "layer" },
    })
  }

  const beginAudioDrag = (
    event: React.PointerEvent,
    clip: AudioClip,
    mode: ClipDragMode
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setSelectedAudioId(clip.id)
    useEditorStore.getState().beginInteractiveEdit()
    const duration = useAssetStore
      .getState()
      .getAssetById(clip.assetId)?.duration

    setDrag({
      mode,
      originClientX: event.clientX,
      originalClip: clip,
      playbackRate: 1,
      snapTimes: getSnapTimes(clip.id),
      sourceDuration:
        typeof duration === "number" && duration > 0 ? duration : null,
      target: { id: clip.id, kind: "audio" },
    })
  }

  const addAudioFile = async (file: File) => {
    const asset = await useAssetStore
      .getState()
      .loadAsset(file, { kind: "audio" })
    const timeline = useTimelineStore.getState()
    const length =
      typeof asset.duration === "number" && asset.duration > 0
        ? asset.duration
        : timeline.duration
    const clip: AudioClip = {
      assetId: asset.id,
      end: timeline.currentTime + length,
      fadeIn: 0,
      fadeOut: 0,
      id: crypto.randomUUID(),
      name: asset.fileName.replace(/\.[^.]+$/, ""),
      role: "music",
      sourceIn: 0,
      start: timeline.currentTime,
      volume: 1,
    }
    useAudioStore.getState().addAudioClip(clip)
    setSelectedAudioId(clip.id)
    if (clip.end > timeline.duration) timeline.setDuration(clip.end)
  }

  const patchAudio = (patch: Partial<Omit<AudioClip, "id">>) => {
    if (selectedAudio)
      useAudioStore.getState().updateAudioClip(selectedAudio.id, patch)
  }

  const handleMove = useEffectEvent((event: PointerEvent) => {
    const surface = surfaceRef.current

    if (!(drag && surface)) {
      return
    }

    const width = Math.max(1, surface.getBoundingClientRect().width)
    const secondsPerPx = safeDuration / width
    const delta = (event.clientX - drag.originClientX) * secondsPerPx
    const clip = drag.originalClip
    let next: LayerClip

    if (drag.mode === "move") {
      const start = clip.start + delta
      const end = clip.end + delta
      const snappedStart = snap(start, drag.snapTimes, secondsPerPx)
      const snappedEnd = snap(end, drag.snapTimes, secondsPerPx)
      // Snap whichever edge is closer to a target.
      const startShift = snappedStart - start
      const endShift = snappedEnd - end
      const shift =
        Math.abs(startShift) <= Math.abs(endShift) && startShift !== 0
          ? startShift
          : endShift
      next = moveClip(clip, start + shift)
    } else if (drag.mode === "trim-start") {
      next = trimClipStart(
        clip,
        snap(clip.start + delta, drag.snapTimes, secondsPerPx),
        drag.playbackRate
      )
    } else {
      next = trimClipEnd(
        clip,
        snap(clip.end + delta, drag.snapTimes, secondsPerPx),
        drag.sourceDuration,
        drag.playbackRate
      )
    }

    if (drag.target.kind === "layer") {
      useLayerStore.getState().setLayerClip(drag.target.id, next)
    } else {
      useAudioStore.getState().updateAudioClip(drag.target.id, {
        end: next.end,
        fadeIn: next.fadeIn,
        fadeOut: next.fadeOut,
        sourceIn: next.sourceIn,
        start: next.start,
      })
    }
  })

  const handleEnd = useEffectEvent(() => {
    if (!drag) {
      return
    }

    setDrag(null)
    // Grow the timeline once, after the drag, so the px/second mapping does
    // not change under the pointer.
    ensureTimelineCoversClips()
    const audioEnd = Math.max(
      0,
      ...useAudioStore.getState().clips.map((clip) => clip.end)
    )
    if (audioEnd > useTimelineStore.getState().duration) {
      useTimelineStore.getState().setDuration(audioEnd)
    }
    useEditorStore.getState().endInteractiveEdit()
  })

  useEffect(() => {
    if (!drag) {
      return
    }

    const onMove = (event: PointerEvent) => handleMove(event)
    const onEnd = () => handleEnd()
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onEnd)
    window.addEventListener("pointercancel", onEnd)

    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onEnd)
      window.removeEventListener("pointercancel", onEnd)
    }
  }, [drag])

  const selectedWithClips = selectedLayerIds.filter((id) =>
    clipLayers.some((layer) => layer.id === id)
  )

  return (
    <div className="flex shrink-0 flex-col border-b border-[var(--ds-border-divider)]">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        <Typography
          className="mr-auto tracking-[0.08em] uppercase"
          tone="secondary"
          variant="overline"
        >
          Clips
        </Typography>
        {canAddClip ? (
          <Button
            onClick={() => selectedLayer && addClipToLayer(selectedLayer.id)}
            size="compact"
            title="Give the selected layer a start/end on the timeline"
            variant="ghost"
          >
            + Clip
          </Button>
        ) : null}
        {selectedLayer?.clip ? (
          <Button
            onClick={() => removeClipFromLayer(selectedLayer.id)}
            size="compact"
            title="Remove the clip range (layer shows for the whole timeline)"
            variant="ghost"
          >
            Unclip
          </Button>
        ) : null}
        <Button
          onClick={() => addLowerThird()}
          size="compact"
          title="Add a name/role lower third at the playhead"
          variant="ghost"
        >
          + Lower third
        </Button>
        <Button
          onClick={() => captionFileRef.current?.click()}
          size="compact"
          title="Import an SRT/VTT file as a captions layer"
          variant="ghost"
        >
          + Captions
        </Button>
        <input
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            const cues = parseSubtitles(await file.text())
            if (cues.length > 0) addCaptionLayer(cues)
          }}
          ref={captionFileRef}
          type="file"
        />
        <Button
          onClick={() => audioFileRef.current?.click()}
          size="compact"
          title="Add music, voice-over or ambience at the playhead"
          variant="ghost"
        >
          + Audio
        </Button>
        <Button
          data-state={
            (ducking ?? DEFAULT_AUDIO_DUCKING).enabled ? "active" : undefined
          }
          onClick={() => {
            const current = ducking ?? DEFAULT_AUDIO_DUCKING
            useAudioStore
              .getState()
              .setDucking({ ...current, enabled: !current.enabled })
          }}
          size="compact"
          title={`Duck music/ambience ${(ducking ?? DEFAULT_AUDIO_DUCKING).amountDb} dB under dialogue`}
          variant="ghost"
        >
          Duck {(ducking ?? DEFAULT_AUDIO_DUCKING).enabled ? "on" : "off"}
        </Button>
        <input
          accept={AUDIO_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void addAudioFile(file)
          }}
          ref={audioFileRef}
          type="file"
        />
        <Button
          disabled={selectedLayerIds.length === 0}
          onClick={() => splitLayersAt(selectedLayerIds, currentTime)}
          size="compact"
          title="Cut the selected layers at the playhead (B)"
          variant="ghost"
        >
          Split
        </Button>
        <Button
          disabled={selectedWithClips.length === 0}
          onClick={() => rippleDeleteLayers(selectedWithClips)}
          size="compact"
          title="Delete and close the gap (Shift+Delete)"
          variant="ghost"
        >
          Ripple delete
        </Button>
      </div>

      {selectedAudio ? (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5">
          <Typography tone="primary" variant="monoXs">
            {selectedAudio.name}
          </Typography>
          <select
            aria-label="Audio role"
            className="rounded-[6px] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-1.5 py-0.5 text-[11px] text-[var(--ds-color-text-secondary)]"
            onChange={(event) =>
              patchAudio({ role: event.target.value as AudioClipRole })
            }
            value={selectedAudio.role}
          >
            {AUDIO_CLIP_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <Typography as="span" tone="secondary" variant="monoXs">
              Vol
            </Typography>
            <input
              aria-label="Volume"
              max={2}
              min={0}
              onChange={(event) =>
                patchAudio({ volume: Number(event.target.value) })
              }
              step={0.01}
              type="range"
              value={selectedAudio.volume}
            />
          </label>
          <div className="flex w-[110px] items-center gap-1">
            <Typography tone="secondary" variant="monoXs">
              In
            </Typography>
            <NumberInput
              aria-label="Fade in seconds"
              min={0}
              onChange={(fadeIn) =>
                patchAudio({
                  fadeIn: Math.min(
                    Math.max(0, fadeIn),
                    selectedAudio.end -
                      selectedAudio.start -
                      selectedAudio.fadeOut
                  ),
                })
              }
              step={0.1}
              value={selectedAudio.fadeIn}
            />
          </div>
          <div className="flex w-[110px] items-center gap-1">
            <Typography tone="secondary" variant="monoXs">
              Out
            </Typography>
            <NumberInput
              aria-label="Fade out seconds"
              min={0}
              onChange={(fadeOut) =>
                patchAudio({
                  fadeOut: Math.min(
                    Math.max(0, fadeOut),
                    selectedAudio.end -
                      selectedAudio.start -
                      selectedAudio.fadeIn
                  ),
                })
              }
              step={0.1}
              value={selectedAudio.fadeOut}
            />
          </div>
          <Button
            onClick={() => {
              useAudioStore.getState().removeAudioClips([selectedAudio.id])
              setSelectedAudioId(null)
            }}
            size="compact"
            variant="ghost"
          >
            Delete
          </Button>
        </div>
      ) : null}

      {clipLayers.length + audioClips.length > 0 ? (
        <div
          className="relative overflow-y-auto"
          ref={surfaceRef}
          style={{
            height:
              Math.min(
                clipLayers.length + audioClips.length,
                MAX_VISIBLE_ROWS
              ) * ROW_HEIGHT,
          }}
        >
          {clipLayers.map((layer, index) => {
            const { clip } = layer
            const left = (clip.start / safeDuration) * 100
            const width = ((clip.end - clip.start) / safeDuration) * 100
            const selected = selectedLayerIds.includes(layer.id)
            const fadeInWidth =
              clip.end > clip.start
                ? (clip.fadeIn / (clip.end - clip.start)) * 100
                : 0
            const fadeOutWidth =
              clip.end > clip.start
                ? (clip.fadeOut / (clip.end - clip.start)) * 100
                : 0

            return (
              <div
                className="absolute inset-x-0"
                key={layer.id}
                style={{ height: ROW_HEIGHT, top: index * ROW_HEIGHT }}
              >
                <button
                  aria-label={`${layer.name} clip, ${clip.start.toFixed(2)}s to ${clip.end.toFixed(2)}s`}
                  className={cn(
                    "group absolute top-[3px] bottom-[3px] flex cursor-grab items-center overflow-hidden rounded-[6px] border bg-[var(--ds-color-surface-control)] active:cursor-grabbing",
                    selected
                      ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-selected)]"
                      : "border-[var(--ds-border-divider)]",
                    !layer.visible && "opacity-45",
                    layer.locked && "cursor-not-allowed"
                  )}
                  onPointerDown={(event) => beginDrag(event, layer, "move")}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  tabIndex={-1}
                  type="button"
                >
                  {fadeInWidth > 0 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/45 to-transparent"
                      style={{ width: `${fadeInWidth}%` }}
                    />
                  ) : null}
                  {fadeOutWidth > 0 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-black/45 to-transparent"
                      style={{ width: `${fadeOutWidth}%` }}
                    />
                  ) : null}
                  <Typography
                    as="span"
                    className="pointer-events-none truncate px-2.5"
                    tone={selected ? "primary" : "secondary"}
                    variant="monoXs"
                  >
                    {layer.name}
                  </Typography>
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[6px] cursor-ew-resize bg-white/0 hover:bg-white/30"
                    onPointerDown={(event) =>
                      beginDrag(event, layer, "trim-start")
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 right-0 w-[6px] cursor-ew-resize bg-white/0 hover:bg-white/30"
                    onPointerDown={(event) =>
                      beginDrag(event, layer, "trim-end")
                    }
                  />
                </button>
              </div>
            )
          })}
          {audioClips.map((clip, audioIndex) => {
            const index = clipLayers.length + audioIndex
            const length = Math.max(clip.end - clip.start, 1e-6)
            const selected = clip.id === selectedAudioId

            return (
              <div
                className="absolute inset-x-0"
                key={clip.id}
                style={{ height: ROW_HEIGHT, top: index * ROW_HEIGHT }}
              >
                <button
                  aria-label={`${clip.name} audio clip (${clip.role}), ${clip.start.toFixed(2)}s to ${clip.end.toFixed(2)}s`}
                  className={cn(
                    "absolute top-[3px] bottom-[3px] flex cursor-grab items-center overflow-hidden rounded-[6px] border active:cursor-grabbing",
                    ROLE_COLORS[clip.role],
                    selected
                      ? "border-[var(--ds-border-active)]"
                      : "border-[var(--ds-border-divider)]"
                  )}
                  onPointerDown={(event) => beginAudioDrag(event, clip, "move")}
                  style={{
                    left: `${(clip.start / safeDuration) * 100}%`,
                    width: `${(length / safeDuration) * 100}%`,
                  }}
                  tabIndex={-1}
                  type="button"
                >
                  {clip.fadeIn > 0 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/45 to-transparent"
                      style={{ width: `${(clip.fadeIn / length) * 100}%` }}
                    />
                  ) : null}
                  {clip.fadeOut > 0 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-black/45 to-transparent"
                      style={{ width: `${(clip.fadeOut / length) * 100}%` }}
                    />
                  ) : null}
                  <Typography
                    as="span"
                    className="pointer-events-none truncate px-2.5"
                    tone={selected ? "primary" : "secondary"}
                    variant="monoXs"
                  >
                    ♪ {clip.name}
                  </Typography>
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[6px] cursor-ew-resize hover:bg-white/30"
                    onPointerDown={(event) =>
                      beginAudioDrag(event, clip, "trim-start")
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 right-0 w-[6px] cursor-ew-resize hover:bg-white/30"
                    onPointerDown={(event) =>
                      beginAudioDrag(event, clip, "trim-end")
                    }
                  />
                </button>
              </div>
            )
          })}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--ds-color-text-primary)]"
            style={{ left: `${(currentTime / safeDuration) * 100}%` }}
          />
        </div>
      ) : (
        <Typography className="px-2 pb-1.5" tone="muted" variant="monoXs">
          Select a layer and press + Clip, or add audio with + Audio.
        </Typography>
      )}
    </div>
  )
}
