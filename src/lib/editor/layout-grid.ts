import { useEditorStore } from "@/store/editor-store"
import {
  DEFAULT_LAYOUT_GRID,
  type LayoutGrid,
  type SceneConfig,
} from "@/types/editor"

export const MAX_GRID_TRACKS = 48
const MAX_GRID_SPACING = 4000

function clamp(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function resolveLayoutGrid(
  sceneConfig: Pick<SceneConfig, "grid">
): LayoutGrid {
  const grid = sceneConfig.grid
  return {
    visible: grid?.visible === true,
    columns: Math.round(
      clamp(grid?.columns, DEFAULT_LAYOUT_GRID.columns, 0, MAX_GRID_TRACKS)
    ),
    rows: Math.round(
      clamp(grid?.rows, DEFAULT_LAYOUT_GRID.rows, 0, MAX_GRID_TRACKS)
    ),
    gap: clamp(grid?.gap, DEFAULT_LAYOUT_GRID.gap, 0, MAX_GRID_SPACING),
    margin: clamp(grid?.margin, DEFAULT_LAYOUT_GRID.margin, 0, MAX_GRID_SPACING),
    opacity: clamp(grid?.opacity, DEFAULT_LAYOUT_GRID.opacity, 0, 1),
  }
}

export function layoutGridTracks(
  count: number,
  gap: number,
  margin: number,
  length: number
): [number, number][] {
  if (count < 1) return []
  const track = (length - margin * 2 - gap * (count - 1)) / count
  if (!(track > 0)) return []
  return Array.from({ length: count }, (_, index) => {
    const start = margin + index * (track + gap)
    return [start, start + track]
  })
}

export function updateLayoutGrid(updates: Partial<LayoutGrid>): void {
  const state = useEditorStore.getState()
  const current = resolveLayoutGrid(state.sceneConfig)
  const showing = "visible" in updates ? {} : { visible: true }
  state.updateSceneConfig({ grid: { ...current, ...showing, ...updates } })
}

export function toggleLayoutGrid(): void {
  const current = resolveLayoutGrid(useEditorStore.getState().sceneConfig)
  updateLayoutGrid({ visible: !current.visible })
}
