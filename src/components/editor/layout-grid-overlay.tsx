"use client"
import { getDocumentSize } from "@/lib/editor/composition"
import { layoutGridTracks, resolveLayoutGrid } from "@/lib/editor/layout-grid"
import { useEditorStore } from "@/store/editor-store"

export function LayoutGridOverlay({ hidden }: { hidden: boolean }) {
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const outputSize = useEditorStore((state) => state.outputSize)
  const canvasSize = useEditorStore((state) => state.canvasSize)
  const grid = resolveLayoutGrid(sceneConfig)
  if (hidden || !grid.visible) return null
  const document = getDocumentSize(sceneConfig, outputSize) ?? canvasSize
  const columns = layoutGridTracks(
    grid.columns,
    grid.gap,
    grid.margin,
    document.width
  )
  const rows = layoutGridTracks(grid.rows, grid.gap, grid.margin, document.height)
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-layout-grid="true"
      preserveAspectRatio="none"
      viewBox={`0 0 ${document.width} ${document.height}`}
    >
      {columns.map(([start, end]) => (
        <rect
          fill="var(--ds-color-accent)"
          fillOpacity={grid.opacity}
          height={document.height}
          key={`column-${start}`}
          width={end - start}
          x={start}
          y={0}
        />
      ))}
      {rows.map(([start, end]) => (
        <rect
          fill="var(--ds-color-accent)"
          fillOpacity={grid.opacity}
          height={end - start}
          key={`row-${start}`}
          width={document.width}
          x={0}
          y={start}
        />
      ))}
    </svg>
  )
}
