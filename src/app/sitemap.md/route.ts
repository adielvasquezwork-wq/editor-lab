import { markdownResponse } from "@/lib/aeo/md-response"
import { APP_BASE_URL } from "@/lib/app"
import { ABOUT_PATH, EDITOR_PATH, PRIVACY_PATH } from "@/lib/editor/paths"

/** Markdown content index for AI agents — the `.md` twin of sitemap.xml. */
export function GET() {
  const base = APP_BASE_URL

  return markdownResponse(`# Editor Lab — Content Index

## Pages

- [Editor](${base}${EDITOR_PATH})
- [About](${base}${ABOUT_PATH})
- [Privacy policy](${base}${PRIVACY_PATH})

## Other resources

- [Product overview (markdown)](${base}/index.md)
- [llms.txt](${base}/llms.txt)
- [agents.md](${base}/agents.md)
`)
}
