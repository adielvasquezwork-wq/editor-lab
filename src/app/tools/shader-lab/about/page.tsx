import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { APP_BASE_URL, APP_OG_IMAGES } from "@/lib/app"
import { getLayerLabel, LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"
import { ABOUT_PATH, EDITOR_PATH, PRIVACY_PATH } from "@/lib/editor/paths"
import { EFFECT_LAYER_TYPES } from "@/types/editor"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { PRODUCT_FACTS } from "@/lib/structured-data/product-facts"
import { generateBreadcrumbSchema } from "@/lib/structured-data/schemas/breadcrumb"
import {
  type FaqItem,
  generateFaqPageSchema,
} from "@/lib/structured-data/schemas/faq"
import { generateWebApplicationSchema } from "@/lib/structured-data/schemas/web-application"

const DESCRIPTION =
  "What Editor Lab is, how the WebGPU video editor works, every effect in the catalog, and answers to common questions."

export const metadata: Metadata = {
  alternates: { canonical: ABOUT_PATH },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    images: APP_OG_IMAGES,
    title: "About",
    type: "website",
    url: `${APP_BASE_URL}${ABOUT_PATH}`,
  },
  title: "About",
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Editor Lab free?",
    answer:
      "Yes. Editor Lab is free and open source (Apache-2.0), forked from basement.studio's Shader Lab. There is no paid tier.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. There are no accounts. Your work autosaves into your browser's own IndexedDB storage and nothing is sent to a server; Cmd/Ctrl+S also saves a .lab project file.",
  },
  {
    question: "What browsers does it work in?",
    answer:
      "Editor Lab runs on WebGPU, so it needs a browser with WebGPU enabled — recent versions of Chrome and Edge on desktop, and current Safari and Firefox releases.",
  },
  {
    question: "Can I use a scene on my own website?",
    answer:
      "Yes. Effects that use the upstream runtime can be rendered in React with basement.studio's @basementstudio/shader-lab package; editing-only features (clips, audio, captions, LUTs) are not part of that runtime.",
  },
  {
    question: "Can AI agents drive the editor?",
    answer:
      "Yes. The @basementstudio/shader-lab-mcp package (from upstream) is an MCP server that lets an agent like Claude Code control a running editor tab — adding and tweaking layers, writing custom TSL shaders with real compile feedback, and taking canvas screenshots. Open the editor with ?agent=1 to connect.",
  },
]

interface Section {
  body: string[]
  heading: string
}

const SECTIONS: Section[] = [
  {
    heading: "What it is",
    body: [
      PRODUCT_FACTS.description,
      "Editor Lab is a fork of Shader Lab by basement.studio (Apache-2.0). It is not affiliated with or endorsed by basement.studio.",
    ],
  },
  {
    heading: "How it works",
    body: [
      "A scene is a stack of layers. Source layers put something on the canvas — an image, a video, your camera, text, a mesh gradient, or a 3D model. Effect layers transform everything below them, and they stack: a video under a pixelation pass under a CRT pass renders exactly in that order, in real time.",
      "Every layer parameter can be animated on the timeline, and the whole composition exports to video directly from the browser.",
      "There is also a custom shader layer: write TSL (three.js Shading Language) in a sandbox that compiles in the browser and shows you compile errors immediately.",
    ],
  },
]

// Effects kept only so old projects still open; not advertised.
const DISCONTINUED_EFFECT_TYPES = new Set<string>([
  "blur",
  "directional-blur",
  "fluted-glass",
  "smear",
])

