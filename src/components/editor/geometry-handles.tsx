"use client"
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { getCompositionFrame, getDocumentSize } from "@/lib/editor/composition"
import { layoutGridSnapLines, resolveLayoutGrid } from "@/lib/editor/layout-grid"
import { useEditorStore } from "@/store/editor-store"

export type Geometry = {
  center: [number, number]
  size: [number, number]
  rotation: number
}
export type GeometryOutline = "ellipse" | "rectangle" | "radial" | "linear" | "none"
type Point = [number, number]
type Side = -1 | 0 | 1
type SnapGuides = { x: number | null; y: number | null }
type DragTarget =
  | { kind: "move" }
  | { kind: "resize"; sx: Side; sy: Side }
  | { kind: "rotate" }
  | { kind: "end"; which: "start" | "end" }
type Drag = {
  pointer: number
  original: Geometry
  start: Point
} & DragTarget

const SNAP_DISTANCE_PX = 8
const ROTATE_STEP = 15
const MIN_SIZE = 0.01
const MAX_SIZE = 8
const HANDLE_PX = 8
const ROTATE_ZONE_PX = 14
const ACCENT = "var(--ds-color-accent)"
const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M6 15a7 7 0 1 0 2-8" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M6 15a7 7 0 1 0 2-8" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round"/><path d="M4 3v5h5" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 3v5h5" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)}") 12 12, auto`
const CORNERS: readonly [Side, Side][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]
const EDGES: readonly [Side, Side][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
const SIDE_NAMES: Record<string, string> = {
  "-1,-1": "nw",
  "0,-1": "n",
  "1,-1": "ne",
  "1,0": "e",
  "1,1": "se",
  "0,1": "s",
  "-1,1": "sw",
  "-1,0": "w",
}

function nearestLine(
  values: readonly number[],
  lines: readonly number[],
  threshold: number
): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null
  for (const value of values) {
    for (const line of lines) {
      const delta = line - value
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta)))
        best = { delta, line }
    }
  }
  return best
}

function resizeCursor(direction: Point): string {
  const angle = (((Math.atan2(direction[1], direction[0]) * 180) / Math.PI) % 180 + 180) % 180
  if (angle < 22.5 || angle >= 157.5) return "ew-resize"
  if (angle < 67.5) return "nwse-resize"
  if (angle < 112.5) return "ns-resize"
  return "nesw-resize"
}

function normalizeDegrees(value: number): number {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180
  return Math.round(wrapped * 10) / 10
}

function clampSize(value: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value))
}

