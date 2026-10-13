import {
  clamp,
  cos,
  dot,
  Fn,
  float,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import {
  acesTonemap,
  cinematicTonemap,
  reinhardTonemap,
  totosTonemap,
} from "@/renderer/shaders/tsl/color/tonemapping"
import { perlinNoise3d } from "@/renderer/shaders/tsl/noise/perlin-noise-3d"
import { ridgeNoise } from "@/renderer/shaders/tsl/noise/ridge-noise"
import { simplexNoise3d } from "@/renderer/shaders/tsl/noise/simplex-noise-3d"
import { turbulence } from "@/renderer/shaders/tsl/noise/turbulence"
import { valueNoise3d } from "@/renderer/shaders/tsl/noise/value-noise-3d"
import { voronoiNoise3d } from "@/renderer/shaders/tsl/noise/voronoi-noise-3d"
import { grainTexturePattern } from "@/renderer/shaders/tsl/patterns/grain-texture-pattern"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type NoiseMode =
  | "perlin"
  | "ridge"
  | "simplex"
  | "turbulence"
  | "value"
  | "voronoi"
type TonemapMode = "aces" | "cinematic" | "none" | "reinhard" | "totos"
type MotionStyle = "breathe" | "drift" | "flow" | "off" | "original" | "swirl"

const MOTION_STYLES: readonly MotionStyle[] = [
  "breathe",
  "drift",
  "flow",
  "off",
  "original",
  "swirl",
]
const FALLBACK_LOOP_SECONDS = 10

function resolveMotionStyle(params: LayerParameterValues): MotionStyle {
  if (MOTION_STYLES.includes(params.motionStyle as MotionStyle))
    return params.motionStyle as MotionStyle
  return params.animate === false ? "off" : "original"
}

function unit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  const color = new THREE.Color(`#${value}`)

  return [color.r, color.g, color.b]
}

export class GradientPass extends PassNode {
  private readonly activePointsUniform: Node
  private readonly animateUniform: Node
  private readonly aspectUniform: Node
  private readonly falloffUniform: Node
  private readonly glowStrengthUniform: Node
  private readonly glowThresholdUniform: Node
  private readonly grainAmountUniform: Node
  private readonly motionAmountUniform: Node
  private readonly motionSpeedUniform: Node
  private readonly pointColorUniforms: {
    blue: Node
    green: Node
    red: Node
  }[]
  private readonly pointPositionUniforms: {
    x: Node
    y: Node
  }[]
  private readonly pointWeightUniforms: Node[]
  private readonly timeUniform: Node
  private readonly loopPhaseUniform: Node
  private readonly coreUniform: Node
  private readonly vignetteRadiusUniform: Node
  private readonly vignetteSoftnessUniform: Node
  private readonly vignetteStrengthUniform: Node
  private noiseSeed = 0
  private readonly vortexAmountUniform: Node
  private readonly warpAmountUniform: Node
  private readonly warpBiasUniform: Node
  private readonly warpDecayUniform: Node
  private readonly warpScaleUniform: Node

  private isAnimated = true
  private motionStyle: MotionStyle = "original"
  private motionSpeed = 0.2
  private loopSeconds = FALLBACK_LOOP_SECONDS
  private noiseMode: NoiseMode = "simplex"
  private tonemapMode: TonemapMode = "aces"
  private warpIterations = 1

