import { defineEffectSchema } from "../contract"

export const vignetteSchema = defineEffectSchema({
  category: "lens",
  description:
    "Lens darkening (or fade to a colour) toward the edges. Frame-shaped or round, any softness, off-centre, in true stops or punchy display-space multiply.",
  id: "vignette",
  label: "Vignette",
  layerType: "vignette",
  params: [
    {
      defaultValue: 2.2,
      description:
        "How much the edge darkens, in stops (each stop halves the light).",
      key: "amount",
      label: "Amount",
      max: 6,
      min: 0,
      step: 0.05,
      type: "number",
      unit: "stops",
    },
    {
      defaultValue: 0.25,
      description: "Where the darkening starts (0 = centre, 1 = corners).",
      key: "radius",
      label: "Radius",
      max: 1.5,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 0.85,
      description: "Width of the falloff. Low = hard edge, high = gentle.",
      key: "softness",
      label: "Softness",
      max: 2,
      min: 0.01,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 0,
      description: "0 follows the frame's shape, 1 is a perfect circle.",
      key: "roundness",
      label: "Roundness",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: 0.5,
      description:
        "Corner shape: 0 is oval, 1 is a rounded rectangle (edges darken almost as much as corners).",
      key: "squareness",
      label: "Squareness",
      max: 1,
      min: 0,
      step: 0.01,
      type: "number",
    },
    {
      defaultValue: [0, 0] as [number, number],
      description: "Moves the clear area (-1..1 across the frame).",
      key: "center",
      label: "Center",
      max: 1,
      min: -1,
      step: 0.01,
      type: "vec2",
    },
    {
      defaultValue: "#000000",
      description:
        "Colour the edges fade toward. Black is a normal vignette; white or a tint works for paper and glow looks.",
      key: "color",
      label: "Color",
      type: "color",
    },
    {
      defaultValue: true,
      description:
        "On: darkens in linear light like a real lens (keeps highlights alive). Off: multiplies the displayed image, heavier in the mids.",
      key: "linearLight",
      label: "Linear Light",
      type: "boolean",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})
