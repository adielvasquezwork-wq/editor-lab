/**
 * Subtitle cues for text layers. A text layer with `subtitles` shows the cue
 * active at the playhead (and nothing between cues) instead of its static
 * text, so a whole SRT/VTT file lives in a single layer.
 */

export interface SubtitleCue {
  end: number
  start: number
  text: string
}

export const MAX_SUBTITLE_CUES = 5000
const MAX_CUE_TEXT_LENGTH = 1000

const TIMESTAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const CUE_TIMING = new RegExp(
  `^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`
)

function toSeconds(
  hours: string | undefined,
  minutes: string,
  seconds: string,
  fraction: string
): number {
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction.padEnd(3, "0")) / 1000
  )
}

function stripMarkup(line: string): string {
  return line
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/** Parses SRT or WebVTT text. Malformed blocks are skipped, not fatal. */
export function parseSubtitles(input: string): SubtitleCue[] {
  const lines = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n")
  const cues: SubtitleCue[] = []
  let index = 0

  while (index < lines.length && cues.length < MAX_SUBTITLE_CUES) {
    const match = CUE_TIMING.exec(lines[index] ?? "")

    if (!match) {
      index += 1
      continue
    }

    const start = toSeconds(
      match[1],
      match[2] ?? "0",
      match[3] ?? "0",
      match[4] ?? "0"
    )
    const end = toSeconds(
      match[5],
      match[6] ?? "0",
      match[7] ?? "0",
      match[8] ?? "0"
    )
    index += 1

    const textLines: string[] = []

    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      // A timing line without a blank separator starts the next cue.
      if (CUE_TIMING.test(lines[index] ?? "")) {
        break
      }

      const text = stripMarkup(lines[index] ?? "")

      if (text) {
        textLines.push(text)
      }

      index += 1
    }

    const text = textLines.join("\n").slice(0, MAX_CUE_TEXT_LENGTH)

    if (text && end > start) {
      cues.push({ end, start, text })
    }
  }

  return cues.sort((a, b) => a.start - b.start)
}

/** Validates untrusted cue arrays (saved projects). */
export function normalizeSubtitleCues(value: unknown): SubtitleCue[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const cues: SubtitleCue[] = []

  for (const entry of value.slice(0, MAX_SUBTITLE_CUES)) {
    if (typeof entry !== "object" || entry === null) {
      continue
    }

    const { end, start, text } = entry as Record<string, unknown>

    if (
      typeof start === "number" &&
      typeof end === "number" &&
      typeof text === "string" &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      start >= 0
    ) {
      cues.push({ end, start, text: text.slice(0, MAX_CUE_TEXT_LENGTH) })
    }
  }

  return cues.sort((a, b) => a.start - b.start)
}

/** Cue text at `time`, or "" between cues. Binary search over sorted cues. */
export function getActiveSubtitleText(
  cues: readonly SubtitleCue[],
  time: number
): string {
  let low = 0
  let high = cues.length - 1
  let candidate = -1

  while (low <= high) {
    const mid = (low + high) >> 1
    const cue = cues[mid]

    if (cue && cue.start <= time) {
      candidate = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // Overlapping cues: walk back to collect every cue covering `time`.
  const active: string[] = []

  for (let i = candidate; i >= 0; i -= 1) {
    const cue = cues[i]

    if (!cue) {
      continue
    }

    if (cue.end > time) {
      active.unshift(cue.text)
    }

    // Cues are sorted by start; stop once far enough back that none can
    // still be active (bounded by the longest plausible cue).
    if (time - cue.start > 60) {
      break
    }
  }

  return active.join("\n")
}

function pad(value: number, width = 2): string {
  return String(Math.floor(value)).padStart(width, "0")
}

function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const ms = Math.round((safe % 1) * 1000)
  const whole = Math.floor(safe) + (ms === 1000 ? 1 : 0)
  return `${pad(whole / 3600)}:${pad((whole % 3600) / 60)}:${pad(whole % 60)},${pad(ms === 1000 ? 0 : ms, 3)}`
}

/** Serializes cues back to SRT (for exporting captions alongside video). */
export function formatSrt(cues: readonly SubtitleCue[]): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`
    )
    .join("\n")
}
