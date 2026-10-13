import type { LayerParameterValues, ParameterValue } from "@/types/editor"

type Point = [number, number]
type PresetPoint = { color: string; position: Point; weight: number }
type MeshGradientPreset = {
  id: string
  label: string
  points: PresetPoint[]
  softness: number
  warp: number
  detail: number
  motionStyle: string
  motionAmount: number
  motionSpeed: number
  grainAmount: number
}

export const MESH_GRADIENT_PRESETS: readonly MeshGradientPreset[] = [
  {
    id: "peach",
    label: "Peach",
    points: [
      { color: "#ff7a59", position: [-1.15, 0.55], weight: 1.2 },
      { color: "#ffd9b8", position: [1.05, 0.7], weight: 1 },
      { color: "#ffb3c7", position: [0.05, -0.15], weight: 0.9 },
      { color: "#ffc857", position: [-0.7, -0.8], weight: 1 },
      { color: "#fff1e3", position: [1.2, -0.7], weight: 1.1 },
    ],
    softness: 0.7,
    warp: 0.3,
    detail: 0.1,
    motionStyle: "breathe",
    motionAmount: 0.4,
    motionSpeed: 0.3,
    grainAmount: 0.04,
  },
  {
    id: "lagoon",
    label: "Lagoon",
    points: [
      { color: "#06303c", position: [-1.2, 0.7], weight: 1.3 },
      { color: "#138a8a", position: [0.1, 0.4], weight: 1 },
      { color: "#7fe0cf", position: [1.1, 0.25], weight: 1 },
      { color: "#2d6fd6", position: [-0.6, -0.65], weight: 0.9 },
      { color: "#e4fbf4", position: [1.05, -0.8], weight: 0.9 },
    ],
    softness: 0.6,
    warp: 0.4,
    detail: 0.15,
    motionStyle: "flow",
    motionAmount: 0.45,
    motionSpeed: 0.3,
    grainAmount: 0.05,
  },
  {
    id: "dusk",
    label: "Dusk",
    points: [
      { color: "#160f3a", position: [-1.2, 0.75], weight: 1.4 },
      { color: "#5a2a8a", position: [-0.2, 0.35], weight: 1 },
      { color: "#e2557f", position: [0.75, 0.05], weight: 1 },
      { color: "#ff9e6d", position: [-0.45, -0.75], weight: 1 },
      { color: "#ffe08a", position: [1.2, -0.75], weight: 0.9 },
    ],
    softness: 0.65,
    warp: 0.35,
    detail: 0.1,
    motionStyle: "swirl",
    motionAmount: 0.35,
    motionSpeed: 0.25,
    grainAmount: 0.05,
  },
  {
    id: "citrus",
    label: "Citrus",
    points: [
      { color: "#ff6a00", position: [-1.1, -0.6], weight: 1.2 },
      { color: "#ffc93c", position: [-0.2, 0.55], weight: 1.1 },
      { color: "#a7d930", position: [0.95, 0.6], weight: 0.9 },
      { color: "#fff6c2", position: [0.6, -0.55], weight: 1 },
      { color: "#ff9f1c", position: [1.25, -0.1], weight: 0.8 },
    ],
    softness: 0.7,
    warp: 0.25,
    detail: 0.1,
    motionStyle: "drift",
    motionAmount: 0.35,
    motionSpeed: 0.3,
    grainAmount: 0.04,
  },
  {
    id: "mint",
    label: "Mint",
    points: [
      { color: "#a8e6cf", position: [-1.1, 0.6], weight: 1.1 },
      { color: "#f3fbf7", position: [0.15, 0.15], weight: 1.2 },
      { color: "#56c596", position: [-0.5, -0.75], weight: 0.9 },
      { color: "#c9ecff", position: [1.1, 0.55], weight: 1 },
      { color: "#e6f5c9", position: [1.15, -0.7], weight: 0.9 },
    ],
    softness: 0.75,
    warp: 0.2,
    detail: 0.05,
    motionStyle: "drift",
    motionAmount: 0.3,
    motionSpeed: 0.25,
    grainAmount: 0.03,
  },
  {
    id: "polar",
    label: "Aurora",
    points: [
      { color: "#030d14", position: [-0.2, -0.75], weight: 1.5 },
      { color: "#00c2a2", position: [-1.0, 0.45], weight: 1 },
      { color: "#7b2ff7", position: [0.65, 0.6], weight: 1 },
      { color: "#1e8fff", position: [1.25, -0.25], weight: 0.9 },
      { color: "#b6fff6", position: [-0.3, 0.85], weight: 0.6 },
    ],
    softness: 0.55,
    warp: 0.45,
    detail: 0.2,
    motionStyle: "flow",
    motionAmount: 0.5,
    motionSpeed: 0.3,
    grainAmount: 0.05,
  },
  {
    id: "ink",
    label: "Ink",
    points: [
      { color: "#050608", position: [-1.0, 0.5], weight: 1.4 },
      { color: "#141b2d", position: [0.9, 0.7], weight: 1.2 },
      { color: "#3a1c71", position: [0.2, -0.2], weight: 0.9 },
      { color: "#ff4d00", position: [1.1, -0.65], weight: 0.7 },
      { color: "#0b0b10", position: [-1.1, -0.75], weight: 1.2 },
    ],
    softness: 0.6,
    warp: 0.3,
    detail: 0.15,
    motionStyle: "drift",
    motionAmount: 0.3,
    motionSpeed: 0.25,
    grainAmount: 0.06,
  },
  {
    id: "basement",
    label: "Basement",
    points: [
      { color: "#0a0a0a", position: [-1.15, 0.6], weight: 1.3 },
      { color: "#ff4d00", position: [0.15, 0.1], weight: 1.1 },
      { color: "#ff8a3d", position: [1.1, 0.65], weight: 0.9 },
      { color: "#ffd8bf", position: [1.1, -0.7], weight: 0.9 },
      { color: "#2a1206", position: [-0.75, -0.8], weight: 1.1 },
    ],
    softness: 0.6,
    warp: 0.35,
    detail: 0.1,
    motionStyle: "breathe",
    motionAmount: 0.35,
    motionSpeed: 0.3,
    grainAmount: 0.06,
  },
]

