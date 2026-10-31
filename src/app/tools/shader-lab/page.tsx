import type { Metadata } from "next"
import { ShaderLabPage } from "@/components/pages/shader-lab-page"
import {
  APP_BASE_URL,
  APP_OG_IMAGES,
  APP_TWITTER_HANDLE,
  APP_TWITTER_IMAGES,
} from "@/lib/app"
import { EDITOR_PATH } from "@/lib/editor/paths"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateWebSiteSchema } from "@/lib/structured-data/schemas/organization"
import { generateWebApplicationSchema } from "@/lib/structured-data/schemas/web-application"

const DESCRIPTION =
  "Edit documentary-style video in your browser: cut clips, mix audio, add titles and captions, and finish footage with shader effects and LUTs. Powered by WebGPU."

export const metadata: Metadata = {
  alternates: {
    canonical: EDITOR_PATH,
  },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    images: APP_OG_IMAGES,
    type: "website",
    url: `${APP_BASE_URL}${EDITOR_PATH}`,
  },
  twitter: {
    card: "summary_large_image",
    creator: APP_TWITTER_HANDLE,
    description: DESCRIPTION,
    images: APP_TWITTER_IMAGES,
    site: APP_TWITTER_HANDLE,
  },
}

export default function ShaderLabRoute() {
  return (
    <>
      <PageJsonLd
        nodes={[generateWebSiteSchema(), generateWebApplicationSchema()]}
      />
      <ShaderLabPage />
    </>
  )
}
