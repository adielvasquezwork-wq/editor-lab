"use client"

import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { setLayerTimeStep } from "@/editorlab/timing/layer-time-step"
import {
  DEFAULT_TIME_STEP,
  TIME_STEP_FPS_OPTIONS,
  TIME_STEP_FRAME_OPTIONS,
} from "@/editorlab/timing/time-step"
import { useLayerStore } from "@/store/layer-store"

const FRAME_OPTIONS = TIME_STEP_FRAME_OPTIONS.map((n) => ({
  label: `On ${n}s`,
  value: String(n),
}))

const FPS_OPTIONS = TIME_STEP_FPS_OPTIONS.map((fps) => ({
  label: `${fps} fps`,
  value: String(fps),
}))

function Row({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
      <Typography tone="secondary" variant="label">
        {label}
      </Typography>
      {children}
    </div>
  )
}

/**
 * Stepped timing ("on twos/threes") for a layer or a whole group. Only this
 * layer (or what's inside the group) steps; everything else keeps full rate.
 */
export function TimeStepSection({ layerId }: { layerId: string }) {
  const step = useLayerStore(
    (state) =>
      state.layers.find((entry) => entry.id === layerId)?.timeStep ?? null
  )
  const isGroup = useLayerStore(
    (state) =>
      state.layers.find((entry) => entry.id === layerId)?.kind === "group"
  )
  const patch = (update: Partial<typeof DEFAULT_TIME_STEP>) =>
    setLayerTimeStep(layerId, { ...(step ?? DEFAULT_TIME_STEP), ...update })

  return (
    <section
      aria-label="Stepped timing"
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
    >
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          Stepped timing
        </Typography>
        <Toggle
          aria-label="Stepped timing"
          checked={step !== null}
          onCheckedChange={(checked) =>
            setLayerTimeStep(layerId, checked ? DEFAULT_TIME_STEP : null)
          }
        />
      </div>
      {step ? (
        <div className="flex flex-col gap-[10px]">
          <Row label="Hold">
            <Select
              onValueChange={(value) => {
                const n = Number.parseInt(String(value), 10)
                if (Number.isFinite(n)) patch({ n })
              }}
              options={FRAME_OPTIONS}
              value={String(step.n)}
            />
          </Row>
          <Row label="Count at">
            <Select
              onValueChange={(value) => {
                const fps = Number.parseFloat(String(value))
                if (Number.isFinite(fps)) patch({ fps })
              }}
              options={FPS_OPTIONS}
              value={String(step.fps)}
            />
          </Row>
          <Row label="Offset (frames)">
            <NumberInput
              aria-label="Step offset in frames"
              max={step.n - 1}
              min={0}
              onChange={(offset) => {
                if (Number.isFinite(offset)) {
                  patch({ offset: Math.round(offset) })
                }
              }}
              step={1}
              value={step.offset}
            />
          </Row>
          <Typography tone="muted" variant="caption">
            {isGroup
              ? "Everything in this group holds each frame; layers outside keep moving at full rate."
              : "This layer holds each frame; other layers keep moving at full rate."}{" "}
            Export at {step.fps} fps for exact {step.n}-frame holds.
          </Typography>
        </div>
      ) : null}
    </section>
  )
}