export const LEGACY_MESH_GRADIENT_PRESETS = new Set([
  "aurora",
  "sunset",
  "deep-ocean",
  "neon-glow",
])

export function meshGradientPresetParams(
  id: string
): Record<string, ParameterValue> | null {
  const preset = MESH_GRADIENT_PRESETS.find((entry) => entry.id === id)
  if (!preset) return null
  const params: Record<string, ParameterValue> = {
    activePoints: preset.points.length,
    distortionMode: "simple",
    softness: preset.softness,
    warp: preset.warp,
    detail: preset.detail,
    motionStyle: preset.motionStyle,
    motionAmount: preset.motionAmount,
    motionSpeed: preset.motionSpeed,
    tonemapMode: "none",
    glowStrength: 0,
    grainAmount: preset.grainAmount,
    vignetteStrength: 0,
  }
  for (const [index, point] of preset.points.entries()) {
    params[`point${index + 1}Color`] = point.color
    params[`point${index + 1}Position`] = point.position
    params[`point${index + 1}Weight`] = point.weight
  }
  return params
}

function oklchToHex(l: number, c: number, h: number): string {
  for (let chroma = c; chroma >= 0; chroma -= 0.01) {
    const a = chroma * Math.cos((h * Math.PI) / 180)
    const b = chroma * Math.sin((h * Math.PI) / 180)
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
    const linear = [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ]
    if (linear.every((value) => value >= -0.0005 && value <= 1.0005)) {
      return `#${linear
        .map((value) => {
          const v = Math.min(1, Math.max(0, value))
          const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
          return Math.round(srgb * 255)
            .toString(16)
            .padStart(2, "0")
        })
        .join("")}`
    }
  }
  return "#808080"
}

const HARMONIES: readonly (readonly number[])[] = [
  [0, 18, 36, -18, -36],
  [0, 150, 210, 20, -20],
  [0, 120, 240, 30, 150],
  [0, 8, -8, 16, -16],
  [0, 180, 20, 200, -20],
]

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap]!, result[index]!]
  }
  return result
}

function spreadPoints(count: number, random: () => number): Point[] {
  const points: Point[] = []
  for (let attempt = 0; points.length < count && attempt < 400; attempt += 1) {
    const candidate: Point = [
      Number((random() * 2.6 - 1.3).toFixed(2)),
      Number((random() * 1.7 - 0.85).toFixed(2)),
    ]
    const clear = points.every(
      ([x, y]) => Math.hypot(x - candidate[0], y - candidate[1]) > 0.75
    )
    if (clear || attempt > 300) points.push(candidate)
  }
  return points
}

export function shuffleMeshGradient(
  random: () => number = Math.random
): LayerParameterValues {
  const count = random() < 0.35 ? 4 : 5
  const colors: string[] = []
  if (random() < 0.35) {
    const preset = MESH_GRADIENT_PRESETS[Math.floor(random() * MESH_GRADIENT_PRESETS.length)]!
    colors.push(...preset.points.map((point) => point.color))
  } else {
    const hue = random() * 360
    const harmony = HARMONIES[Math.floor(random() * HARMONIES.length)]!
    const dark = random() < 0.5
    const lightness = dark
      ? [0.22, 0.38, 0.55, 0.68, 0.82]
      : [0.42, 0.62, 0.74, 0.86, 0.95]
    for (let index = 0; index < 5; index += 1) {
      const l = lightness[index]! + (random() - 0.5) * 0.05
      const edge = index === 0 || index === 4
      const c = (edge ? 0.05 : 0.12) + random() * 0.06
      colors.push(oklchToHex(l, c, (hue + harmony[index]! + 360) % 360))
    }
  }
  const order = shuffled(colors, random)
  const positions = spreadPoints(5, random)
  const params: LayerParameterValues = { preset: "custom", activePoints: count }
  for (let index = 0; index < 5; index += 1) {
    params[`point${index + 1}Color`] = order[index] ?? "#ffffff"
    params[`point${index + 1}Position`] = positions[index] ?? [0, 0]
    params[`point${index + 1}Weight`] = Number((0.8 + random() * 0.5).toFixed(2))
  }
  return params
}
