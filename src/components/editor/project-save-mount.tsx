"use client"

import { useEffect } from "react"
import { registerDraftSaver } from "@/lib/editor/draft-save-bus"
import { buildLabProjectFile } from "@/lib/editor/project-file"

function downloadProjectFile(): void {
  const blob = new Blob([JSON.stringify(buildLabProjectFile(), null, 2)], {
    type: "application/json",
  })
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\..+$/, "")
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `editor-lab-${stamp}.lab`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Cmd/Ctrl+S saves the project as a .lab file (projects also autosave in
 * this browser). Replaces the former account-backed draft saving.
 */
export function ProjectSaveMount() {
  useEffect(() => {
    registerDraftSaver(() => {
      try {
        downloadProjectFile()
      } catch (error) {
        console.error("[editor-lab] project save failed", error)
      }
    })

    return () => registerDraftSaver(null)
  }, [])

  return null
}
