import {
  abs,
  clamp,
  cos,
  float,
  floor,
  length,
  max,
  min,
  mix,
  pow,
  sin,
  smoothstep,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  step,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  areDefaultColorCurves,
  buildCurveLut,
  COLOR_CURVE_CHANNELS,
} from "@/lib/color-curves"
import { hasActiveFilmFinish } from "@/lib/editor/scene-film"
import { buildColorMapBytes } from "@/renderer/color-map-lut"
import type { SceneConfig } from "@/types/editor"

type Node = TSLNode
const CURVE_LUT_SIZE = 1024

function isDefaultConfig(config: SceneConfig): boolean {
  return (
    config.exposure === 0 &&
    config.brightness === 0 &&
    config.contrast === 0 &&
    config.saturation === 1 &&
    config.vibrance === 0 &&
    config.hue === 0 &&
    config.temperature === 0 &&
    config.tint === 0 &&
    !config.invert &&
    config.channelMixer.rr === 1 &&
    config.channelMixer.rg === 0 &&
    config.channelMixer.rb === 0 &&
    config.channelMixer.gr === 0 &&
    config.channelMixer.gg === 1 &&
    config.channelMixer.gb === 0 &&
    config.channelMixer.br === 0 &&
    config.channelMixer.bg === 0 &&
    config.channelMixer.bb === 1 &&
    areDefaultColorCurves(config.colorCurves) &&
    config.clampMin === 0 &&
    config.clampGamma === 1 &&
    config.clampMax === 1 &&
    !config.quantizeEnabled &&
    config.quantizeLevels === 256 &&
    config.colorMap === null &&
    !hasActiveFilmFinish(config)
  )
}

function srgbToLinear(color: THREE.Vector3): THREE.Vector3 {
  const decode = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return new THREE.Vector3(decode(color.x), decode(color.y), decode(color.z))
}

function hexToVector3(hex: string): THREE.Vector3 {
  const value = Number.parseInt(hex.slice(1), 16)
  return new THREE.Vector3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  )
}

function getColorCurvesSignature(curves: SceneConfig["colorCurves"]): string {
  return COLOR_CURVE_CHANNELS.map((channelId) =>
    curves[channelId].points
      .map((point) => `${point.x},${point.y}`)
      .join("|")
  ).join("||")
}

export class ScenePostProcess {
  private readonly scene: THREE.Scene
  private readonly camera: THREE.OrthographicCamera
  private readonly material: THREE.MeshBasicNodeMaterial
  private readonly inputNode: Node

  private readonly exposureUniform: Node
  private readonly brightnessUniform: Node
  private readonly contrastUniform: Node
  private readonly saturationUniform: Node
  private readonly vibranceUniform: Node
  private readonly hueUniform: Node
  private readonly temperatureUniform: Node
  private readonly tintUniform: Node
  private readonly invertUniform: Node
  private readonly mixerRowR: Node
  private readonly mixerRowG: Node
  private readonly mixerRowB: Node
  private readonly clampMinUniform: Node
  private readonly clampGammaUniform: Node
  private readonly clampMaxUniform: Node
  private readonly quantizeEnabledUniform: Node
  private readonly quantizeLevelsUniform: Node
  private readonly colorMapEnabledUniform: Node
  private readonly outputAspectUniform: Node
  private readonly vignetteAmountUniform: Node
  private readonly vignetteInnerUniform: Node
  private readonly vignetteOuterUniform: Node
  private readonly vignetteRoundnessUniform: Node
  private readonly letterboxEnabledUniform: Node
  private readonly letterboxAspectUniform: Node
  private readonly letterboxColorUniform: Node
  private readonly splitShadowColorUniform: Node
  private readonly splitShadowAmountUniform: Node
  private readonly splitHighlightColorUniform: Node
  private readonly splitHighlightAmountUniform: Node
  private readonly splitBalanceUniform: Node
  private readonly colorMapTexture: THREE.DataTexture
  private readonly curveTextures: Record<
    "rgb" | "red" | "green" | "blue",
    THREE.DataTexture
  >
  private colorCurvesSignature = ""

  active = false

  constructor() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.material.blending = THREE.NoBlending

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    this.inputNode = tslTexture(new THREE.Texture(), renderTargetUv)

