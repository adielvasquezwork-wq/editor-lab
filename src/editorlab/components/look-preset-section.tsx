"use client"

import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import {
  applyLookPreset,
  clearLookPreset,
  detectAppliedLook,
  isLookLayerName,
  LOOK_PRESETS,
} from "@/editorlab/presets/look-presets"
import { useLayerStore } from "@/store/layer-store"

/**
 * One-click documentary looks (Jani / CHUPPL / fern). Each adds its effect
 * layers at the top of the stack (named "Look · …") and sets the scene's
 * colour, vignette, split tone and letterbox. Applying another look
 * replaces the previous one; everything stays editable afterwards.
 */
export function LookPresetSection() {
  const lookLayerNames = useLayerStore((state) =>
    state.layers
      .filter((layer) => isLookLayerName(layer.name))
      .map((layer) => layer.name)
      .join("\n")
  )
  const names = lookLayerNames ? lookLayerNames.split("\n") : []
  const activeId = detectAppliedLook(names)
  const active = LOOK_PRESETS.find((preset) => preset.id === activeId)

  return (
    <section
      aria-label="Look presets"
      className="flex flex-col gap-2 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
    >
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          Look
        </Typography>
        {names.length > 0 ? (
          <button
            className="cursor-pointer text-[11px] text-[var(--ds-color-text-tertiary)] hover:text-[var(--ds-color-text-primary)]"
            onClick={clearLookPreset}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LOOK_PRESETS.map((preset) => (
          <Button
            data-state={preset.id === activeId ? "active" : undefined}
            key={preset.id}
            onClick={() => applyLookPreset(preset.id)}
            size="compact"
            title={preset.description}
            variant="secondary"
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <Typography tone="muted" variant="caption">
        {active
          ? active.description
          : "Adds grade, vignette and effect layers on top. Applying another look replaces it."}
      </Typography>
    </section>
  )
}
