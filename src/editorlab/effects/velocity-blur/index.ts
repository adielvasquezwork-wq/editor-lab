import { defineEffectSchema } from "../contract"

export const velocityBlurSchema = defineEffectSchema({
  category: "lens",
  description:
    "Motion blur whose length follows the speed of the layers below it (from their keyframes), or a manual direction and speed. Shutter angle sets how long the streak is for a given speed.",
  id: "velocityBlur",
  label: "Velocity Blur",
  layerType: "velocity-blur",
  params: [
    {
      defaultValue: "keyframes",
      description:
        "Keyframes: speed and direction from the keyframed Offset of the layers below (in the same group). Manual: set them here, keyframe them yourself.",
      key: "source",
      label: "Speed From",
      options: [
        { label: "Keyframes below", value: "keyframes" },
        { label: "Manual", value: "manual" },
      ],
      type: "select",
    },
    {
      defaultValue: 180,
      description:
        "180° = the streak covers half a frame of motion, like a film camera. 360° = a full frame.",
      key: "shutter",
      label: "Shutter",
      max: 720,
      min: 0,
      step: 1,
      type: "number",
      unit: "°",
    },
    {
      defaultValue: 1,
      description: "Multiplies the speed read from the keyframes.",
      key: "gain",
      label: "Gain",
      max: 4,
      min: 0,
      step: 0.01,
      type: "number",
      visibleWhen: { equals: "keyframes", key: "source" },
    },
    {
      defaultValue: 0,
      key: "angle",
      label: "Angle",
      max: 360,
      min: 0,
      step: 1,
      type: "number",
      unit: "°",
      visibleWhen: { equals: "manual", key: "source" },
    },
    {
      defaultValue: 40,
      description: "Speed in pixels per frame (of the composition).",
      key: "speed",
      label: "Speed",
      max: 400,
      min: 0,
      step: 1,
      type: "number",
      unit: "px/f",
      visibleWhen: { equals: "manual", key: "source" },
    },
    {
      defaultValue: 160,
      description: "Longest streak allowed, in pixels.",
      key: "maxLength",
      label: "Max Length",
      max: 600,
      min: 0,
      step: 1,
      type: "number",
      unit: "px",
    },
  ],
  seeded: false,
  stateful: false,
  version: 1,
})

/** Streak length in composition pixels for a speed in px/frame. */
export function streakLength(
  speedPxPerFrame: number,
  shutterDegrees: number,
  maxLength: number
): number {
  const length = Math.abs(speedPxPerFrame) * (shutterDegrees / 360)
  return Math.min(Math.max(0, maxLength), length)
}