    this.exposureUniform = uniform(0)
    this.brightnessUniform = uniform(0)
    this.contrastUniform = uniform(0)
    this.saturationUniform = uniform(1)
    this.vibranceUniform = uniform(0)
    this.hueUniform = uniform(0)
    this.temperatureUniform = uniform(0)
    this.tintUniform = uniform(0)
    this.invertUniform = uniform(0)
    this.mixerRowR = uniform(new THREE.Vector3(1, 0, 0))
    this.mixerRowG = uniform(new THREE.Vector3(0, 1, 0))
    this.mixerRowB = uniform(new THREE.Vector3(0, 0, 1))
    this.clampMinUniform = uniform(0)
    this.clampGammaUniform = uniform(1)
    this.clampMaxUniform = uniform(1)
    this.quantizeEnabledUniform = uniform(0)
    this.quantizeLevelsUniform = uniform(256)
    this.colorMapEnabledUniform = uniform(0)
    this.outputAspectUniform = uniform(16 / 9)
    this.vignetteAmountUniform = uniform(0)
    this.vignetteInnerUniform = uniform(0.35)
    this.vignetteOuterUniform = uniform(1.05)
    this.vignetteRoundnessUniform = uniform(0.5)
    this.letterboxEnabledUniform = uniform(0)
    this.letterboxAspectUniform = uniform(2.39)
    this.letterboxColorUniform = uniform(new THREE.Vector3(0, 0, 0))
    this.splitShadowColorUniform = uniform(new THREE.Vector3(0.5, 0.5, 0.5))
    this.splitShadowAmountUniform = uniform(0)
    this.splitHighlightColorUniform = uniform(new THREE.Vector3(0.5, 0.5, 0.5))
    this.splitHighlightAmountUniform = uniform(0)
    this.splitBalanceUniform = uniform(0)
    this.curveTextures = {
      blue: new THREE.DataTexture(
        buildCurveLut([], CURVE_LUT_SIZE),
        CURVE_LUT_SIZE,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      ),
      green: new THREE.DataTexture(
        buildCurveLut([], CURVE_LUT_SIZE),
        CURVE_LUT_SIZE,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      ),
      red: new THREE.DataTexture(
        buildCurveLut([], CURVE_LUT_SIZE),
        CURVE_LUT_SIZE,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      ),
      rgb: new THREE.DataTexture(
        buildCurveLut([], CURVE_LUT_SIZE),
        CURVE_LUT_SIZE,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      ),
    }

    const lutData = buildColorMapBytes([])
    this.colorMapTexture = new THREE.DataTexture(
      lutData,
      256,
      1,
      THREE.RGBAFormat
    )
    this.colorMapTexture.magFilter = THREE.LinearFilter
    this.colorMapTexture.minFilter = THREE.LinearFilter
    this.colorMapTexture.needsUpdate = true
    for (const channelId of COLOR_CURVE_CHANNELS) {
      const texture = this.curveTextures[channelId]
      texture.magFilter = THREE.LinearFilter
      texture.minFilter = THREE.LinearFilter
      texture.needsUpdate = true
    }

