export const APP_NAME = "Editor Lab"
export const APP_DEFAULT_TITLE = "Editor Lab"
export const APP_TITLE_TEMPLATE = "%s | Editor Lab"
export const APP_DESCRIPTION =
  "A browser-based WebGPU editor for documentary-style video: cut clips, mix audio, add titles and captions, and finish footage with shader effects and LUTs."

function resolveAppBaseUrl() {
  const explicitBaseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "")
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL

  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl}`
  }

  const vercelPreviewUrl = process.env.VERCEL_URL

  if (vercelPreviewUrl) {
    return `https://${vercelPreviewUrl}`
  }

  return "http://localhost:3000"
}

export const APP_BASE_URL = resolveAppBaseUrl()

export const APP_OG_IMAGES = [
  {
    alt: APP_DEFAULT_TITLE,
    height: 630,
    type: "image/gif",
    url: "/opengraph-image.gif",
    width: 1200,
  },
]

export const APP_TWITTER_HANDLE = ""

export const APP_TWITTER_IMAGES = [
  {
    alt: APP_DEFAULT_TITLE,
    height: 630,
    url: "/tools/shader-lab/x-card",
    width: 1200,
  },
]

/**
 * Preview and development deployments must never be indexed or listed. An
 * unset VERCEL_ENV counts as production on purpose: it only occurs off-Vercel
 * (local `next start`, CI), where treating the build as production lets the
 * real robots/sitemap/metadata output be verified. Every actual Vercel
 * deployment — previews included — has VERCEL_ENV set.
 */
export function isProductionDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV

  return !vercelEnv || vercelEnv === "production"
}
