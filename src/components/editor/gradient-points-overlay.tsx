"use client"
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer, LayerParameterValues } from "@/types/editor"
import { isEditableLayerChain } from "./geometry-handles"

type Drag = {
  index: number
  pointer: number
  kind: "move" | "weight"
  start: [number, number]
  original: [number, number]
  originalWeight: number
}

const POSITION_LIMIT = 2.5
const POINT_NAMES = ["point1", "point2", "point3", "point4", "point5"] as const
const MIN_WEIGHT = 0.1
const MAX_WEIGHT = 3

function selectGradientLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  if (!layer || layer.type !== "gradient") return null
  return isEditableLayerChain(state.layers, layer) ? layer : null
}

function readPoint(params: LayerParameterValues, index: number) {
  const position = params[`point${index + 1}Position`]
  const weight = params[`point${index + 1}Weight`]
  const color = params[`point${index + 1}Color`]
  return {
    color: typeof color === "string" ? color : "#ffffff",
    position: (Array.isArray(position) && position.length === 2
      ? [Number(position[0]), Number(position[1])]
      : [0, 0]) as [number, number],
    weight: typeof weight === "number" ? weight : 1,
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function GradientPointsOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectGradientLayer)
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const colorInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [box, setBox] = useState({ width: 1, height: 1 })

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

  if (!layer || disabled)
    return (
      <div
        ref={host}
        className="pointer-events-none absolute inset-0 z-20"
        data-gradient-points="true"
      />
    )
  const id = layer.id
  const params = layer.params
  const count = clamp(
    Math.round(typeof params.activePoints === "number" ? params.activePoints : 5),
    2,
    5
  )
  const halfHeight = box.height / 2
  const toPx = ([x, y]: [number, number]): [number, number] => [
    box.width / 2 + x * halfHeight,
    box.height / 2 + y * halfHeight,
  ]
  const units = (event: ReactPointerEvent<Element>): [number, number] => {
    const rect = host.current!.getBoundingClientRect()
    const scale = rect.height / box.height
    return [
      (event.clientX - rect.left - rect.width / 2) / (halfHeight * scale),
      (event.clientY - rect.top - rect.height / 2) / (halfHeight * scale),
    ]
  }
  const write = (key: string, value: [number, number] | number | string) =>
    useLayerStore.getState().updateLayerParam(id, key, value)

  const begin = (index: number) => (event: ReactPointerEvent<SVGElement>) => {
    if (panning || event.button !== 0 || drag.current) return
    event.preventDefault()
    event.stopPropagation()
    const point = readPoint(
      useLayerStore.getState().layers.find((l) => l.id === id)?.params ?? params,
      index
    )
    drag.current = {
      index,
      pointer: event.pointerId,
      kind: event.altKey ? "weight" : "move",
      start: units(event),
      original: point.position,
      originalWeight: point.weight,
    }
    useEditorStore.getState().beginInteractiveEdit()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<SVGElement>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointer) return
    const [x, y] = units(event)
    if (active.kind === "weight") {
      const next = clamp(active.originalWeight - (y - active.start[1]) * 2, MIN_WEIGHT, MAX_WEIGHT)
      write(`point${active.index + 1}Weight`, Math.round(next * 100) / 100)
      return
    }
    let dx = x - active.start[0]
    let dy = y - active.start[1]
    if (event.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    write(`point${active.index + 1}Position`, [
      Math.round(clamp(active.original[0] + dx, -POSITION_LIMIT, POSITION_LIMIT) * 1000) / 1000,
      Math.round(clamp(active.original[1] + dy, -POSITION_LIMIT, POSITION_LIMIT) * 1000) / 1000,
    ])
  }
  const end = (event: ReactPointerEvent<SVGElement>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointer) return
    drag.current = null
    useEditorStore.getState().endInteractiveEdit()
  }
  const pickColor = (index: number) => {
    setEditing(index)
    const input = colorInput.current
    if (!input) return
    input.value = readPoint(params, index).color.slice(0, 7)
    input.click()
  }

  return (
    <div
      ref={host}
      className="pointer-events-none absolute inset-0 z-20"
      data-gradient-points="true"
    >
      <svg aria-label="Gradient color points" className="absolute inset-0 h-full w-full overflow-visible" role="application">
        {POINT_NAMES.slice(0, count).map((name, index) => {
          const point = readPoint(params, index)
          const [x, y] = toPx(point.position)
          const reach = 10 + point.weight * 8
          return (
            <g key={name}>
              <circle
                cx={x}
                cy={y}
                fill="none"
                pointerEvents="none"
                r={reach}
                stroke="white"
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              <circle
                cx={x}
                cy={y}
                aria-label={`Color point ${index + 1}`}
                data-gradient-point={index + 1}
                role="button"
                fill={point.color}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  pickColor(index)
                }}
                onLostPointerCapture={end}
                onPointerCancel={end}
                onPointerDown={begin(index)}
                onPointerMove={move}
                onPointerUp={end}
                r={9}
                stroke="white"
                strokeWidth={2.5}
                style={{
                  cursor: panning ? "inherit" : "grab",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
                  pointerEvents: "all",
                }}
              />
            </g>
          )
        })}
      </svg>
      <input
        aria-label="Gradient point color"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onChange={(event) => {
          if (editing === null) return
          write(`point${editing + 1}Color`, event.currentTarget.value)
        }}
        ref={colorInput}
        style={
          editing === null
            ? undefined
            : {
                left: toPx(readPoint(params, editing).position)[0],
                top: toPx(readPoint(params, editing).position)[1],
              }
        }
        tabIndex={-1}
        type="color"
      />
    </div>
  )
}
