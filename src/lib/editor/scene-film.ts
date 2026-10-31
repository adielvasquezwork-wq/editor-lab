/**
 * Validation for the optional letterbox field of SceneConfig. Malformed
 * values are dropped (bars off) instead of rejecting the project. (Vignette
 * and split tone are effect layers now; older projects are migrated by
 * src/editorlab/effects/migrate-scene-film.ts.)
 */

import type { SceneConfig, SceneLetterbox } from "@/types/editor"

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

export function normalizeLetterbox(value: unknown): SceneLetterbox | null {
  const input = record(value)
  const aspect = num(input?.aspect, 0.2, 5)
  const barColor = color(input?.color)

  return aspect === null || barColor === null
    ? null
    : { aspect, color: barColor }
}

/** Validates letterbox and drops the legacy vignette / split tone fields. */
export function normalizeSceneFilmFields(config: SceneConfig): SceneConfig {
  if (
    !("vignette" in config || "letterbox" in config || "splitTone" in config)
  ) {
    return config
  }

  const {
    splitTone: _splitTone,
    vignette: _vignette,
    ...rest
  } = config as SceneConfig & { splitTone?: unknown; vignette?: unknown }
  const next: SceneConfig = rest
  const letterbox = normalizeLetterbox(config.letterbox)

  if (letterbox) next.letterbox = letterbox
  else delete next.letterbox

  return next
}

export function hasActiveFilmFinish(config: SceneConfig): boolean {
  return Boolean(config.letterbox)
}
