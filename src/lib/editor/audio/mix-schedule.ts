/**
 * Schedules planned mix segments onto a WebAudio context. Shared by export
 * (OfflineAudioContext) and preview playback (AudioContext) so both produce
 * the same mix.
 */

import type { AudioDucking } from "@/lib/editor/audio-clips"
import {
  buildGainEnvelope,
  getSegmentGain,
  type MixSegment,
} from "@/lib/editor/audio/mix-plan"

export interface ScheduledSegment {
  gain: GainNode
  source: AudioBufferSourceNode
}

/**
 * Plays the part of `segment` inside [windowStart, windowEnd) timeline
 * seconds. Timeline second `windowStart` maps to context time `contextStart`.
 * Returns null when nothing of the segment falls in the window.
 */
export function scheduleMixSegment(input: {
  buffer: AudioBuffer
  context: BaseAudioContext
  contextStart: number
  destination: AudioNode
  ducking: AudioDucking | null
  intervals: readonly [number, number][]
  segment: MixSegment
  windowEnd: number
  windowStart: number
}): ScheduledSegment | null {
  const { buffer, context, segment } = input
  const from = Math.max(segment.timelineStart, input.windowStart)
  const to = Math.min(segment.timelineEnd, input.windowEnd)

  if (!(to > from)) {
    return null
  }

  const rate = segment.playbackRate
  const offset = segment.sourceIn + (from - segment.timelineStart) * rate

  if (offset >= buffer.duration) {
    return null
  }

  const toContext = (time: number) =>
    input.contextStart + (time - input.windowStart)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate

  const gain = context.createGain()
  const startGain = getSegmentGain(
    segment,
    from,
    input.intervals,
    input.ducking
  )
  gain.gain.setValueAtTime(startGain, toContext(from))

  for (const point of buildGainEnvelope(
    segment,
    input.intervals,
    input.ducking
  )) {
    if (point.time > from && point.time <= to) {
      gain.gain.linearRampToValueAtTime(point.gain, toContext(point.time))
    }
  }

  source.connect(gain)
  gain.connect(input.destination)
  // start()'s duration is in buffer (source) seconds.
  source.start(toContext(from), offset, (to - from) * rate)

  return { gain, source }
}
