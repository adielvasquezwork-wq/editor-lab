import { NextResponse } from "next/server"
import { APP_BASE_URL } from "@/lib/app"
import { ABOUT_PATH, EDITOR_PATH, PRIVACY_PATH } from "@/lib/editor/paths"
import {
  getEffectNames,
  PRODUCT_FACTS,
} from "@/lib/structured-data/product-facts"

/**
 * llmstxt.org-format link map for AI assistants. A route handler rather than a
 * static file because absolute URLs derive from the runtime base URL.
 */
export function GET() {
  const base = APP_BASE_URL

  const keyPages = [
    `- [Editor](${base}${EDITOR_PATH}): The Editor Lab editor itself — start editing immediately, no account needed.`,
    `- [About](${base}${ABOUT_PATH}): What Editor Lab is, how the editor works, the full effect catalog, and an FAQ.`,
    `- [Privacy policy](${base}${PRIVACY_PATH}): What Editor Lab stores.`,
  ]

  const body = `# Editor Lab

> ${PRODUCT_FACTS.description}

## Key pages

${keyPages.join("\n")}

## Effects

${getEffectNames().join(", ")}.

## Packages

- [${PRODUCT_FACTS.packages[0].name}](${PRODUCT_FACTS.packages[0].npmUrl}): ${PRODUCT_FACTS.packages[0].description}
- [${PRODUCT_FACTS.packages[1].name}](${PRODUCT_FACTS.packages[1].npmUrl}): ${PRODUCT_FACTS.packages[1].description}
- [GitHub](${PRODUCT_FACTS.githubUrl}): Source for the app.

## Markdown mirrors

- ${base}/index.md — product overview.
- ${base}/sitemap.md — content index.

## Contact

- ${PRODUCT_FACTS.contactUrl}
- Made by ${PRODUCT_FACTS.publisher.name}: ${PRODUCT_FACTS.publisher.url}
`

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
