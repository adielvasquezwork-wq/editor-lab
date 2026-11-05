import { importSnippets, readSnippets } from "./snippets"
import type { StackActionResult } from "./stack-clipboard"

export function downloadSnippetsFile(): StackActionResult {
  const snippets = readSnippets()
  if (snippets.length === 0) {
    return { message: "No snippets saved in this browser yet.", ok: false }
  }
  const blob = new Blob([`${JSON.stringify(snippets, null, 2)}\n`], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "editor-lab-snippets.json"
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return { message: `Saved ${snippets.length} snippets.`, ok: true }
}

export function openSnippetsFile(): Promise<StackActionResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json,.json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve({ message: "No file chosen.", ok: false })
        return
      }
      try {
        const added = importSnippets(await file.text())
        resolve({
          message: `Imported ${added} snippet${added === 1 ? "" : "s"}.`,
          ok: true,
        })
      } catch (error) {
        resolve({
          message:
            error instanceof Error ? error.message : "Could not read the file.",
          ok: false,
        })
      }
    }
    input.click()
  })
}
