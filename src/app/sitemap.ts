import type { MetadataRoute } from "next"
import { APP_BASE_URL, isProductionDeployment } from "@/lib/app"
import { ABOUT_PATH, EDITOR_PATH, PRIVACY_PATH } from "@/lib/editor/paths"

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionDeployment()) {
    return []
  }

  return [
    {
      url: `${APP_BASE_URL}${EDITOR_PATH}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${APP_BASE_URL}${ABOUT_PATH}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${APP_BASE_URL}${PRIVACY_PATH}`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ]
}
