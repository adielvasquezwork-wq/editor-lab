"use client"

import { useEffect, useEffectEvent } from "react"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { requestDraftSave } from "@/lib/editor/draft-save-bus"
import { rippleDeleteLayers, splitLayersAt } from "@/lib/editor/clip-editing"
import { duplicateLayers } from "@/lib/editor/duplicate-layers"
import { isEditableTarget } from "@/lib/editor/is-editable-target"
import { toggleLayoutGrid } from "@/lib/editor/layout-grid"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

export function EditorShortcuts() {
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const removeLayers = useLayerStore((state) => state.removeLayers)
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const enterImmersiveCanvas = useEditorStore(
    (state) => state.enterImmersiveCanvas
  )
  const exitImmersiveCanvas = useEditorStore(
    (state) => state.exitImmersiveCanvas
  )
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const selectedKeyframeIds = useTimelineStore(
    (state) => state.selectedKeyframeIds
  )
  const togglePlaying = useTimelineStore((state) => state.togglePlaying)

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "g"
    ) {
      event.preventDefault()
      const state = useLayerStore.getState()
      if (event.shiftKey) {
        for (const id of state.selectedLayerIds) state.ungroupLayer(id)
      } else {
        state.groupLayers(state.selectedLayerIds)
      }
      return
    }

    if (
      event.shiftKey &&
      !(event.metaKey || event.ctrlKey || event.altKey) &&
      event.code === "KeyG"
    ) {
      event.preventDefault()
      toggleLayoutGrid()
      return
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault()
      requestDraftSave({ asNewDraft: event.shiftKey })

      return
    }

    if (
      event.metaKey &&
      !event.altKey &&
      !event.ctrlKey &&
      event.code === "Period"
    ) {
      event.preventDefault()

      if (immersiveCanvas) {
        exitImmersiveCanvas()
      } else {
        enterImmersiveCanvas()
        playUISound("action.hideUI")
      }

      return
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "d" &&
      selectedLayerIds.length > 0
    ) {
      event.preventDefault()
      duplicateLayers(selectedLayerIds)

      return
    }

    if (
      event.key.toLowerCase() === "p" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      const playing = useTimelineStore.getState().isPlaying
      togglePlaying()
      playUISound(playing ? "action.pause" : "action.play")
      return
    }

    // Blade: cut the selected layers at the playhead.
    if (
      event.key.toLowerCase() === "b" &&
      !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) &&
      selectedLayerIds.length > 0
    ) {
      event.preventDefault()
      const created = splitLayersAt(
        selectedLayerIds,
        useTimelineStore.getState().currentTime
      )
      if (created.length > 0) playUISound("action.addLayer")
      return
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selectedLayerIds.length > 0 &&
      !(timelinePanelOpen && selectedKeyframeIds.length > 0)
    ) {
      event.preventDefault()
      // Shift+Delete: ripple delete (close the gap left by removed clips).
      if (event.shiftKey) {
        rippleDeleteLayers(selectedLayerIds)
      } else {
        removeLayers(selectedLayerIds)
      }
      playUISound("action.deleteLayer")
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return null
}