export function GeometryHandles({
  geometry,
  outline,
  panning,
  read,
  write,
  restore,
  dataPrefix,
  label,
  framed = false,
  aspect = "free",
  rotatable = true,
  variant = "object",
}: {
  geometry: Geometry
  outline: GeometryOutline
  panning: boolean
  read: () => Geometry
  write: (updates: Partial<Geometry>) => void
  restore: (original: Geometry) => void
  dataPrefix: string
  label: string
  framed?: boolean
  aspect?: "free" | "locked"
  rotatable?: boolean
  variant?: "object" | "mask"
}) {
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const callbacks = useRef({ read, write, restore })
  callbacks.current = { read, write, restore }
  const [box, setBox] = useState({ width: 1, height: 1 })
  const [dragging, setDragging] = useState(false)
  const [guides, setGuides] = useState<SnapGuides>({ x: null, y: null })
  useEffect(() => {
    const element = host.current
    if (!element) return
    const update = () =>
      setBox({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const outputSize = useEditorStore((state) => state.outputSize)
  const space = framed ? getCompositionFrame(sceneConfig, box) : box
  const shorter = Math.max(1, Math.min(space.width, space.height))
  const documentSize = getDocumentSize(sceneConfig, outputSize) ?? box
  const grid = resolveLayoutGrid(sceneConfig)
  const snapLines = (() => {
    if (!grid.visible) return null
    const lines = layoutGridSnapLines(grid, documentSize)
    return {
      x: lines.x.map((x) => ((x * box.width) / documentSize.width - box.width / 2) / shorter),
      y: lines.y.map((y) => ((y * box.height) / documentSize.height - box.height / 2) / shorter),
    }
  })()
  const toPx = (point: Point): Point => [
    point[0] * shorter + box.width / 2,
    point[1] * shorter + box.height / 2,
  ]
  const fromEvent = (event: ReactPointerEvent<Element>): Point => {
    const rect = host.current!.getBoundingClientRect()
    const scale = rect.width / box.width
    const s = Math.max(1e-6, shorter * scale)
    return [
      (event.clientX - rect.left - rect.width / 2) / s,
      (event.clientY - rect.top - rect.height / 2) / s,
    ]
  }
  const finish = useCallback((commit: boolean) => {
    const active = drag.current
    if (!active) return
    drag.current = null
    setDragging(false)
    setGuides({ x: null, y: null })
    if (!commit) callbacks.current.restore(active.original)
    useEditorStore.getState().endInteractiveEdit()
  }, [])
  useEffect(() => {
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) cancel()
    }
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", key)
    return () => {
      if (drag.current) {
        drag.current = null
        useEditorStore.getState().endInteractiveEdit()
      }
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", key)
    }
  }, [finish])

  const angle = (geometry.rotation * Math.PI) / 180
  const u: Point = [Math.cos(angle), Math.sin(angle)]
  const v: Point = [-Math.sin(angle), Math.cos(angle)]
  const [cx, cy] = geometry.center
  const half: Point = [geometry.size[0] / 2, geometry.size[1] / 2]
  const local = (sx: number, sy: number): Point => [
    cx + u[0] * half[0] * sx + v[0] * half[1] * sy,
    cy + u[1] * half[0] * sx + v[1] * half[1] * sy,
  ]
  const isLine = outline === "linear"
  const locked = aspect === "locked"

  const begin =
    (target: DragTarget) =>
    (event: ReactPointerEvent<Element>) => {
      if (panning || event.button !== 0 || drag.current) return
      event.preventDefault()
      event.stopPropagation()
      drag.current = {
        ...target,
        pointer: event.pointerId,
        original: structuredClone(callbacks.current.read()),
        start: fromEvent(event),
      } as Drag
      setDragging(true)
      useEditorStore.getState().beginInteractiveEdit()
      ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    }

  const snapPoint = (
    point: Point,
    event: ReactPointerEvent<Element>,
    extents: Point | null
  ): SnapGuides => {
    const nextGuides: SnapGuides = { x: null, y: null }
    if (!snapLines || event.metaKey || event.ctrlKey) return nextGuides
    const rect = host.current?.getBoundingClientRect()
    const threshold =
      SNAP_DISTANCE_PX / Math.max(1e-6, shorter * ((rect?.width ?? box.width) / box.width))
    const xs = extents ? [point[0] - extents[0], point[0], point[0] + extents[0]] : [point[0]]
    const ys = extents ? [point[1] - extents[1], point[1], point[1] + extents[1]] : [point[1]]
    const snapX = nearestLine(xs, snapLines.x, threshold)
    const snapY = nearestLine(ys, snapLines.y, threshold)
    if (snapX) {
      point[0] += snapX.delta
      nextGuides.x = snapX.line
    }
    if (snapY) {
      point[1] += snapY.delta
      nextGuides.y = snapY.line
    }
    return nextGuides
  }

  const move = (event: ReactPointerEvent<Element>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointer) return
    event.stopPropagation()
    const point = fromEvent(event)
    const o = active.original
    const a = (o.rotation * Math.PI) / 180
    const ou: Point = [Math.cos(a), Math.sin(a)]
    const ov: Point = [-Math.sin(a), Math.cos(a)]
    let nextGuides: SnapGuides = { x: null, y: null }

    if (active.kind === "move") {
      let dx = point[0] - active.start[0]
      let dy = point[1] - active.start[1]
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const next: Point = [o.center[0] + dx, o.center[1] + dy]
      const hw = o.size[0] / 2
      const hh = o.size[1] / 2
      const extents: Point = isLine
        ? [Math.abs(ou[0]) * hw, Math.abs(ou[1]) * hw]
        : [
            Math.abs(ou[0]) * hw + Math.abs(ov[0]) * hh,
            Math.abs(ou[1]) * hw + Math.abs(ov[1]) * hh,
          ]
      nextGuides = snapPoint(next, event, extents)
      if (event.shiftKey) {
        if (dy === 0) {
          next[1] = o.center[1]
          nextGuides.y = null
        } else {
          next[0] = o.center[0]
          nextGuides.x = null
        }
      }
      callbacks.current.write({ center: next })
    } else if (active.kind === "rotate") {
      const startAngle = Math.atan2(active.start[1] - o.center[1], active.start[0] - o.center[0])
      const nowAngle = Math.atan2(point[1] - o.center[1], point[0] - o.center[0])
      let rotation = o.rotation + ((nowAngle - startAngle) * 180) / Math.PI
      if (event.shiftKey) rotation = Math.round(rotation / ROTATE_STEP) * ROTATE_STEP
      callbacks.current.write({ rotation: normalizeDegrees(rotation) })
    } else if (active.kind === "end") {
      nextGuides = snapPoint(point, event, null)
      const sign = active.which === "end" ? 1 : -1
      const other: Point = [
        o.center[0] - sign * ou[0] * (o.size[0] / 2),
        o.center[1] - sign * ou[1] * (o.size[0] / 2),
      ]
      let vx = sign * (point[0] - other[0])
      let vy = sign * (point[1] - other[1])
      if (event.shiftKey) {
        const length = Math.hypot(vx, vy)
        const step = (ROTATE_STEP * Math.PI) / 180
        const snapped = Math.round(Math.atan2(vy, vx) / step) * step
        vx = Math.cos(snapped) * length
        vy = Math.sin(snapped) * length
        nextGuides = { x: null, y: null }
      }
      const tip: Point = [other[0] + sign * vx, other[1] + sign * vy]
      callbacks.current.write({
        center: [(tip[0] + other[0]) / 2, (tip[1] + other[1]) / 2],
        rotation: normalizeDegrees((Math.atan2(vy, vx) * 180) / Math.PI),
        size: [clampSize(Math.hypot(vx, vy)), o.size[1]],
      })
    } else {
      nextGuides = snapPoint(point, event, null)
      const { sx, sy } = active
      const fromCenter = event.altKey
      const hw = o.size[0] / 2
      const hh = o.size[1] / 2
      const anchor: Point = fromCenter
        ? o.center
        : [
            o.center[0] - ou[0] * hw * sx - ov[0] * hh * sy,
            o.center[1] - ou[1] * hw * sx - ov[1] * hh * sy,
          ]
      const d: Point = [point[0] - anchor[0], point[1] - anchor[1]]
      const span = fromCenter ? 2 : 1
      let width = sx ? sx * (d[0] * ou[0] + d[1] * ou[1]) * span : o.size[0]
      let height = sy ? sy * (d[0] * ov[0] + d[1] * ov[1]) * span : o.size[1]
      width = Math.max(MIN_SIZE, width)
      height = Math.max(MIN_SIZE, height)
      if (locked || event.shiftKey) {
        const ratio = o.size[1] / Math.max(1e-6, o.size[0])
        const k = sx && sy
          ? Math.max(width / o.size[0], height / o.size[1])
          : sx
            ? width / o.size[0]
            : height / o.size[1]
        width = o.size[0] * k
        height = width * ratio
      }
      width = clampSize(width)
      height = clampSize(height)
      const center: Point = fromCenter
        ? o.center
        : [
            anchor[0] + ou[0] * (width / 2) * sx + ov[0] * (height / 2) * sy,
            anchor[1] + ou[1] * (width / 2) * sx + ov[1] * (height / 2) * sy,
          ]
      callbacks.current.write({ center, size: [width, height] })
    }

    if (nextGuides.x !== guides.x || nextGuides.y !== guides.y) setGuides(nextGuides)
  }
  const up = (event: ReactPointerEvent<Element>) => {
    if (event.pointerId !== drag.current?.pointer) return
    move(event)
    finish(true)
  }
  const cancelEvent = (event: ReactPointerEvent<Element>) => {
    if (event.pointerId === drag.current?.pointer) finish(false)
  }
  const interactive = (name: string, cursor: string, target: DragTarget) => ({
    style: {
      cursor: panning ? "inherit" : cursor,
      pointerEvents: "all" as const,
    },
    onPointerDown: begin(target),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: cancelEvent,
    onLostPointerCapture: cancelEvent,
    [`data-${dataPrefix}-handle`]: name,
  })

  const [pcx, pcy] = toPx(geometry.center)
  const corners = CORNERS.map(([sx, sy]) => toPx(local(sx, sy)))
  const polygon = corners.map(([x, y]) => `${x},${y}`).join(" ")
  const lineStart = toPx(local(-1, 0))
  const lineEnd = toPx(local(1, 0))
  const sizeLabel = `${Math.round((geometry.size[0] * shorter * documentSize.width) / box.width)} × ${Math.round((geometry.size[1] * shorter * documentSize.height) / box.height)}`
  const labelY = Math.max(...corners.map(([, y]) => y)) + 10

  return (
    <div
      ref={host}
      {...{ [`data-${dataPrefix}-handles`]: "true" }}
      className="pointer-events-none absolute inset-0 z-20"
    >
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-label={label}
        role="application"
      >
        {guides.x !== null ? (
          <line
            data-snap-guide="x"
            stroke={ACCENT}
            x1={toPx([guides.x, 0])[0]}
            x2={toPx([guides.x, 0])[0]}
            y1={0}
            y2={box.height}
          />
        ) : null}
        {guides.y !== null ? (
          <line
            data-snap-guide="y"
            stroke={ACCENT}
            x1={0}
            x2={box.width}
            y1={toPx([0, guides.y])[1]}
            y2={toPx([0, guides.y])[1]}
          />
        ) : null}
        {isLine ? (
          <>
            <line
              stroke="white"
              strokeOpacity={0.9}
              strokeWidth={3}
              x1={lineStart[0]}
              x2={lineEnd[0]}
              y1={lineStart[1]}
              y2={lineEnd[1]}
            />
            <line
              stroke={ACCENT}
              strokeWidth={1.5}
              x1={lineStart[0]}
              x2={lineEnd[0]}
              y1={lineStart[1]}
              y2={lineEnd[1]}
            />
            <circle
              cx={pcx}
              cy={pcy}
              fill="transparent"
              r={12}
              {...interactive("center", "move", { kind: "move" })}
            />
            <circle cx={pcx} cy={pcy} fill={ACCENT} pointerEvents="none" r={3} stroke="white" strokeWidth={1.5} />
            {(["start", "end"] as const).map((which) => {
              const [x, y] = which === "start" ? lineStart : lineEnd
              return (
                <circle
                  cx={x}
                  cy={y}
                  fill={which === "start" ? "black" : "white"}
                  key={which}
                  r={6}
                  stroke="white"
                  strokeWidth={2}
                  {...interactive(which, "crosshair", { kind: "end", which })}
                />
              )
            })}
          </>
        ) : (
          <>
            {outline === "ellipse" || outline === "radial" ? (
              <ellipse
                cx={pcx}
                cy={pcy}
                fill="none"
                pointerEvents="none"
                rx={half[0] * shorter}
                ry={half[1] * shorter}
                stroke={ACCENT}
                strokeDasharray={outline === "radial" ? "4 4" : undefined}
                strokeOpacity={0.7}
                transform={`rotate(${geometry.rotation} ${pcx} ${pcy})`}
              />
            ) : null}
            {variant === "mask" ? (
              <>
                <polygon
                  fill="none"
                  pointerEvents="none"
                  points={polygon}
                  stroke={ACCENT}
                  strokeDasharray="5 4"
                  strokeWidth={1}
                />
                <circle
                  cx={pcx}
                  cy={pcy}
                  fill="transparent"
                  r={12}
                  {...interactive("center", "move", { kind: "move" })}
                />
                <circle
                  cx={pcx}
                  cy={pcy}
                  fill="white"
                  pointerEvents="none"
                  r={4.5}
                  stroke={ACCENT}
                  strokeWidth={1.5}
                />
              </>
            ) : (
              <polygon
                fill="transparent"
                points={polygon}
                stroke={ACCENT}
                strokeWidth={1}
                {...interactive("center", dragging ? "grabbing" : "default", { kind: "move" })}
              />
            )}
            {rotatable
              ? CORNERS.map(([sx, sy], index) => {
                  const corner = corners[index]!
                  const outward: Point = [
                    u[0] * sx + v[0] * sy,
                    u[1] * sx + v[1] * sy,
                  ]
                  const length = Math.hypot(outward[0], outward[1]) || 1
                  return (
                    <circle
                      cx={corner[0] + (outward[0] / length) * ROTATE_ZONE_PX * 0.8}
                      cy={corner[1] + (outward[1] / length) * ROTATE_ZONE_PX * 0.8}
                      fill="transparent"
                      key={`rotate-${SIDE_NAMES[`${sx},${sy}`]}`}
                      r={ROTATE_ZONE_PX}
                      {...interactive(`rotate-${SIDE_NAMES[`${sx},${sy}`]}`, ROTATE_CURSOR, { kind: "rotate" })}
                    />
                  )
                })
              : null}
            {locked
              ? null
              : EDGES.map(([sx, sy]) => {
                  const a = toPx(local(sx === 0 ? -1 : sx, sy === 0 ? -1 : sy))
                  const b = toPx(local(sx === 0 ? 1 : sx, sy === 0 ? 1 : sy))
                  const direction: Point = [u[0] * sx + v[0] * sy, u[1] * sx + v[1] * sy]
                  return (
                    <line
                      key={SIDE_NAMES[`${sx},${sy}`]}
                      stroke="transparent"
                      strokeWidth={10}
                      x1={a[0]}
                      x2={b[0]}
                      y1={a[1]}
                      y2={b[1]}
                      {...interactive(SIDE_NAMES[`${sx},${sy}`]!, resizeCursor(direction), {
                        kind: "resize",
                        sx,
                        sy,
                      })}
                    />
                  )
                })}
            {CORNERS.map(([sx, sy], index) => {
              const [x, y] = corners[index]!
              const direction: Point = [u[0] * sx + v[0] * sy, u[1] * sx + v[1] * sy]
              const target = interactive(SIDE_NAMES[`${sx},${sy}`]!, resizeCursor(direction), {
                kind: "resize",
                sx,
                sy,
              })
              return variant === "mask" ? (
                <circle
                  cx={x}
                  cy={y}
                  fill="white"
                  key={SIDE_NAMES[`${sx},${sy}`]}
                  r={HANDLE_PX / 2}
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  {...target}
                />
              ) : (
                <rect
                  fill="white"
                  height={HANDLE_PX}
                  key={SIDE_NAMES[`${sx},${sy}`]}
                  stroke={ACCENT}
                  strokeWidth={1}
                  transform={`rotate(${geometry.rotation} ${x} ${y})`}
                  width={HANDLE_PX}
                  x={x - HANDLE_PX / 2}
                  y={y - HANDLE_PX / 2}
                  {...target}
                />
              )
            })}
          </>
        )}
      </svg>
      {isLine || variant === "mask" ? null : (
        <div
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[var(--ds-color-accent)] px-1.5 py-0.5 font-[var(--ds-font-mono)] text-[10px] leading-3 text-[#ffffff]"
          data-geometry-size-label="true"
          style={{ left: pcx, top: labelY }}
        >
          {sizeLabel}
        </div>
      )}
    </div>
  )
}

export function isEditableLayerChain(
  layers: { id: string; parentId?: string | null; locked: boolean; visible: boolean }[],
  layer: { id: string; parentId?: string | null; locked: boolean; visible: boolean }
): boolean {
  let current: typeof layer | undefined = layer
  const visited = new Set<string>()
  while (current) {
    if (current.locked || !current.visible || visited.has(current.id))
      return false
    visited.add(current.id)
    current = layers.find((item) => item.id === current?.parentId)
  }
  return true
}
