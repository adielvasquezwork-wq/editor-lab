import type { TimelineMarker } from "@/types/editor"

/**
 * The export range between the markers around the playhead: from the last
 * marker at or before `playhead` (or 0) to the next marker after it (or the
 * timeline end). Null when there are no markers.
 */
export function rangeFromMarkers(
  markers: readonly TimelineMarker[],
  playhead: number,
  duration: number
): { duration: number; start: number } | null {
  if (markers.length === 0) return null
  const sorted = [...markers].sort((a, b) => a.time - b.time)
  const before = [...sorted].reverse().find((marker) => marker.time <= playhead)
  const after = sorted.find((marker) => marker.time > playhead)
  const start = before?.time ?? 0
  const end = after?.time ?? duration
  if (end - start <= 0) return null
  return { duration: end - start, start }
}
