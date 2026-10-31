"use client"

import { ColorPicker } from "@/components/ui/color-picker"
import { Select } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { useEditorStore } from "@/store/editor-store"
import { DEFAULT_SCENE_LETTERBOX, type SceneLetterbox } from "@/types/editor"

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

/** Letterbox bars for the whole frame. (Vignette and split tone are effect layers.) */
export function SceneFilmSection() {
  const letterbox = useEditorStore((state) => state.sceneConfig.letterbox)
  const updateSceneConfig = useEditorStore((state) => state.updateSceneConfig)

  const patchLetterbox = (patch: Partial<SceneLetterbox>) =>
    updateSceneConfig({
      letterbox: { ...(letterbox ?? DEFAULT_SCENE_LETTERBOX), ...patch },
    })
  return (
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
  )
}
