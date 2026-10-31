import type { Metadata } from "next"
import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL, APP_OG_IMAGES } from "@/lib/app"
import {
  ABOUT_PATH,
  EDITOR_PATH,
  PRIVACY_PATH,
} from "@/lib/editor/paths"

const LAST_UPDATED = "October 31, 2026"

const CONTACT_URL = "https://github.com/adielvasquezwork-wq/editor-lab/issues"

const DESCRIPTION =
  "Editor Lab has no accounts and stores your work only in your browser. What leaves your machine, and why."

export const metadata: Metadata = {
  alternates: { canonical: PRIVACY_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    images: APP_OG_IMAGES,
    title: "Privacy Policy",
    type: "website",
    url: `${APP_BASE_URL}${PRIVACY_PATH}`,
  },
  title: "Privacy Policy",
}

type Section = {
  body?: string[]
  heading: string
  items?: string[]
}

const SECTIONS: Section[] = [
  {
    body: [
      "Editor Lab is a browser-based video editor. There are no accounts, and your projects are never uploaded to us.",
      "Your work stays on your machine: the editor autosaves into your browser's own IndexedDB storage, media you add stays in the browser, and exports are rendered and saved locally.",
    ],
    heading: "The short version",
  },
  {
    heading: "What leaves your machine",
    items: [
      "Vercel hosts the site and runs Vercel Analytics and Speed Insights: aggregate page views and performance, not used to track you across other sites.",
      "If you use depth estimation, the model files are downloaded from Hugging Face's servers; your images are processed in your browser and are not sent anywhere.",
      "If you connect an AI agent with ?agent=1, the editor talks to a bridge running on your own computer (localhost) only.",
    ],
  },
  {
    heading: "Deleting your data",
    items: [
      "Everything the editor keeps is in your browser's site storage. Clearing this site's data in your browser deletes it.",
    ],
  },
  {
    body: [
      `Questions about any of this: ${CONTACT_URL}.`,
      "If this policy changes materially, the date at the top will be updated.",
    ],
    heading: "Contact",
  },
]

function EmailText({ text }: { text: string }) {
  const [before, after] = text.split(CONTACT_URL)

  if (after === undefined) {
    return text
  }

  return (
    <>
      {before}
      <Link
        className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
        href={CONTACT_URL}
      >
        GitHub issues
      </Link>
      {after}
    </>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-[70ch] px-5 py-[var(--ds-space-16)] sm:px-6">
      <header className="flex flex-col items-start gap-[var(--ds-space-4)]">
        <nav className="flex flex-wrap gap-[var(--ds-space-4)]">
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={EDITOR_PATH}
          >
            ← Editor Lab
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={ABOUT_PATH}
          >
            About
          </Link>
        </nav>
        <Typography as="h1" variant="display">
          Privacy Policy
        </Typography>
        <Typography as="p" tone="tertiary" variant="monoXs">
          Last updated {LAST_UPDATED}
        </Typography>
      </header>

      <hr className="my-[var(--ds-space-10)] border-0 border-[var(--ds-border-divider)] border-t" />

      <div className="flex flex-col gap-[var(--ds-space-10)]">
        {SECTIONS.map((section) => (
          <section
            className="flex flex-col gap-[var(--ds-space-4)]"
            key={section.heading}
          >
            <Typography as="h2" variant="heading">
              {section.heading}
            </Typography>

            {section.body?.map((paragraph) => (
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                key={paragraph}
                tone="secondary"
                variant="body"
              >
                <EmailText text={paragraph} />
              </Typography>
            ))}

            {section.items ? (
              <ul className="list-disc space-y-[var(--ds-space-4)] pl-[var(--ds-space-5)]">
                {section.items.map((item) => (
                  <Typography
                    as="li"
                    className="text-pretty leading-[1.65] marker:text-[var(--ds-color-text-muted)]"
                    key={item}
                    tone="secondary"
                    variant="body"
                  >
                    {item}
                  </Typography>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  )
}
