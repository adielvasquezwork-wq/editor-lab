import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import { EFFECT_LAYER_TYPES } from "@/types/editor"

/**
 * Canonical machine-readable facts about Editor Lab — the single source of
 * truth for entity copy consumed by JSON-LD structured data, the about page,
 * `/llms.txt`, `/agents.md`, and the markdown mirrors.
 *
 * Hardcoded on purpose: this copy is load-bearing for LLM / answer-engine
 * discoverability and must never render empty. Phrasing avoids counts that go
 * stale ("a catalog of stackable effects" over "30 effects"). Effect names are
 * derived from `LAYER_CATALOG` so they can't drift from the editor.
 */
export const PRODUCT_FACTS = {
  name: "Editor Lab",
  description:
    "Editor Lab is a free browser-based editor for documentary-style video: cut clips on a timeline, mix music, voice-over and natural sound with ducking, add lower thirds and captions, and finish footage with shader effects, LUTs, vignette and letterbox. It runs on WebGPU and exports video directly from the browser. It is a fork of Shader Lab by basement.studio.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web browser",
  browserRequirements: "Requires WebGPU",
  // Public contact for questions and data requests.
  contactUrl: "https://github.com/adielvasquezwork-wq/editor-lab/issues",
  githubUrl: "https://github.com/adielvasquezwork-wq/editor-lab",
  capabilities: [
    "Clip-based video editing with split and ripple delete",
    "Multi-track audio mix with fades and ducking",
    "Lower thirds and SRT/VTT captions",
    "Layer-based shader effects and .cube LUTs",
    "Timeline parameter animation",
    "Video and image export",
    "MCP server so AI agents can drive the editor",
  ],
  packages: [
    {
      name: "@basementstudio/shader-lab",
      description:
        "Upstream React/WebGPU runtime by basement.studio for rendering exported scenes in React apps.",
      npmUrl: "https://www.npmjs.com/package/@basementstudio/shader-lab",
    },
    {
      name: "@basementstudio/shader-lab-mcp",
      description:
        "Upstream MCP server by basement.studio that lets an AI agent drive a running editor tab.",
      npmUrl: "https://www.npmjs.com/package/@basementstudio/shader-lab-mcp",
    },
  ],
  publisher: {
    name: "Editor Lab contributors",
    alternateNames: [],
    foundingDate: "2026",
    url: "https://github.com/adielvasquezwork-wq/editor-lab",
    sameAs: [],
  },
} as const

/** Effect names as shown in the editor, alphabetical — e.g. "ASCII", "CRT". */
export function getEffectNames(): string[] {
  return EFFECT_LAYER_TYPES.map(getLayerLabel).sort((left, right) =>
    left.localeCompare(right)
  )
}