  constructor(layerId: string) {
    super(layerId)
    this.timeUniform = uniform(0)
    this.loopPhaseUniform = uniform(1)
    this.coreUniform = uniform(0)
    this.animateUniform = uniform(1)
    this.aspectUniform = uniform(1)
    this.activePointsUniform = uniform(5)
    this.warpAmountUniform = uniform(0.18)
    this.warpBiasUniform = uniform(0.5)
    this.warpDecayUniform = uniform(1)
    this.warpScaleUniform = uniform(1.4)
    this.vortexAmountUniform = uniform(0.12)
    this.motionAmountUniform = uniform(0.18)
    this.motionSpeedUniform = uniform(0.2)
    this.falloffUniform = uniform(1.85)
    this.glowStrengthUniform = uniform(0.18)
    this.glowThresholdUniform = uniform(0.62)
    this.grainAmountUniform = uniform(0.03)
    this.vignetteStrengthUniform = uniform(0.18)
    this.vignetteRadiusUniform = uniform(0.9)
    this.vignetteSoftnessUniform = uniform(0.32)
    this.pointColorUniforms = Array.from({ length: 5 }, () => ({
      blue: uniform(1),
      green: uniform(1),
      red: uniform(1),
    }))
    this.pointPositionUniforms = Array.from({ length: 5 }, () => ({
      x: uniform(0),
      y: uniform(0),
    }))
    this.pointWeightUniforms = Array.from({ length: 5 }, () => uniform(1))
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    const activePoints =
      typeof params.activePoints === "number"
        ? Math.max(2, Math.min(5, Math.round(params.activePoints)))
        : 5
    const simple = params.distortionMode === "simple"
    const softness = unit(params.softness, 0.6)
    const warp = unit(params.warp, 0.3)
    const detail = unit(params.detail, 0.2)
    const noiseSeed =
      typeof params.noiseSeed === "number" ? params.noiseSeed : 0
    const warpAmountRaw =
      typeof params.warpAmount === "number"
        ? Math.max(0, params.warpAmount)
        : 0.18
    const warpAmount = simple ? warp * 0.75 : warpAmountRaw
    const warpScaleRaw =
      typeof params.warpScale === "number"
        ? Math.max(0.05, params.warpScale)
        : 1.4
    const warpScale = simple ? 0.55 + warp * 0.6 + detail * 1.6 : warpScaleRaw
    const warpIterationsRaw =
      typeof params.warpIterations === "number"
        ? Math.max(1, Math.min(5, Math.round(params.warpIterations)))
        : 1
    const warpIterations = simple ? 1 + Math.round(detail * 2) : warpIterationsRaw
    const warpDecayRaw =
      typeof params.warpDecay === "number"
        ? Math.max(0.1, params.warpDecay)
        : 1
    const warpDecay = simple ? 1.6 - detail * 0.8 : warpDecayRaw
    const warpBiasRaw =
      typeof params.warpBias === "number"
        ? Math.max(0, Math.min(1, params.warpBias))
        : 0.5
    const warpBias = simple ? 0.5 : warpBiasRaw
    const vortexAmountRaw =
      typeof params.vortexAmount === "number"
        ? params.vortexAmount
        : 0.12
    const vortexAmount = simple ? 0 : vortexAmountRaw
    const motionAmount =
      typeof params.motionAmount === "number"
        ? Math.max(0, params.motionAmount)
        : 0.18
    const motionSpeed =
      typeof params.motionSpeed === "number"
        ? Math.max(0, params.motionSpeed)
        : 0.2
    const motionStyle = resolveMotionStyle(params)
    const animateEnabled = motionStyle !== "off"
    const falloffRaw =
      typeof params.falloff === "number"
        ? Math.max(0.25, params.falloff)
        : 1.85
    const falloff = simple ? 4.6 - softness * 3.4 : falloffRaw
    const glowStrength =
      typeof params.glowStrength === "number"
        ? Math.max(0, params.glowStrength)
        : 0.18
    const glowThreshold =
      typeof params.glowThreshold === "number"
        ? Math.max(0, Math.min(1, params.glowThreshold))
        : 0.62
    const grainAmount =
      typeof params.grainAmount === "number"
        ? Math.max(0, params.grainAmount)
        : 0.03
    const vignetteStrength =
      typeof params.vignetteStrength === "number"
        ? Math.max(0, Math.min(1, params.vignetteStrength))
        : 0.18
    const vignetteRadius =
      typeof params.vignetteRadius === "number"
        ? Math.max(0.01, params.vignetteRadius)
        : 0.9
    const vignetteSoftness =
      typeof params.vignetteSoftness === "number"
        ? Math.max(0.01, params.vignetteSoftness)
        : 0.32

    this.activePointsUniform.value = activePoints
    this.animateUniform.value = animateEnabled ? 1 : 0
    this.warpAmountUniform.value = warpAmount
    this.warpBiasUniform.value = warpBias
    this.warpDecayUniform.value = warpDecay
    this.warpScaleUniform.value = warpScale
    this.vortexAmountUniform.value = vortexAmount
    this.motionAmountUniform.value = motionAmount
    this.motionSpeedUniform.value = motionSpeed
    this.falloffUniform.value = falloff
    this.coreUniform.value = simple ? 0.08 + softness * 0.22 : 0
    this.glowStrengthUniform.value = glowStrength
    this.glowThresholdUniform.value = glowThreshold
    this.grainAmountUniform.value = grainAmount
    this.vignetteStrengthUniform.value = vignetteStrength
    this.vignetteRadiusUniform.value = vignetteRadius
    this.vignetteSoftnessUniform.value = vignetteSoftness

    for (let index = 0; index < 5; index += 1) {
      const point = index + 1
      const colorKey = `point${point}Color`
      const positionKey = `point${point}Position`
      const weightKey = `point${point}Weight`
      const rgb = hexToRgb(
        typeof params[colorKey] === "string" ? params[colorKey] : "#ffffff"
      )
      const position = Array.isArray(params[positionKey])
        ? params[positionKey]
        : [0, 0]

      this.pointColorUniforms[index]!.red.value = rgb[0]
      this.pointColorUniforms[index]!.green.value = rgb[1]
      this.pointColorUniforms[index]!.blue.value = rgb[2]
      this.pointPositionUniforms[index]!.x.value = position[0] ?? 0
      this.pointPositionUniforms[index]!.y.value = position[1] ?? 0
      this.pointWeightUniforms[index]!.value =
        typeof params[weightKey] === "number"
          ? Math.max(0, params[weightKey])
          : 1
    }

    let nextTonemapMode: TonemapMode = "aces"
    let nextNoiseMode: NoiseMode = "simplex"

    const noiseType = simple ? "simplex" : params.noiseType
    switch (noiseType) {
      case "perlin":
      case "ridge":
      case "turbulence":
      case "value":
      case "voronoi":
        nextNoiseMode = noiseType
        break
      default:
        nextNoiseMode = "simplex"
        break
    }

    switch (params.tonemapMode) {
      case "none":
      case "reinhard":
      case "totos":
      case "cinematic":
        nextTonemapMode = params.tonemapMode
        break
      case "uncharted2":
        nextTonemapMode = "totos"
        break
      default:
        nextTonemapMode = "aces"
        break
    }

    this.isAnimated =
      animateEnabled && motionSpeed > 0 && (motionAmount > 0 || warpAmount > 0)
    this.motionSpeed = motionSpeed
    this.updateLoopPhase()

    let needsRebuild = false

    if (nextNoiseMode !== this.noiseMode) {
      this.noiseMode = nextNoiseMode
      needsRebuild = true
    }

    if (nextTonemapMode !== this.tonemapMode) {
      this.tonemapMode = nextTonemapMode
      needsRebuild = true
    }

    if (warpIterations !== this.warpIterations) {
      this.warpIterations = warpIterations
      needsRebuild = true
    }

    if (motionStyle !== this.motionStyle) {
      this.motionStyle = motionStyle
      needsRebuild = true
    }

    if (noiseSeed !== this.noiseSeed) {
      this.noiseSeed = noiseSeed
      needsRebuild = true
    }

    if (needsRebuild) {
      this.rebuildEffectNode()
    }
  }