    this.material.colorNode = this.buildColorNode()

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  update(config: SceneConfig): boolean {
    const colorCurvesSignature = getColorCurvesSignature(config.colorCurves)
    const shouldBeActive = !isDefaultConfig(config)

    if (!shouldBeActive) {
      this.colorCurvesSignature = colorCurvesSignature
      this.active = false
      return false
    }

    this.active = true
    this.exposureUniform.value = config.exposure
    this.brightnessUniform.value = config.brightness
    this.contrastUniform.value = config.contrast
    this.saturationUniform.value = Math.max(0, config.saturation)
    this.vibranceUniform.value = config.vibrance
    this.hueUniform.value = (config.hue * Math.PI) / 180
    this.temperatureUniform.value = config.temperature
    this.tintUniform.value = config.tint
    this.invertUniform.value = config.invert ? 1 : 0

    ;(this.mixerRowR.value as THREE.Vector3).set(
      config.channelMixer.rr,
      config.channelMixer.rg,
      config.channelMixer.rb
    )
    ;(this.mixerRowG.value as THREE.Vector3).set(
      config.channelMixer.gr,
      config.channelMixer.gg,
      config.channelMixer.gb
    )
    ;(this.mixerRowB.value as THREE.Vector3).set(
      config.channelMixer.br,
      config.channelMixer.bg,
      config.channelMixer.bb
    )

    this.clampMinUniform.value = config.clampMin
    this.clampGammaUniform.value = Math.max(0.01, config.clampGamma)
    this.clampMaxUniform.value = config.clampMax
    this.quantizeEnabledUniform.value = config.quantizeEnabled ? 1 : 0
    this.quantizeLevelsUniform.value = config.quantizeLevels

    if (colorCurvesSignature !== this.colorCurvesSignature) {
      for (const channelId of COLOR_CURVE_CHANNELS) {
        const lutData = buildCurveLut(
          config.colorCurves[channelId].points,
          CURVE_LUT_SIZE
        )
        ;(this.curveTextures[channelId].image.data as Float32Array).set(lutData)
        this.curveTextures[channelId].needsUpdate = true
      }
      this.colorCurvesSignature = colorCurvesSignature
    }

    if (config.colorMap) {
      this.colorMapEnabledUniform.value = 1
      const lutData = buildColorMapBytes(config.colorMap.stops)
      ;(this.colorMapTexture.image.data as Uint8Array).set(lutData)
      this.colorMapTexture.needsUpdate = true
    } else {
      this.colorMapEnabledUniform.value = 0
    }

    const vignette = config.vignette
    this.vignetteAmountUniform.value = vignette ? vignette.amount : 0
    if (vignette) {
      this.vignetteInnerUniform.value = vignette.inner
      this.vignetteOuterUniform.value = Math.max(vignette.outer, vignette.inner + 0.01)
      this.vignetteRoundnessUniform.value = vignette.roundness
    }

    const letterbox = config.letterbox
    this.letterboxEnabledUniform.value = letterbox ? 1 : 0
    if (letterbox) {
      this.letterboxAspectUniform.value = letterbox.aspect
      // Bars are written into the linear pipeline; encode back exactly.
      ;(this.letterboxColorUniform.value as THREE.Vector3).copy(
        srgbToLinear(hexToVector3(letterbox.color))
      )
    }

    const splitTone = config.splitTone
    this.splitShadowAmountUniform.value = splitTone ? splitTone.shadowAmount : 0
    this.splitHighlightAmountUniform.value = splitTone
      ? splitTone.highlightAmount
      : 0
    if (splitTone) {
      ;(this.splitShadowColorUniform.value as THREE.Vector3).copy(
        hexToVector3(splitTone.shadowColor)
      )
      ;(this.splitHighlightColorUniform.value as THREE.Vector3).copy(
        hexToVector3(splitTone.highlightColor)
      )
      this.splitBalanceUniform.value = splitTone.balance
    }

    return true
  }

  /** Output width/height, for letterbox bars and vignette shape. */
  setOutputAspect(aspect: number): boolean {
    const next = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
    if (next === this.outputAspectUniform.value) return false
    this.outputAspectUniform.value = next
    return this.active
  }