const EFFECT_TYPES = EFFECT_LAYER_TYPES.filter(
  (type) => !DISCONTINUED_EFFECT_TYPES.has(type)
).sort((left, right) => getLayerLabel(left).localeCompare(getLayerLabel(right)))

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[840px] px-5 py-[var(--ds-space-16)] sm:px-6">
      <PageJsonLd
        nodes={[
          generateWebApplicationSchema(),
          generateFaqPageSchema(FAQ_ITEMS, ABOUT_PATH),
          generateBreadcrumbSchema([
            { name: "Editor Lab", path: EDITOR_PATH },
            { name: "About", path: ABOUT_PATH },
          ]),
        ]}
      />

      <header className="flex flex-col items-start gap-[var(--ds-space-4)]">
        <Link
          className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
          href={EDITOR_PATH}
        >
          ← Editor Lab
        </Link>
        <Typography as="h1" variant="display">
          About Editor Lab
        </Typography>
        <Typography
          as="p"
          className="text-pretty leading-[1.65]"
          tone="secondary"
          variant="body"
        >
          A free, browser-based editor for documentary-style video, with
          shader effects for finishing.
        </Typography>
      </header>

      <hr className="my-[var(--ds-space-10)] border-0 border-[var(--ds-border-divider)] border-t" />

      <div className="flex flex-col gap-[var(--ds-space-12)]">
        {SECTIONS.map((section) => (
          <section
            className="flex flex-col gap-[var(--ds-space-4)]"
            key={section.heading}
          >
            <Typography as="h2" variant="heading">
              {section.heading}
            </Typography>
            {section.body.map((paragraph) => (
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                key={paragraph}
                tone="secondary"
                variant="body"
              >
                {paragraph}
              </Typography>
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-[var(--ds-space-6)]">
          <div className="flex flex-col gap-[var(--ds-space-4)]">
            <Typography as="h2" variant="heading">
              The effect catalog
            </Typography>
            <Typography
              as="p"
              className="text-pretty leading-[1.65]"
              tone="secondary"
              variant="body"
            >
              Every effect below can be stacked on any source, reordered,
              masked, blended, and animated on the timeline.
            </Typography>
          </div>

          <ul className="grid list-none grid-cols-1 gap-[var(--ds-space-6)] p-0 sm:grid-cols-2">
            {EFFECT_TYPES.map((type) => {
              const entry = LAYER_CATALOG[type]

              return (
                <li
                  className="flex flex-col gap-[var(--ds-space-2)]"
                  key={type}
                >
                  {entry.previewSrc ? (
                    <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
                      <Image
                        alt={`${entry.label} effect example`}
                        className="object-cover"
                        fill
                        sizes="(max-width: 640px) 100vw, 420px"
                        src={entry.previewSrc}
                      />
                    </span>
                  ) : null}
                  <Typography as="h3" variant="label">
                    {entry.label}
                  </Typography>
                  {entry.description ? (
                    <Typography
                      as="p"
                      className="text-pretty leading-[1.55]"
                      tone="secondary"
                      variant="caption"
                    >
                      {entry.description}
                    </Typography>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-[var(--ds-space-4)]">
          <Typography as="h2" variant="heading">
            Use it outside the editor
          </Typography>
          {PRODUCT_FACTS.packages.map((pkg) => (
            <div
              className="flex flex-col gap-[var(--ds-space-2)]"
              key={pkg.name}
            >
              <Typography as="h3" variant="label">
                <Link
                  className="underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
                  href={pkg.npmUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {pkg.name}
                </Link>
              </Typography>
              <Typography
                as="p"
                className="text-pretty leading-[1.65]"
                tone="secondary"
                variant="body"
              >
                {pkg.description}
              </Typography>
            </div>
          ))}
          <Typography
            as="p"
            className="text-pretty leading-[1.65]"
            tone="secondary"
            variant="body"
          >
            Both packages and the whole app are open source on{" "}
            <Link
              className="text-[var(--ds-color-text-primary)] underline decoration-[var(--ds-border-panel)] underline-offset-[3px] transition-colors hover:decoration-[var(--ds-color-text-primary)]"
              href={PRODUCT_FACTS.githubUrl}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </Link>
            .
          </Typography>
        </section>


        <section className="flex flex-col gap-[var(--ds-space-4)]">
          <Typography as="h2" variant="heading">
            Frequently asked questions
          </Typography>
          <div className="flex flex-col gap-[var(--ds-space-8)]">
            {FAQ_ITEMS.map((faq) => (
              <div
                className="flex flex-col gap-[var(--ds-space-2)]"
                key={faq.question}
              >
                <Typography as="h3" variant="label">
                  {faq.question}
                </Typography>
                <Typography
                  as="p"
                  className="text-pretty leading-[1.65]"
                  tone="secondary"
                  variant="body"
                >
                  {faq.answer}
                </Typography>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap gap-[var(--ds-space-4)]">
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={EDITOR_PATH}
          >
            Open the editor
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={PRIVACY_PATH}
          >
            Privacy policy
          </Link>
          <Link
            className="text-[var(--ds-color-text-tertiary)] transition-colors hover:text-[var(--ds-color-text-primary)] type-mono-xs"
            href={PRODUCT_FACTS.contactUrl}
          >
            Contact
          </Link>
        </footer>
      </div>
    </main>
  )
}
