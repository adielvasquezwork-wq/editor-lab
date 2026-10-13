"use client"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"
import { AnnotationsPalette } from "./annotations-controls"
import {
  ConnectedDotsControls,
  ConnectedDotsPalette,
} from "./connected-dots-controls"
import { DotGridControls } from "./dot-grid-controls"
import { ErosionControls } from "./erosion-controls"
import { FlaresControls } from "./flares-controls"
import { FocusBlurControls } from "./focus-blur-controls"
import { GlassControls } from "./glass-controls"
import { GradientMapControls } from "./gradient-map-controls"
import { GrainControls } from "./grain-controls"
import { LumenPrintControls } from "./lumen-print-controls"
import { OutlineControls } from "./outline-controls"
import { PhotocopyControls } from "./photocopy-controls"
import { PlotterControls } from "./plotter-controls"
import type { TimelineKeyframeControl } from "./properties-sidebar-fields"
import { ReliefControls } from "./relief-controls"
import { SignalRotControls } from "./signal-rot-controls"

type EffectControlProps = {
  layerType: string
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
}

export function EffectStyleControls({
  layerType,
  gradientMapTimelineControl = null,
  ...props
}: EffectControlProps & {
  gradientMapTimelineControl?: TimelineKeyframeControl | null
}) {
  const { layerId, values, updateLayerParam } = props
  const simple = { layerId, updateLayerParam, values }
  switch (layerType) {
    case "gradient-map":
      return (
        <GradientMapControls
          {...props}
          timelineControl={gradientMapTimelineControl}
        />
      )
    case "lumen-print":
      return <LumenPrintControls {...props} />
    case "connected-dots":
      return <ConnectedDotsControls {...props} />
    case "grain":
      return <GrainControls {...simple} />
    case "signal-rot":
      return <SignalRotControls {...simple} />
    case "dot-grid":
      return <DotGridControls {...simple} />
    case "erosion":
      return <ErosionControls {...simple} />
    case "relief":
      return <ReliefControls {...simple} />
    case "flares":
      return <FlaresControls {...simple} />
    case "focus-blur":
      return <FocusBlurControls {...simple} />
    case "outline":
      return <OutlineControls {...simple} />
    case "photocopy":
      return <PhotocopyControls {...simple} />
    case "plotter":
      return <PlotterControls {...simple} />
    case "glass":
      return <GlassControls {...simple} />
    default:
      return null
  }
}

export function EffectPaletteControls({
  layerType,
  paramKey,
  ...props
}: EffectControlProps & { paramKey: string }) {
  const { values } = props
  if (
    layerType === "annotations" &&
    paramKey === "colorMode" &&
    values.colorMode === "palette"
  ) {
    return <AnnotationsPalette {...props} />
  }
  if (
    layerType === "connected-dots" &&
    paramKey === "colorMode" &&
    (values.colorMode ?? "palette") === "palette"
  ) {
    return <ConnectedDotsPalette {...props} />
  }
  return null
}
