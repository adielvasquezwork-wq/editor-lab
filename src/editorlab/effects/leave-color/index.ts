import { defineEffectSchema } from "../contract"

export const leaveColorSchema = defineEffectSchema({
  category: "colour",
  description:
    "Turns everything black and white except one colour (e.g. red accents on scanned paper).",
  id: "leaveColor",
  label: "Leave Color",
  layerType: "leave-color",
  params: [
    {
      defaultValue: "#E0262B",
      key: "color",
      label: "Keep Color",
      type: "color",
    },
    {
      defaultValue: 25,
      description: "Hue range kept around the colour, in degrees.",
      key: "tolerance",
      label: "Tolerance",
      max: 180,
      min: 0,
      step: 1,
      type: "number",
    },
    {
      defaultValue: 15,
      key: "softness",
      label: "Softness",
      max: 90,
      min: 0.5,
      step: 0.5,
      type: "number",
    },
    {
      defaultValue: 0.12,
      description:
        "Greys and near-greys are never kept, so paper stays neutral.",
      key: "minChroma",
      label: "Min Saturation",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 1,
      key: "amount",
      label: "Desaturate",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})
