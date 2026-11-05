import { defineEffectSchema } from "../contract"

export const splitToneSchema = defineEffectSchema({
  category: "colour",
  description:
    "Tints shadows and highlights with separate hues without changing brightness (e.g. teal shadows, warm or cool whites).",
  id: "splitTone",
  label: "Split Tone",
  layerType: "split-tone",
  params: [
    {
      defaultValue: 195,
      key: "shadowHue",
      label: "Shadow Hue",
      max: 360,
      min: 0,
      step: 1,
      type: "number",
      unit: "°",
    },
    {
      defaultValue: 0.3,
      key: "shadowSaturation",
      label: "Shadow Saturation",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 35,
      key: "highlightHue",
      label: "Highlight Hue",
      max: 360,
      min: 0,
      step: 1,
      type: "number",
      unit: "°",
    },
    {
      defaultValue: 0.1,
      key: "highlightSaturation",
      label: "Highlight Saturation",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 0,
      description:
        "Moves the split point: negative tints more of the image as shadows, positive as highlights.",
      key: "balance",
      label: "Balance",
      max: 1,
      min: -1,
      step: 0.01,
      type: "number",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})
