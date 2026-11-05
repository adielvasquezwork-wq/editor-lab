import { applyEffectStack, currentEffectStack } from "./apply-stack"
import { parseEffectStack, stringifyEffectStack } from "./stack-json"

export type StackActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export async function copyStackToClipboard(): Promise<StackActionResult> {
  const stack = currentEffectStack()
  if (stack.layers.length === 0) {
    return { message: "No effect layers to copy.", ok: false }
  }
  try {
    await navigator.clipboard.writeText(stringifyEffectStack(stack))
    return {
      message: `Copied ${stack.layers.length} effect layer${stack.layers.length === 1 ? "" : "s"} as JSON.`,
      ok: true,
    }
  } catch {
    return {
      message: "Clipboard access is not available in this browser.",
      ok: false,
    }
  }
}

export async function pasteStackFromClipboard(
  mode: "add" | "replace"
): Promise<StackActionResult> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    return {
      message: "Clipboard access is not available in this browser.",
      ok: false,
    }
  }
  return applyStackText(text, mode)
}

export function applyStackText(
  text: string,
  mode: "add" | "replace"
): StackActionResult {
  try {
    const stack = parseEffectStack(text)
    const ids = applyEffectStack(stack, mode)
    return {
      message: `${mode === "replace" ? "Replaced" : "Added"} ${ids.length} effect layer${ids.length === 1 ? "" : "s"} from the stack.`,
      ok: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Could not read the stack.",
      ok: false,
    }
  }
}

export function downloadStackFile(): StackActionResult {
  const stack = currentEffectStack()
  if (stack.layers.length === 0) {
    return { message: "No effect layers to save.", ok: false }
  }
  const blob = new Blob([stringifyEffectStack(stack)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "effect-stack.json"
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return { message: "Stack saved as effect-stack.json.", ok: true }
}

export function openStackFile(
  mode: "add" | "replace"
): Promise<StackActionResult> {
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
      resolve(applyStackText(await file.text(), mode))
    }
    input.click()
  })
}
