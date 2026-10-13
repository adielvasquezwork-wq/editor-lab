"use client"
import { useMemo } from "react"
import { getDocumentSize } from "@/lib/editor/composition"
import { normalizeTextFontWeight, resolveTextFontFamily } from "@/lib/editor/text-fonts"
import {
  offsetFromPivotUnits,
  textAnchorPlacement,
  textFontSize,
  textPivotUnits,
} from "@/lib/editor/text-geometry"
import {
  measureTextBlock,
  resolveLineHeight,
  resolveTextAlign,
} from "@/renderer/text-layout"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { canEditTextLayer, useTextEditStore } from "@/store/text-edit-store"
import type { EditorLayer, LayerParameterValues, Size } from "@/types/editor"
import { type Geometry, GeometryHandles } from "./geometry-handles"

function selectTextLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  return layer && canEditTextLayer(state.layers, layer.id) ? layer : null
}

let measureContext: CanvasRenderingContext2D | null = null
function measure(params: LayerParameterValues, logical: Size): [number, number] {
  if (typeof document === "undefined") return [0.5, 0.1]
  measureContext ??= document.createElement("canvas").getContext("2d")
  const shorter = Math.max(1, Math.min(logical.width, logical.height))
  const fontSize = textFontSize(params)
  if (!measureContext) return [fontSize / shorter, fontSize / shorter]
  const family = typeof params.fontFamily === "string" ? params.fontFamily : "sans"
  const weight = normalizeTextFontWeight(
    family,
    typeof params.fontWeight === "number" ? params.fontWeight : 700
  )
  measureContext.font = `${weight} ${fontSize}px ${resolveTextFontFamily(family)}`
  const block = measureTextBlock(
    measureContext,
    typeof params.text === "string" && params.text ? params.text : "basement.studio",
    fontSize,
    typeof params.letterSpacing === "number" ? params.letterSpacing : -0.05,
    resolveLineHeight(params.lineHeight)
  )
  return [Math.max(0.02, block.width / shorter), Math.max(0.02, block.height / shorter)]
}

function blockOffset(
  params: LayerParameterValues,
  size: [number, number]
): [number, number] {
  const placement = textAnchorPlacement(params.anchor)
  const align = resolveTextAlign(params.align)
  const horizontal = align === "auto" ? placement.horizontal : align
  const side = { bottom: -1, center: 0, left: 1, right: -1, top: 1 } as const
  return [
    (side[horizontal] * size[0]) / 2,
    (side[placement.vertical] * size[1]) / 2,
  ]
}

function rotate([x, y]: [number, number], degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

export function TextHandlesOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectTextLayer)
  const editing = useTextEditStore((s) => s.layerId)
  const sceneConfig = useEditorStore((s) => s.sceneConfig)
  const outputSize = useEditorStore((s) => s.outputSize)
  const canvasSize = useEditorStore((s) => s.canvasSize)
  const logical = useMemo(
    () => getDocumentSize(sceneConfig, outputSize) ?? canvasSize,
    [sceneConfig, outputSize, canvasSize]
  )
  if (!layer || disabled || editing === layer.id) return null
  const id = layer.id
  const geometryOf = (params: LayerParameterValues): Geometry => {
    const size = measure(params, logical)
    const rotation = typeof params.rotation === "number" ? params.rotation : 0
    const [px, py] = textPivotUnits(params, logical)
    const [ox, oy] = rotate(blockOffset(params, size), rotation)
    return { center: [px + ox, py + oy], size, rotation }
  }
  const read = () =>
    geometryOf(
      useLayerStore.getState().layers.find((l) => l.id === id)?.params ?? layer.params
    )
  const write = (updates: Partial<Geometry>) => {
    const store = useLayerStore.getState()
    const params = store.layers.find((l) => l.id === id)?.params ?? layer.params
    const current = geometryOf(params)
    const target = { ...current, ...updates }
    let fontSize = textFontSize(params)
    if (updates.size) {
      const ratio = target.size[1] / Math.max(1e-6, current.size[1])
      const next = Math.round(Math.min(600, Math.max(8, fontSize * ratio)))
      if (next !== fontSize) {
        store.updateLayerParam(id, "fontSize", next)
        fontSize = next
      }
    }
    if (updates.rotation !== undefined && updates.rotation !== current.rotation)
      store.updateLayerParam(id, "rotation", updates.rotation)
    const next = { ...params, fontSize, rotation: target.rotation }
    const [ox, oy] = rotate(blockOffset(next, measure(next, logical)), target.rotation)
    store.updateLayerParam(
      id,
      "offset",
      offsetFromPivotUnits(next, logical, [target.center[0] - ox, target.center[1] - oy])
    )
  }
  return (
    <GeometryHandles
      aspect="locked"
      key={id}
      dataPrefix="text"
      label="Text handles"
      geometry={geometryOf(layer.params)}
      outline="none"
      panning={panning}
      read={read}
      write={write}
      restore={write}
    />
  )
}
