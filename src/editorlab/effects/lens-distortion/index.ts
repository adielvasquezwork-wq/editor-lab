import { defineEffectSchema } from "../contract"

export const lensDistortionSchema = defineEffectSchema({
  category: "lens",
  description:
    "Barrel or pincushion lens distortion with edge scale and optional colour fringing, for screen-plane shots that should feel photographed.",
  id: "lensDistortion",
  label: "Lens Distortion",
  layerType: "lens-distortion",
  params: [
    {
      defaultValue: 0.12,
      description:
        "Positive bulges the image outward (barrel), negative pinches it (pincushion).",
      key: "k1",
      label: "Distortion",
      max: 1,
      min: -1,
      step: 0.005,
      type: "number",
    },
    {
      defaultValue: 0,
      description:
        "Second-order term: shapes the corners without moving the mid-frame.",
      key: "k2",
      label: "Corner Distortion",
      max: 1,
      min: -1,
      step: 0.005,
      type: "number",
    },
    {
      defaultValue: 1.06,
      description: "Zoom to hide the edges the distortion pulls in.",
      key: "scale",
      label: "Edge Scale",
      max: 2,
      min: 0.5,
      step: 0.005,
      type: "number",
    },
    {
      defaultValue: 0,
      description:
        "Spreads red and blue apart toward the edges, like a cheap lens.",
      key: "chromatic",
      label: "Colour Fringe",
      max: 1,
      min: 0,
      step: 0.005,
      type: "number",
    },
    {
      defaultValue: [0, 0] as [number, number],
      key: "center",
      label: "Center",
      max: 1,
      min: -1,
      step: 0.01,
      type: "vec2",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})
