/**
 * Audio-only clips (music, voice-over, ambience) placed on the timeline, and
 * the project's ducking setting. Stored on the project audio snapshot as
 * optional fields so projects without them keep their exact shape.
 */

export const AUDIO_CLIP_ROLES = ["dialogue", "music", "ambience"] as const
export type AudioClipRole = (typeof AUDIO_CLIP_ROLES)[number]

export interface AudioClip {
  assetId: string
  end: number
  fadeIn: number
  fadeOut: number
  id: string
  name: string
  role: AudioClipRole
  sourceIn: number
  start: number
  /** Linear gain, 0..2 (1 = unity). */
  volume: number
}

export interface AudioDucking {
  /** Gain reduction applied to music/ambience under dialogue, in dB (<= 0). */
  amountDb: number
  enabled: boolean
  /** Ramp length into and out of a duck, seconds. */
  rampSeconds: number
}

export const DEFAULT_AUDIO_DUCKING: AudioDucking = {
  amountDb: -12,
  enabled: true,
  rampSeconds: 0.3,
}

export const MAX_AUDIO_CLIPS = 500
export const MAX_CLIP_VOLUME = 2

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function isAudioClipRole(value: unknown): value is AudioClipRole {
  return (AUDIO_CLIP_ROLES as readonly unknown[]).includes(value)
}

export function normalizeAudioClip(value: unknown): AudioClip | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const record = value as Record<string, unknown>

  if (typeof record.id !== "string" || typeof record.assetId !== "string") {
    return null
  }

  const start = Math.max(0, finite(record.start, 0))
  const end = finite(record.end, Number.NaN)

  if (!(Number.isFinite(end) && end > start)) {
    return null
  }

  const duration = end - start
  const fadeIn = Math.min(Math.max(0, finite(record.fadeIn, 0)), duration)

  return {
    assetId: record.assetId,
    end,
    fadeIn,
    fadeOut: Math.min(
      Math.max(0, finite(record.fadeOut, 0)),
      duration - fadeIn
    ),
    id: record.id,
    name: typeof record.name === "string" ? record.name.slice(0, 200) : "Audio",
    role: isAudioClipRole(record.role) ? record.role : "music",
    sourceIn: Math.max(0, finite(record.sourceIn, 0)),
    start,
    volume: Math.min(MAX_CLIP_VOLUME, Math.max(0, finite(record.volume, 1))),
  }
}

export function normalizeAudioClips(value: unknown): AudioClip[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .slice(0, MAX_AUDIO_CLIPS)
    .map(normalizeAudioClip)
    .filter((clip): clip is AudioClip => clip !== null)
}

export function normalizeAudioDucking(value: unknown): AudioDucking | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const record = value as Record<string, unknown>

  return {
    amountDb: Math.min(
      0,
      Math.max(-60, finite(record.amountDb, DEFAULT_AUDIO_DUCKING.amountDb))
    ),
    enabled: record.enabled !== false,
    rampSeconds: Math.min(
      5,
      Math.max(
        0.01,
        finite(record.rampSeconds, DEFAULT_AUDIO_DUCKING.rampSeconds)
      )
    ),
  }
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}
