import type { Metadata, Viewport } from "next"
import { Suspense, type PropsWithChildren } from "react"
import {
  APP_BASE_URL,
  APP_DEFAULT_TITLE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_OG_IMAGES,
  APP_TITLE_TEMPLATE,
  APP_TWITTER_HANDLE,
  APP_TWITTER_IMAGES,
  isProductionDeployment,
} from "@/lib/app"
import { cn } from "@/lib/cn"
import { fontsVariable } from "@/lib/fonts"
import "@/app/globals.css"
import "@/app/theme-skin.css"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  applicationName: APP_NAME,
  authors: [{ name: "basement.studio", url: "https://basement.studio" }],
  description: APP_DESCRIPTION,
  formatDetection: { telephone: false },
  metadataBase: new URL(APP_BASE_URL),
  openGraph: {
    description: APP_DESCRIPTION,
    images: APP_OG_IMAGES,
    locale: "en_US",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    type: "website",
    url: APP_BASE_URL,
  },
  other: {
    "fb:app_id": process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
  },
  // robots.txt alone can't deindex an already-discovered preview URL.
  ...(isProductionDeployment()
    ? {}
    : { robots: { follow: false, index: false } }),
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  twitter: {
    card: "summary_large_image",
    creator: APP_TWITTER_HANDLE,
    description: APP_DESCRIPTION,
    images: APP_TWITTER_IMAGES,
    site: APP_TWITTER_HANDLE,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
  },
}

export const viewport: Viewport = {
  colorScheme: "normal",
  themeColor: "#080808",
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={cn(fontsVariable)}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sets the editor theme before first paint
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname.replace(/\\/$/,"");if(p==="/tools/shader-lab"||p.indexOf("/tools/shader-lab/community")===0)document.documentElement.dataset.theme=JSON.parse(localStorage.getItem("shader-lab-theme")||"{}").state?.theme==="dark"?"dark":"light"}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Suspense fallback={null}>
          <Analytics />
          <SpeedInsights />
        </Suspense>
      </body>
    </html>
  )
}
