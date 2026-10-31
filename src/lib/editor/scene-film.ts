/**
 * Validation for the optional film-finishing fields of SceneConfig
 * (vignette, letterbox, split tone). Malformed values are dropped (effect
 * off) instead of rejecting the project.
 */

import type {
  SceneConfig,
  SceneLetterbox,
  SceneSplitTone,
  SceneVignette,
} from "@/types/editor"

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function num(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : null
}

function color(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function normalizeVignette(value: unknown): SceneVignette | null {
  const input = record(value)
  const amount = num(input?.amount, 0, 4)
  const inner = num(input?.inner, 0, 1)
  const outer = num(input?.outer, 0, 1.5)
  const roundness = num(input?.roundness, 0, 1)

  if (
    amount === null ||
    inner === null ||
    outer === null ||
    roundness === null
  ) {
    return null
  }

  return { amount, inner, outer: Math.max(outer, inner + 0.01), roundness }
}

export function normalizeLetterbox(value: unknown): SceneLetterbox | null {
  const input = record(value)
  const aspect = num(input?.aspect, 0.2, 5)
  const barColor = color(input?.color)

  return aspect === null || barColor === null
    ? null
    : { aspect, color: barColor }
}

export function normalizeSplitTone(value: unknown): SceneSplitTone | null {
  const input = record(value)
  const balance = num(input?.balance, -1, 1)
  const highlightAmount = num(input?.highlightAmount, 0, 1)
  const shadowAmount = num(input?.shadowAmount, 0, 1)
  const highlightColor = color(input?.highlightColor)
  const shadowColor = color(input?.shadowColor)

  if (
    balance === null ||
    highlightAmount === null ||
    shadowAmount === null ||
    highlightColor === null ||
    shadowColor === null
  ) {
    return null
  }

  return { balance, highlightAmount, highlightColor, shadowAmount, shadowColor }
}

/** Replaces the optional film fields with validated copies (or removes them). */
export function normalizeSceneFilmFields(config: SceneConfig): SceneConfig {
  if (
    !("vignette" in config || "letterbox" in config || "splitTone" in config)
  ) {
    return config
  }

  const next: SceneConfig = { ...config }
  const vignette = normalizeVignette(config.vignette)
  const letterbox = normalizeLetterbox(config.letterbox)
  const splitTone = normalizeSplitTone(config.splitTone)

  if (vignette) next.vignette = vignette
  else delete next.vignette
  if (letterbox) next.letterbox = letterbox
  else delete next.letterbox
  if (splitTone) next.splitTone = splitTone
  else delete next.splitTone

  return next
}

export function hasActiveFilmFinish(config: SceneConfig): boolean {
  return Boolean(
    (config.vignette && config.vignette.amount > 0) ||
      config.letterbox ||
      (config.splitTone &&
        (config.splitTone.shadowAmount > 0 ||
          config.splitTone.highlightAmount > 0))
  )
}
