"use client"

import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { formatTimecode } from "@/editorlab/timing/frame-rate"
import { setLayerFreeze } from "@/editorlab/timing/layer-time-step"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

const formatSeconds = (value: number) => `${value.toFixed(2)}s`
const parseSeconds = (raw: string) => Number.parseFloat(raw.replace(/s$/i, ""))

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
 * Freeze frame (style ref C3: hold, then hard cut). The layer, or everything
 * in the group, holds the frame at `from` for `length` seconds and then
 * resumes from where it paused. Layers outside keep moving.
 */
export function FreezeFrameSection({ layerId }: { layerId: string }) {
  const freeze = useLayerStore(
    (state) =>
      state.layers.find((entry) => entry.id === layerId)?.freeze ?? null
  )
  const isGroup = useLayerStore(
    (state) =>
      state.layers.find((entry) => entry.id === layerId)?.kind === "group"
  )
  const frameRate = useTimelineStore((state) => state.frameRate)
  const playhead = () => useTimelineStore.getState().currentTime
  const patch = (update: Partial<{ from: number; length: number }>) =>
    setLayerFreeze(layerId, {
      ...(freeze ?? { from: playhead(), length: 1 }),
      ...update,
    })

  return (
    <section
      aria-label="Freeze frame"
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
    >
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          Freeze frame
        </Typography>
        <Toggle
          aria-label="Freeze frame"
          checked={freeze !== null}
          onCheckedChange={(checked) =>
            setLayerFreeze(
              layerId,
              checked ? { from: playhead(), length: 1 } : null
            )
          }
        />
      </div>
      {freeze ? (
        <div className="flex flex-col gap-[10px]">
          <Row label="Hold frame at">
            <NumberInput
              aria-label="Freeze start"
              formatValue={formatSeconds}
              min={0}
              onChange={(from) => {
                if (Number.isFinite(from)) patch({ from })
              }}
              parseValue={parseSeconds}
              step={1 / frameRate}
              value={freeze.from}
            />
          </Row>
          <Row label="Hold for">
            <NumberInput
              aria-label="Freeze length"
              formatValue={formatSeconds}
              min={1 / frameRate}
              onChange={(length) => {
                if (Number.isFinite(length) && length > 0) patch({ length })
              }}
              parseValue={parseSeconds}
              step={1 / frameRate}
              value={freeze.length}
            />
          </Row>
          <div className="flex items-center justify-between gap-2">
            <Typography tone="muted" variant="caption">
              Frame {formatTimecode(freeze.from, frameRate)} · resumes at{" "}
              {formatTimecode(freeze.from + freeze.length, frameRate)}
            </Typography>
            <Button
              onClick={() => patch({ from: playhead() })}
              size="compact"
              title="Hold the frame under the playhead"
              variant="ghost"
            >
              Use playhead
            </Button>
          </div>
          <Typography tone="muted" variant="caption">
            {isGroup
              ? "Everything in this group holds that frame, then carries on from where it paused."
              : "This layer holds that frame, then carries on from where it paused."}{" "}
            Layers outside keep moving.
          </Typography>
        </div>
      ) : null}
    </section>
  )
}
