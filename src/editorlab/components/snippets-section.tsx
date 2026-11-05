"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  deleteSnippet,
  type EffectSnippet,
  saveSnippet,
  snippetParamUpdates,
  snippetsForEffect,
} from "@/editorlab/stack/snippets"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { useLayerStore } from "@/store/layer-store"

/**
 * Saved settings for this effect ("snippets"). Save the current params under
 * a name, apply one later to any layer of the same effect, delete the ones
 * you no longer want. Stored in this browser.
 */
export function SnippetsSection({ layerId }: { layerId: string }) {
  const layer = useLayerStore(
    (state) => state.layers.find((entry) => entry.id === layerId) ?? null
  )
  const updateLayerParam = useLayerStore((state) => state.updateLayerParam)
  const [snippets, setSnippets] = useState<EffectSnippet[]>([])
  const [selected, setSelected] = useState<string>("")
  const effect = layer?.type ?? null

  const refresh = useCallback(() => {
    if (!effect) return
    const next = snippetsForEffect(effect)
    setSnippets(next)
    setSelected((current) =>
      next.some((snippet) => snippet.id === current)
        ? current
        : (next[0]?.id ?? "")
    )
  }, [effect])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!(layer && effect) || getLayerDefinition(effect).kind !== "effect") {
    return null
  }

  const current = snippets.find((snippet) => snippet.id === selected) ?? null

  const handleSave = () => {
    const name = window.prompt(
      "Snippet name",
      `${layer.name} ${new Date().toLocaleDateString()}`
    )
    if (name === null) return
    const snippet = saveSnippet(name, layer)
    refresh()
    setSelected(snippet.id)
  }

  const handleApply = () => {
    if (!current) return
    for (const [key, value] of snippetParamUpdates(current, effect)) {
      updateLayerParam(layerId, key, value)
    }
  }

  const handleDelete = () => {
    if (!current) return
    deleteSnippet(current.id)
    refresh()
  }

  return (
    <section
      aria-label="Snippets"
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
    >
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          Snippets
        </Typography>
        <Button onClick={handleSave} size="compact" variant="ghost">
          Save current…
        </Button>
      </div>
      {snippets.length > 0 ? (
        <div className="flex flex-col gap-[10px]">
          <Select
            onValueChange={(value) => setSelected(String(value))}
            options={snippets.map((snippet) => ({
              label: snippet.name,
              value: snippet.id,
            }))}
            triggerAriaLabel="Saved snippet"
            value={selected}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={!current}
              onClick={handleDelete}
              size="compact"
              variant="ghost"
            >
              Delete
            </Button>
            <Button
              disabled={!current}
              onClick={handleApply}
              size="compact"
              variant="secondary"
            >
              Apply
            </Button>
          </div>
        </div>
      ) : (
        <Typography tone="muted" variant="caption">
          Save this effect's settings to reuse them on another layer or project.
          Snippets stay in this browser.
        </Typography>
      )}
    </section>
  )
}