  render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget
  ): void {
    this.inputNode.value = inputTexture
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.scene.clear()
    this.material.dispose()
    for (const channelId of COLOR_CURVE_CHANNELS) {
      this.curveTextures[channelId].dispose()
    }
    this.colorMapTexture.dispose()
  }

  /**
   * Split tone, vignette and letterbox. Neutral (exact passthrough) when
   * their amounts are zero / disabled, so projects without them are
   * unchanged.
   */
  private applyFilmFinish(input: Node): Node {
    // The pipeline works in linear light (half-float targets, sRGB textures
    // decoded on sampling, sRGB encoding only at the canvas).
    let color: Node = input
    const lumaOf = (value: Node) =>
      float(value.x)
        .mul(float(0.2126))
        .add(float(value.y).mul(float(0.7152)))
        .add(float(value.z).mul(float(0.0722)))

    // Split tone, in display (sRGB-encoded) space so the pivot and the
    // tint colors behave perceptually: shift chroma toward each tint without
    // changing luminance. Balance moves the pivot.
    const display = sRGBTransferOETF(clamp(color, 0, 1))
    const luma = lumaOf(display)
    const pivot = float(0.5).add(this.splitBalanceUniform.mul(0.25))
    const shadowWeight = float(1).sub(smoothstep(float(0), pivot, luma))
    const highlightWeight = smoothstep(pivot, float(1), luma)
    const shadowTint = this.splitShadowColorUniform
    const highlightTint = this.splitHighlightColorUniform
    const toned = clamp(
      display
        .add(
          shadowTint
            .sub(vec3(lumaOf(shadowTint)))
            .mul(shadowWeight.mul(this.splitShadowAmountUniform))
        )
        .add(
          highlightTint
            .sub(vec3(lumaOf(highlightTint)))
            .mul(highlightWeight.mul(this.splitHighlightAmountUniform))
        ),
      0,
      1
    )
    const splitActive = step(
      float(0.0001),
      max(this.splitShadowAmountUniform, this.splitHighlightAmountUniform)
    )
    color = mix(color, sRGBTransferEOTF(toned), splitActive)

    // Vignette: a true exposure change in stops (values are linear).
    const centered = uv().sub(0.5).mul(2)
    const stretch = mix(
      float(1),
      this.outputAspectUniform,
      this.vignetteRoundnessUniform
    )
    const shaped = vec2(centered.x.mul(stretch), centered.y)
    const distance = length(shaped).div(length(vec2(stretch, float(1))))
    const mask = smoothstep(
      this.vignetteInnerUniform,
      this.vignetteOuterUniform,
      distance
    )
    color = color.mul(
      pow(float(2), this.vignetteAmountUniform.mul(mask).negate())
    )

    // Letterbox (bars top/bottom when the target is wider than the frame,
    // pillarbox when narrower). Last, so bars stay a pure color.
    const frameAspect = this.outputAspectUniform
    const target = this.letterboxAspectUniform
    const barHeight = max(float(1).sub(frameAspect.div(target)), float(0)).mul(
      0.5
    )
    const barWidth = max(float(1).sub(target.div(frameAspect)), float(0)).mul(
      0.5
    )
    const fromCenter = abs(uv().sub(0.5))
    const inBar = max(
      step(float(0.5).sub(barHeight), fromCenter.y),
      step(float(0.5).sub(barWidth), fromCenter.x)
    )
    const barActive = this.letterboxEnabledUniform.mul(
      max(step(float(0.0001), barHeight), step(float(0.0001), barWidth))
    )
    return mix(color, this.letterboxColorUniform, inBar.mul(barActive))
  }

  private buildColorNode(): Node {
    const input = this.inputNode
    const sampleCurve = (texture: THREE.DataTexture, value: Node) =>
      tslTexture(texture, vec2(clamp(value, 0, 1), float(0.5))).r
    let color: Node = vec3(input.r, input.g, input.b)

    // Exposure
    const exposureScale = pow(float(2), this.exposureUniform)
    color = color.mul(vec3(exposureScale, exposureScale, exposureScale))

    // Brightness
    color = color.add(
      vec3(
        this.brightnessUniform,
        this.brightnessUniform,
        this.brightnessUniform
      )
    )

    // Contrast: (color - 0.5) * (1 + contrast) + 0.5
    const contrastScale = float(1).add(this.contrastUniform)
    color = color
      .sub(vec3(float(0.5), float(0.5), float(0.5)))
      .mul(vec3(contrastScale, contrastScale, contrastScale))
      .add(vec3(float(0.5), float(0.5), float(0.5)))

    // Saturation + Vibrance + Hue
    const lumaPreGrade = float(color.x)
      .mul(float(0.2126))
      .add(float(color.y).mul(float(0.7152)))
      .add(float(color.z).mul(float(0.0722)))
    const saturatedColor = mix(
      vec3(lumaPreGrade, lumaPreGrade, lumaPreGrade),
      color,
      this.saturationUniform
    )
    const saturatedLuma = float(saturatedColor.x)
      .mul(float(0.2126))
      .add(float(saturatedColor.y).mul(float(0.7152)))
      .add(float(saturatedColor.z).mul(float(0.0722)))
    const saturatedGray = vec3(saturatedLuma, saturatedLuma, saturatedLuma)
    const colorMax = max(
      float(saturatedColor.x),
      max(float(saturatedColor.y), float(saturatedColor.z))
    )
    const colorMin = min(
      float(saturatedColor.x),
      min(float(saturatedColor.y), float(saturatedColor.z))
    )
    const colorSaturation = clamp(colorMax.sub(colorMin), float(0), float(1))
    const vibranceFactor = clamp(
      float(1).add(this.vibranceUniform.mul(float(1).sub(colorSaturation))),
      float(0),
      float(2)
    )
    const saturated = mix(
      saturatedGray,
      saturatedColor,
      vibranceFactor
    )
    const hueCos = float(cos(this.hueUniform))
    const hueSin = float(sin(this.hueUniform))
    color = vec3(
      float(saturated.x)
        .mul(
          float(0.213)
            .add(hueCos.mul(float(0.787)))
            .sub(hueSin.mul(float(0.213)))
        )
        .add(
          float(saturated.y).mul(
            float(0.715)
              .sub(hueCos.mul(float(0.715)))
              .sub(hueSin.mul(float(0.715)))
          )
        )
        .add(
          float(saturated.z).mul(
            float(0.072)
              .sub(hueCos.mul(float(0.072)))
              .add(hueSin.mul(float(0.928)))
          )
        ),
      float(saturated.x)
        .mul(
          float(0.213)
            .sub(hueCos.mul(float(0.213)))
            .add(hueSin.mul(float(0.143)))
        )
        .add(
          float(saturated.y).mul(
            float(0.715)
              .add(hueCos.mul(float(0.285)))
              .add(hueSin.mul(float(0.14)))
          )
        )
        .add(
          float(saturated.z).mul(
            float(0.072)
              .sub(hueCos.mul(float(0.072)))
              .sub(hueSin.mul(float(0.283)))
          )
        ),
      float(saturated.x)
        .mul(
          float(0.213)
            .sub(hueCos.mul(float(0.213)))
            .sub(hueSin.mul(float(0.787)))
        )
        .add(
          float(saturated.y).mul(
            float(0.715)
              .sub(hueCos.mul(float(0.715)))
              .add(hueSin.mul(float(0.715)))
          )
        )
        .add(
          float(saturated.z).mul(
            float(0.072)
              .add(hueCos.mul(float(0.928)))
              .add(hueSin.mul(float(0.072)))
          )
        )
    )

    // Temperature / Tint
    color = color.add(
      vec3(
        this.temperatureUniform
          .mul(float(0.12))
          .add(this.tintUniform.mul(float(0.05))),
        this.temperatureUniform
          .mul(float(0.02))
          .sub(this.tintUniform.mul(float(0.1))),
        this.temperatureUniform
          .mul(float(-0.12))
          .add(this.tintUniform.mul(float(0.05)))
      )
    )

    // Channel mixer (3x3 matrix via dot products per row)
    const r = float(color.x)
      .mul(this.mixerRowR.x)
      .add(float(color.y).mul(this.mixerRowR.y))
      .add(float(color.z).mul(this.mixerRowR.z))
    const g = float(color.x)
      .mul(this.mixerRowG.x)
      .add(float(color.y).mul(this.mixerRowG.y))
      .add(float(color.z).mul(this.mixerRowG.z))
    const b = float(color.x)
      .mul(this.mixerRowB.x)
      .add(float(color.y).mul(this.mixerRowB.y))
      .add(float(color.z).mul(this.mixerRowB.z))
    color = vec3(r, g, b)

    // Curves: apply master RGB, then per-channel remaps.
    color = vec3(
      sampleCurve(this.curveTextures.rgb, float(color.x)),
      sampleCurve(this.curveTextures.rgb, float(color.y)),
      sampleCurve(this.curveTextures.rgb, float(color.z))
    )
    color = vec3(
      sampleCurve(this.curveTextures.red, float(color.x)),
      sampleCurve(this.curveTextures.green, float(color.y)),
      sampleCurve(this.curveTextures.blue, float(color.z))
    )

    // Invert
    color = mix(
      color,
      vec3(float(1), float(1), float(1)).sub(color),
      this.invertUniform
    )

    // Clamp / remap: (color - min) / (max - min)
    const range = max(
      float(this.clampMaxUniform).sub(this.clampMinUniform),
      float(0.001)
    )
    color = color
      .sub(
        vec3(this.clampMinUniform, this.clampMinUniform, this.clampMinUniform)
      )
      .div(vec3(range, range, range))
    const gamma = max(this.clampGammaUniform, float(0.01))
    const inverseGamma = float(1).div(gamma)
    color = pow(
      clamp(color, 0, 1),
      vec3(inverseGamma, inverseGamma, inverseGamma)
    )

    // Quantize
    const levels = this.quantizeLevelsUniform
    const levelsMinusOne = max(float(levels).sub(float(1)), float(1))
    const clampedColor = clamp(color, 0, 1)
    const quantizedColor = floor(
      clamp(color, 0, 1)
        .mul(vec3(levelsMinusOne, levelsMinusOne, levelsMinusOne))
        .add(vec3(float(0.5), float(0.5), float(0.5)))
    ).div(vec3(levelsMinusOne, levelsMinusOne, levelsMinusOne))
    color = mix(clampedColor, quantizedColor, this.quantizeEnabledUniform)

    // Color map LUT
    const luma = float(color.x)
      .mul(float(0.2126))
      .add(float(color.y).mul(float(0.7152)))
      .add(float(color.z).mul(float(0.0722)))
    const lutSample = tslTexture(
      this.colorMapTexture,
      vec2(clamp(luma, 0, 1), float(0.5))
    )
    color = mix(
      color,
      vec3(lutSample.r, lutSample.g, lutSample.b),
      this.colorMapEnabledUniform
    )

    color = this.applyFilmFinish(clamp(color, 0, 1))

    // Final clamp
    color = clamp(color, 0, 1)

    return vec4(color, input.a)
  }
}