  override resize(width: number, height: number): void {
    this.aspectUniform.value = width / Math.max(height, 1)
  }

  override needsContinuousRender(): boolean {
    return this.isAnimated
  }

  override updateTimelineDuration(duration: number): boolean {
    const next = duration > 0 ? duration : FALLBACK_LOOP_SECONDS
    if (next === this.loopSeconds) return false
    this.loopSeconds = next
    this.updateLoopPhase()
    return this.isAnimated
  }

  private updateLoopPhase(): void {
    const cycles = Math.max(1, Math.round((this.motionSpeed * this.loopSeconds) / 2))
    this.loopPhaseUniform.value = (Math.PI * 2 * cycles) / this.loopSeconds
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  protected override buildEffectNode(): Node {
    const hasRequiredUniforms =
      this.timeUniform &&
      this.aspectUniform &&
      this.activePointsUniform &&
      this.warpAmountUniform &&
      this.warpBiasUniform &&
      this.warpDecayUniform &&
      this.warpScaleUniform &&
      this.vortexAmountUniform &&
      this.motionAmountUniform &&
      this.motionSpeedUniform &&
      this.falloffUniform &&
      this.glowStrengthUniform &&
      this.glowThresholdUniform &&
      this.grainAmountUniform &&
      this.vignetteStrengthUniform &&
      this.vignetteRadiusUniform &&
      this.vignetteSoftnessUniform

    if (
      !hasRequiredUniforms ||
      this.pointColorUniforms.length === 0 ||
      this.pointPositionUniforms.length === 0 ||
      this.pointWeightUniforms.length === 0
    ) {
      return this.inputNode
    }

    return Fn(() => {
      const baseUv = vec2(
        uv().x.mul(2).sub(1).mul(this.aspectUniform),
        float(1).sub(uv().y).mul(2).sub(1)
      )
      const vignetteUv = vec2(
        uv().x.mul(2).sub(1),
        float(1).sub(uv().y).mul(2).sub(1)
      )
      const original = this.motionStyle === "original"
      const time = this.timeUniform
        .mul(this.motionSpeedUniform)
        .mul(this.animateUniform)
      const phase = this.timeUniform
        .mul(this.loopPhaseUniform)
        .mul(this.animateUniform)
      const amount = this.motionAmountUniform
      const breathe = this.motionStyle === "breathe"
      const zoom = breathe ? float(1).add(sin(phase).mul(amount).mul(0.06)) : float(1)
      const warpedUv = baseUv.div(zoom).toVar()
      const biasX = this.warpBiasUniform.mul(2)
      const biasY = float(1).sub(this.warpBiasUniform).mul(2)

      for (let i = 1; i <= this.warpIterations; i += 1) {
        const strength = this.warpAmountUniform.div(
          pow(float(i), this.warpDecayUniform)
        )
        const flowOffset =
          this.motionStyle === "flow"
            ? vec2(cos(phase), sin(phase)).mul(amount).mul(0.6)
            : vec2(0, 0)
        const warpInput = warpedUv
          .mul(this.warpScaleUniform)
          .add(float(this.noiseSeed).mul(73.7))
          .add(flowOffset)
        const timeOffsetX = original
          ? time.mul(0.1).add(float(i * 100))
          : float(i * 100)
        const timeOffsetY = original
          ? time.mul(0.1).add(float(i * 200))
          : float(i * 200)
        let noiseX: Node
        let noiseY: Node

        switch (this.noiseMode) {
          case "perlin":
            noiseX = perlinNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = perlinNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
          case "value":
            noiseX = valueNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = valueNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
          case "voronoi":
            noiseX = voronoiNoise3d(vec3(warpInput, timeOffsetX)).mul(2).sub(1)
            noiseY = voronoiNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
              .mul(2)
              .sub(1)
            break
          case "ridge":
            noiseX = ridgeNoise(vec3(warpInput, timeOffsetX)).mul(2).sub(1)
            noiseY = ridgeNoise(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
              .mul(2)
              .sub(1)
            break
          case "turbulence": {
            const disp = turbulence(warpInput, timeOffsetX.mul(20), {
              _amp: 0.7,
              _exp: 1.4,
              _freq: 2,
              _num: 10,
              _speed: 0.3,
            })
            noiseX = disp.x
            noiseY = disp.y
          }
            break
          default:
            noiseX = simplexNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = simplexNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
        }

        warpedUv.x.addAssign(strength.mul(noiseX).mul(biasX))
        warpedUv.y.addAssign(strength.mul(noiseY).mul(biasY))
      }

      const distanceFromCenter = max(
        dot(warpedUv, warpedUv),
        float(1e-4)
      ).sqrt()
      const vortex =
        this.motionStyle === "swirl"
          ? this.vortexAmountUniform.add(sin(phase).mul(amount).mul(1.2))
          : this.vortexAmountUniform
      const vortexAngle = distanceFromCenter.mul(vortex)
      const rotatedUv = vec2(
        warpedUv.x.mul(cos(vortexAngle)).sub(warpedUv.y.mul(sin(vortexAngle))),
        warpedUv.x.mul(sin(vortexAngle)).add(warpedUv.y.mul(cos(vortexAngle)))
      )

      const finalColor = vec3(0).toVar()
      const totalWeight = float(0).toVar()

      for (let index = 0; index < 5; index += 1) {
        const pointIndex = float(index + 1)
        const active = select(
          this.activePointsUniform.greaterThanEqual(pointIndex),
          float(1),
          float(0)
        )
        const drift = this.motionStyle === "drift"
        const harmonic = float(index % 2 === 0 ? 1 : 2)
        const legacyOffset = vec2(
          sin(time.mul(pointIndex.mul(0.73)).add(pointIndex)),
          cos(time.mul(pointIndex.mul(0.41)).add(pointIndex.mul(1.7)))
        ).mul(amount)
        const driftOffset = vec2(
          sin(phase.add(pointIndex.mul(1.3))),
          cos(phase.mul(harmonic).add(pointIndex.mul(2.1))).mul(0.8)
        ).mul(amount)
        let offset: Node = vec2(0, 0)
        if (original) offset = legacyOffset
        else if (drift) offset = driftOffset
        const pointPosition = vec2(
          this.pointPositionUniforms[index]!.x,
          this.pointPositionUniforms[index]!.y
        ).add(offset)
        const delta = rotatedUv.sub(pointPosition)
        const distance = max(
          dot(delta, delta).add(this.coreUniform.mul(this.coreUniform)),
          float(1e-4)
        ).sqrt()
        const baseWeight = float(1).div(
          max(pow(distance, this.falloffUniform), float(1e-4))
        )
        const pulse = breathe
          ? float(1).add(sin(phase.add(pointIndex.mul(1.25))).mul(amount).mul(0.6))
          : float(1)
        const weighted = baseWeight
          .mul(this.pointWeightUniforms[index]!)
          .mul(pulse)
          .mul(active)
        const color = vec3(
          this.pointColorUniforms[index]!.red,
          this.pointColorUniforms[index]!.green,
          this.pointColorUniforms[index]!.blue
        )

        finalColor.addAssign(color.mul(weighted))
        totalWeight.addAssign(weighted)
      }

      finalColor.assign(finalColor.div(max(totalWeight, float(1e-4))))

      switch (this.tonemapMode) {
        case "reinhard":
          finalColor.assign(reinhardTonemap(finalColor))
          break
        case "totos":
          finalColor.assign(totosTonemap(finalColor))
          break
        case "cinematic":
          finalColor.assign(cinematicTonemap(finalColor))
          break
        case "none":
          break
        default:
          finalColor.assign(acesTonemap(finalColor))
          break
      }

      const luma = dot(finalColor, vec3(0.2126, 0.7152, 0.0722))
      const glow = smoothstep(this.glowThresholdUniform, float(1), luma).mul(
        this.glowStrengthUniform
      )
      finalColor.addAssign(vec3(glow, glow, glow))

      const grain = grainTexturePattern(uv())
        .sub(0.5)
        .mul(this.grainAmountUniform)
      finalColor.addAssign(vec3(grain, grain, grain))

      const vignetteDistance = max(
        dot(vignetteUv, vignetteUv),
        float(1e-4)
      ).sqrt()
      const vignette = smoothstep(
        this.vignetteRadiusUniform,
        this.vignetteRadiusUniform.sub(this.vignetteSoftnessUniform),
        vignetteDistance
      )
      const vignetteMix = mix(float(1), vignette, this.vignetteStrengthUniform)
      finalColor.mulAssign(vignetteMix)

      return vec4(
        clamp(
          finalColor,
          vec3(float(0), float(0), float(0)),
          vec3(float(1), float(1), float(1))
        ),
        float(1)
      )
    })()
  }
}
