"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"
import { keyLeakAtPlayhead, keyWhipAtPlayhead } from "@/editorlab/motion/keying"
import { formatTimecode } from "@/editorlab/timing/frame-rate"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

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
 * One-click motion keying for the effects that carry a transition: a whip
 * blur (directional blur 0 → peak → 0, peak one frame before the playhead)
 * and a light-leak sweep (progress 0 → 1 across the playhead).
 */
export function MotionSection({ layerId }: { layerId: string }) {
  const type = useLayerStore(
    (state) => state.layers.find((entry) => entry.id === layerId)?.type ?? null
  )
  const currentTime = useTimelineStore((state) => state.currentTime)
  const frameRate = useTimelineStore((state) => state.frameRate)
  const [peak, setPeak] = useState(40)
  const [ramp, setRamp] = useState(6)
  const [leakFrames, setLeakFrames] = useState(16)

  if (
    type !== "directional-blur" &&
    type !== "velocity-blur" &&
    type !== "light-leak"
  ) {
    return null
  }
  const whipParam = type === "velocity-blur" ? "Speed" : "Strength"

  const playhead = formatTimecode(currentTime, frameRate)

  return (
    <section
      aria-label="Motion"
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Motion
      </Typography>
      {type === "directional-blur" || type === "velocity-blur" ? (
        <div className="flex flex-col gap-[10px]">
          <Row label={`Peak ${whipParam.toLowerCase()}`}>
            <NumberInput
              aria-label="Whip peak"
              max={type === "velocity-blur" ? 400 : 96}
              min={0}
              onChange={(value) => {
                if (Number.isFinite(value)) setPeak(value)
              }}
              step={1}
              value={peak}
            />
          </Row>
          <Row label="Ramp (frames)">
            <NumberInput
              aria-label="Whip ramp frames"
              max={48}
              min={1}
              onChange={(value) => {
                if (Number.isFinite(value)) setRamp(Math.round(value))
              }}
              step={1}
              value={ramp}
            />
          </Row>
          <Button
            onClick={() => {
              keyWhipAtPlayhead(layerId, { peak, rampFrames: ramp })
              playUISound("action.addLayer")
            }}
            size="compact"
            variant="secondary"
          >
            Key whip at {playhead}
          </Button>
          <Typography tone="muted" variant="caption">
            Writes {whipParam} keyframes 0 → {peak} → 0 with the house easing.
            {type === "velocity-blur" ? " Switches Speed From to Manual." : ""}{" "}
            The peak lands one frame before the playhead, so put the playhead on
            the cut.
          </Typography>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <Row label="Length (frames)">
            <NumberInput
              aria-label="Leak transition frames"
              max={120}
              min={2}
              onChange={(value) => {
                if (Number.isFinite(value)) setLeakFrames(Math.round(value))
              }}
              step={1}
              value={leakFrames}
            />
          </Row>
          <Button
            onClick={() => {
              keyLeakAtPlayhead(layerId, { frames: leakFrames })
              playUISound("action.addLayer")
            }}
            size="compact"
            variant="secondary"
          >
            Key leak across {playhead}
          </Button>
          <Typography tone="muted" variant="caption">
            Writes Progress keyframes 0 → 1 over {leakFrames} frames centred on
            the playhead. The leak is invisible at both ends.
          </Typography>
        </div>
      )}
    </section>
  )
}
