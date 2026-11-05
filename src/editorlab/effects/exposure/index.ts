import { defineEffectSchema } from "../contract"

export const exposureSchema = defineEffectSchema({
  category: "light",
  description:
    "Exposure in stops on everything below it in the stack. Keyframe it for flashes and dips to black; layers above it are unaffected.",
  id: "exposure",
  label: "Exposure",
  layerType: "exposure",
  params: [
    {
      defaultValue: 0,
      description: "Each stop doubles (+1) or halves (-1) the light.",
      key: "stops",
      label: "Stops",
      max: 8,
      min: -10,
      step: 0.05,
      type: "number",
      unit: "stops",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})
