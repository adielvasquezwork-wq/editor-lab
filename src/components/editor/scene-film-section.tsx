"use client"

import { ColorPicker } from "@/components/ui/color-picker"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { useEditorStore } from "@/store/editor-store"
import {
  DEFAULT_SCENE_LETTERBOX,
  DEFAULT_SCENE_SPLIT_TONE,
  DEFAULT_SCENE_VIGNETTE,
  type SceneLetterbox,
  type SceneSplitTone,
  type SceneVignette,
} from "@/types/editor"

const LETTERBOX_ASPECTS = [
  { label: "1.85 : 1 (flat)", value: "1.85" },
  { label: "2 : 1", value: "2" },
  { label: "2.39 : 1 (scope)", value: "2.39" },
  { label: "1 : 1 (pillarbox)", value: "1" },
  { label: "4 : 5 (pillarbox)", value: "0.8" },
]

function Section({
  children,
  enabled,
  onToggle,
  title,
}: {
  children: React.ReactNode
  enabled: boolean
  onToggle: (enabled: boolean) => void
  title: string
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4">
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          {title}
        </Typography>
        <Toggle checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled ? (
        <div className="flex flex-col gap-[10px]">{children}</div>
      ) : null}
    </section>
  )
}

function ColorRow({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Typography variant="label">{label}</Typography>
      <ColorPicker onValueChange={onChange} value={value} />
    </div>
  )
}

/** Vignette, letterbox and split tone: the scene's film finish. */
export function SceneFilmSection() {
  const vignette = useEditorStore((state) => state.sceneConfig.vignette)
  const letterbox = useEditorStore((state) => state.sceneConfig.letterbox)
  const splitTone = useEditorStore((state) => state.sceneConfig.splitTone)
  const updateSceneConfig = useEditorStore((state) => state.updateSceneConfig)

  const patchVignette = (patch: Partial<SceneVignette>) =>
    updateSceneConfig({
      vignette: { ...(vignette ?? DEFAULT_SCENE_VIGNETTE), ...patch },
    })
  const patchLetterbox = (patch: Partial<SceneLetterbox>) =>
    updateSceneConfig({
      letterbox: { ...(letterbox ?? DEFAULT_SCENE_LETTERBOX), ...patch },
    })
  const patchSplitTone = (patch: Partial<SceneSplitTone>) =>
    updateSceneConfig({
      splitTone: { ...(splitTone ?? DEFAULT_SCENE_SPLIT_TONE), ...patch },
    })

  return (
    <>
      <Section
        enabled={Boolean(vignette)}
        onToggle={(enabled) =>
          updateSceneConfig({
            vignette: enabled ? { ...DEFAULT_SCENE_VIGNETTE } : undefined,
          })
        }
        title="Vignette"
      >
        {vignette ? (
          <>
            <Slider
              label="Amount"
              max={400}
              min={0}
              onValueChange={(value) => patchVignette({ amount: value / 100 })}
              value={vignette.amount * 100}
              valueSuffix=" ev"
              valueFormatOptions={{ maximumFractionDigits: 0 }}
            />
            <Slider
              label="Inner"
              max={100}
              min={0}
              onValueChange={(value) =>
                patchVignette({
                  inner: value / 100,
                  outer: Math.max(vignette.outer, value / 100 + 0.01),
                })
              }
              value={vignette.inner * 100}
            />
            <Slider
              label="Outer"
              max={150}
              min={1}
              onValueChange={(value) =>
                patchVignette({
                  outer: Math.max(value / 100, vignette.inner + 0.01),
                })
              }
              value={vignette.outer * 100}
            />
            <Slider
              label="Roundness"
              max={100}
              min={0}
              onValueChange={(value) =>
                patchVignette({ roundness: value / 100 })
              }
              value={vignette.roundness * 100}
            />
            <Typography tone="muted" variant="caption">
              Amount is in hundredths of a stop (100 = 1 stop), in linear light.
            </Typography>
          </>
        ) : null}
      </Section>

      <Section
        enabled={Boolean(letterbox)}
        onToggle={(enabled) =>
          updateSceneConfig({
            letterbox: enabled ? { ...DEFAULT_SCENE_LETTERBOX } : undefined,
          })
        }
        title="Letterbox"
      >
        {letterbox ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <Typography variant="label">Aspect</Typography>
              <Select
                onValueChange={(value) => {
                  const aspect = Number.parseFloat(String(value))
                  if (Number.isFinite(aspect)) patchLetterbox({ aspect })
                }}
                options={LETTERBOX_ASPECTS}
                value={
                  LETTERBOX_ASPECTS.find(
                    (option) => Number(option.value) === letterbox.aspect
                  )?.value ?? String(letterbox.aspect)
                }
              />
            </div>
            <ColorRow
              label="Bar color"
              onChange={(color) => patchLetterbox({ color })}
              value={letterbox.color}
            />
          </>
        ) : null}
      </Section>

      <Section
        enabled={Boolean(splitTone)}
        onToggle={(enabled) =>
          updateSceneConfig({
            splitTone: enabled ? { ...DEFAULT_SCENE_SPLIT_TONE } : undefined,
          })
        }
        title="Split Tone"
      >
        {splitTone ? (
          <>
            <ColorRow
              label="Shadows"
              onChange={(shadowColor) => patchSplitTone({ shadowColor })}
              value={splitTone.shadowColor}
            />
            <Slider
              label="Shadow amount"
              max={100}
              min={0}
              onValueChange={(value) =>
                patchSplitTone({ shadowAmount: value / 100 })
              }
              value={splitTone.shadowAmount * 100}
            />
            <ColorRow
              label="Highlights"
              onChange={(highlightColor) => patchSplitTone({ highlightColor })}
              value={splitTone.highlightColor}
            />
            <Slider
              label="Highlight amount"
              max={100}
              min={0}
              onValueChange={(value) =>
                patchSplitTone({ highlightAmount: value / 100 })
              }
              value={splitTone.highlightAmount * 100}
            />
            <Slider
              label="Balance"
              max={100}
              min={-100}
              onValueChange={(value) =>
                patchSplitTone({ balance: value / 100 })
              }
              value={splitTone.balance * 100}
            />
          </>
        ) : null}
      </Section>
    </>
  )
}
