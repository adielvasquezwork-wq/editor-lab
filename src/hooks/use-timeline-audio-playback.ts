"use client"

import { useEffect } from "react"
import { DEFAULT_AUDIO_DUCKING } from "@/lib/editor/audio-clips"
import { decodeAudioBuffer } from "@/lib/editor/audio/decode"
import {
  getDialogueIntervals,
  type MixSegment,
  planAudioMix,
} from "@/lib/editor/audio/mix-plan"
import {
  type ScheduledSegment,
  scheduleMixSegment,
} from "@/lib/editor/audio/mix-schedule"
import { isPreviewRenderLocked } from "@/lib/editor/preview-render-lock"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useLayerStore } from "@/store/layer-store"
import { useSoundStore } from "@/store/sound-store"
import { useTimelineStore } from "@/store/timeline-store"

const MAX_DRIFT_SECONDS = 0.2
const SCHEDULE_LEAD_SECONDS = 0.05
const CHECK_INTERVAL_MS = 250

/** Decoded sources shared across mounts; evicted when no longer planned. */
const bufferCache = new Map<string, Promise<AudioBuffer | null>>()

function loadBuffer(url: string): Promise<AudioBuffer | null> {
  let pending = bufferCache.get(url)

  if (!pending) {
    // Videos without an audio track decode to an error: treat as silence.
    pending = decodeAudioBuffer(url).catch(() => null)
    bufferCache.set(url, pending)
  }

  return pending
}

function planSignature(segments: readonly MixSegment[]): string {
  return JSON.stringify(segments)
}

/**
 * Plays the timeline audio mix (audio clips + clipped video audio) during
 * preview, in sync with the playhead. Uses the same planner and scheduler as
 * export, so what you hear is what gets exported.
 */
export function useTimelineAudioPlayback(enabled: boolean): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") {
      return
    }

    let context: AudioContext | null = null
    let scheduled: ScheduledSegment[] = []
    let generation = 0
    let anchor: { contextTime: number; timelineTime: number } | null = null
    let currentSignature = ""
    let lastTimelineTime = useTimelineStore.getState().currentTime

    const plan = (): MixSegment[] => {
      const audio = useAudioStore.getState()
      return planAudioMix({
        assets: useAssetStore.getState().assets,
        audioClips: audio.clips,
        layers: useLayerStore.getState().layers,
      })
    }

    const shouldPlay = (segments: readonly MixSegment[]): boolean => {
      const { frozen, isPlaying } = useTimelineStore.getState()
      return (
        enabled &&
        segments.length > 0 &&
        useSoundStore.getState().enabled &&
        !document.hidden &&
        !isPreviewRenderLocked() &&
        isPlaying &&
        !frozen
      )
    }

    const stopAll = () => {
      generation += 1
      anchor = null

      for (const entry of scheduled) {
        try {
          entry.source.stop()
        } catch {
          // never started
        }
        entry.source.disconnect()
        entry.gain.disconnect()
      }

      scheduled = []
    }

    const start = (segments: readonly MixSegment[]) => {
      stopAll()
      context ??= new AudioContext()
      void context.resume().catch(() => undefined)

      const activeContext = context
      const thisGeneration = generation
      const timeline = useTimelineStore.getState()
      const contextStart = activeContext.currentTime + SCHEDULE_LEAD_SECONDS
      const windowStart = timeline.currentTime
      const windowEnd = timeline.duration
      const ducking = useAudioStore.getState().ducking ?? DEFAULT_AUDIO_DUCKING
      const intervals = getDialogueIntervals(segments)
      anchor = { contextTime: contextStart, timelineTime: windowStart }

      for (const segment of segments) {
        if (segment.timelineEnd <= windowStart) {
          continue
        }

        void loadBuffer(segment.url).then((buffer) => {
          if (!buffer || thisGeneration !== generation) {
            return
          }

          // Late decodes join in progress: shift the window to "now".
          const now = activeContext.currentTime + SCHEDULE_LEAD_SECONDS
          const elapsed = Math.max(0, now - contextStart)
          const entry = scheduleMixSegment({
            buffer,
            context: activeContext,
            contextStart: contextStart + elapsed,
            destination: activeContext.destination,
            ducking,
            intervals,
            segment,
            windowEnd,
            windowStart: windowStart + elapsed,
          })

          if (entry) {
            scheduled.push(entry)
          }
        })
      }
    }

    const sync = () => {
      const segments = plan()
      const signature = planSignature(segments)
      const playing = shouldPlay(segments)

      // Drop decoded sources that are no longer used.
      const used = new Set(segments.map((segment) => segment.url))
      for (const url of bufferCache.keys()) {
        if (!used.has(url)) bufferCache.delete(url)
      }

      if (!playing) {
        if (anchor) stopAll()
        currentSignature = signature
        return
      }

      const timelineTime = useTimelineStore.getState().currentTime
      const expected =
        anchor && context
          ? anchor.timelineTime + (context.currentTime - anchor.contextTime)
          : null
      const drifted =
        expected === null ||
        Math.abs(expected - timelineTime) > MAX_DRIFT_SECONDS
      const wrapped = timelineTime + 0.05 < lastTimelineTime
      lastTimelineTime = timelineTime

      if (!anchor || drifted || wrapped || signature !== currentSignature) {
        currentSignature = signature
        start(segments)
      }
    }

    const unsubscribers = [
      useTimelineStore.subscribe(sync),
      useLayerStore.subscribe((state, previous) => {
        if (state.layers !== previous.layers) sync()
      }),
      useAudioStore.subscribe((state, previous) => {
        if (
          state.clips !== previous.clips ||
          state.ducking !== previous.ducking
        )
          sync()
      }),
      useAssetStore.subscribe(sync),
      useSoundStore.subscribe(sync),
    ]
    document.addEventListener("visibilitychange", sync)
    const timer = window.setInterval(sync, CHECK_INTERVAL_MS)
    sync()

    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", sync)
      for (const unsubscribe of unsubscribers) unsubscribe()
      stopAll()
      void context?.close().catch(() => undefined)
    }
  }, [enabled])
}
