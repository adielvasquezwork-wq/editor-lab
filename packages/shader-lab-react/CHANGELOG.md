# @basementstudio/shader-lab

## 3.1.0

### Minor Changes

- 6b025d8: Add an Annotations effect layer: seeded, edge-guided or painted placement of decorative technical marks (target rings, dashed circles and boxes, crosshairs, rulers, connectors, readouts, metadata blocks) with presets, editable text, monochrome or palette colors, rendered identically in the editor and runtime.
- 879fbd0: Annotations can place marks by image regions, draw connected dots and turn individual elements. Placement → Regions groups the image below into areas of similar tone and color from the same low-resolution field Edges already reads, then frames regions with boxes, traces their outlines with dots and tags them with labels; region ids persist across video frames so marks follow the image instead of flickering. Connected Dots adds small constellations of dots linked to their nearest neighbours. Rotation Jitter turns rings, crosses and boxes by a seeded angle, and Align to Edges turns them along the image edges or each region's long axis. All new controls default to off, so existing annotations render exactly as before.
- 0b0ed48: Blob Tracking gains corner-bracket frames, edge dots along each blob's silhouette, and decorative label modes (prefix + seeded ID, custom list). Existing scenes keep their outline and coordinate labels.
- 3aca260: Brush masks gain Feather: painted mask edges soften by a keyframable distance measured from the painted edge, the same way ellipse and rectangle masks soften. Feather 0 keeps a hard painted edge; the existing default of 0.01 softens old brush masks very slightly.
- 6968b06: Add optional, seeded Edge Scatter to Photographic Cells regions and painted reveals. Scatter fragments boundaries without moving source detail or adding texture samples. Missing values and zero preserve existing projects.
- ec03e76: Connected Dots gains Edge Snap, which pulls each point onto the strongest image edge inside its cell so dots, links and mesh triangles trace contours, and two styles that use it: Contour Graph and Facets. At 0 (the default, and for every existing style and saved project) the output is unchanged. Mesh mode now reads its points from the per-cell pre-pass, about twice as fast at 1080p with identical pixels.
- d99ff7a: Add a Connected Dots effect layer: the image becomes jittered points linked to their neighbors. Graph links dots by tone with links that thicken in the darks; Blobs melts dots and links into organic masses; Plexus draws thin lines that fade with distance. Circle, square, plus or ring dots sized by tone, a tone cutoff that drops the background, palette-by-tone (flat bands from an editable ramp of up to 8 stops), source or ink color, a color, image or transparent background, and Drift so links form and break over time. Four starting styles (Portrait Graph, Ink Blobs, Plexus, Constellation).
- 297b5d3: Connected Dots gains a Mesh mode (flat-colored triangles between the points, with Fill, Wire and Wire Color) and six new styles: Molecule, Circuit, Neural, Riso, Low Poly and Wireframe.
- 72ee931: Add Displaced Rings with rings/half-discs, progressive transforms, seeded offsets, and Distort/Cutout output. Support transformed coverage in the editor and runtime so grouped photographic cutouts reveal external layers, with opacity interpolating color and alpha together.
- 38dd8e2: Add a Dot Grid effect layer: an exact, unrotated dot grid fixed to the artboard where every cell gets a dot that grows with the tone, with Level, Contrast, Softness, circle or square dots, single-color or source ink, a background and a blurred underlay. Four starting styles (Coordinate, Source Dots, Night, Pixel Grid). It renders identically in the editor, exports and the runtime package. Halftone is unchanged.
- 53340e0: Support isolated groups in exported ShaderLabConfig layer lists using group layers and parentId references. Evaluate group visibility and opacity before building the render tree, preserving child effect scope in composition and headless rendering. Existing flat configs remain compatible.
- cd15793: Add an Erosion effect layer that crumbles the image into speckle along its edges, light or dark tones, or the border of a cutout, with Erode, Edge Width, Speckle Size, Clumping and Scatter (fragments thrown across the edge), revealing paper or transparent holes, frozen or animated. Three starting styles (Disintegrate, Paper Erosion, Crumbled Cutout). It renders identically in the editor, exports and the runtime package.
- a680f8a: Add a Flares effect layer: light flares from the brightest small points in the image, with Threshold, Isolation (large bright areas stay clean), Intensity, 1 to 16 rays, rotation, length, secondary ray length, length jitter, thickness, falloff, ray and core colors and a core glow. Five starting styles (Cross, Star, Starburst, Asterisk, Anamorphic). Flares extend over transparent areas. It renders identically in the editor, exports and the runtime package.
- 49596c1: Add a Blur effect layer built on a seven-level blur pyramid with B-spline sampling, so any radius stays smooth and the blur size can change per pixel. Blur From: Uniform, Depth (depth of field from the scene depth map), Linear and Radial focus zones, or Luminance, with Focus, Focus Range, Transition, Center, Band Angle and Invert Focus. Kinds: Gaussian, Lens bokeh with Highlights, and Motion. Grain keeps large blurs from banding. Five starting styles (Depth of Field, Tilt-Shift, Vignette, Soft, Motion). Directional Blur, Progressive Blur and Fluted Glass leave the add-layer menu; saved projects keep rendering them.
- 0356efb: Add a Glass effect layer that replaces Fluted Glass: reeded (round or sharp flutes), hammered, pyramid, hex or frosted glass where every cell is a small lens, the scene blurs with its distance behind the glass (uniform or from the depth map, through the shared blur pyramid), and thin rims, grooves, frost, dispersion and tint make it read as glass. Six starting styles (Reeded, Frosted Reeded, Hammered, Pyramid, Hex, Frosted). The Blur layer now shares the same blur pyramid module.
- 4b2858b: Gradient Map ramps can be animated. Timeline tracks with the new `gradient` value type blend between two ramps: stops glide when both ramps have the same number of stops, and when the counts differ the shorter ramp gains stops that leave its look unchanged, so the in-between frames stay a smooth crossfade. Each keyframe keeps its easing. Scenes without ramp tracks render exactly as before.
- af60e65: Add a Gradient Map effect layer that recolors by tone with an editable ramp, presets, Amount and Invert. It renders identically in the editor, exports and the runtime package, and can be scoped with groups and masks. The global Color Map is unchanged.
- 6c289a3: Add a Grain effect layer: photographic film grain for photos and video, with Amount, Size in document pixels, Roughness, Clumping, Chroma that leaves brightness unchanged, a tonal Response that favors the midtones like film, and Soft Light, Overlay or Add blending. Speed 0 holds one pattern; above 0 it steps to a new pattern 24 times a second like film. Five starting styles (Fine 35mm, Color Negative, 16mm, Pushed, Digital Noise). It renders identically in the editor, exports and the runtime package.
- 8dc3c4d: Add reusable layer masks: linear and radial gradients, ellipse, rectangle and brush on any layer or group. Masks either limit an effect or cut coverage, support invert and feather (measured from the true shape edge, so stretched ellipses soften evenly), and render identically in the editor, PNG/video export and the runtime package.
- a992901: Add a Lumen Print effect layer: an analog photographic print with sun-print toning through an editable palette, solarization with edge lines, diffusion and halation, highlights washed into paper, burned borders and grain. Six starting styles (Lumen, Cyanotype, Burned, Sabattier, Washed, Eroded). It renders identically in the editor, exports and the runtime package.
- 8c5b58b: Mesh Gradient gets eight new smooth presets (Peach, Lagoon, Dusk, Citrus, Mint, Aurora, Ink, Basement), a Simple distortion mode with Softness, Warp and Detail, and motion styles (Drift, Breathe, Swirl, Flow) that loop seamlessly over the timeline duration. Passes receive the timeline duration through a new `updateTimelineDuration` hook. Saved gradients keep their exact look: they load in Advanced mode with their Original motion.
- ec99d9f: Add an Outline effect layer on a jump-flood distance field: solid, double, dashed or scalloped cloud outlines around text, cutouts or dark and light shapes, with offset (negative draws inside), width, repeated rings, fill between shape and outline, and a line-only mode. Six starting styles (Stroke, Cloud, Sticker, Contour Rings, Cut Line, Double).
- 7085dff: Pattern motifs can recolor their SVG files. With Color Mode set to Motif colors, the editor lists every color found in the SVG motifs under File colors, and each one can be replaced, the same way SVG shapes work. Image motifs and projects without a palette render exactly as before.
- 12dcf0c: Pattern layers can use your own motifs: set `preset: "custom"` and list up to ten images or SVGs in `patternAssets`, ordered from the lightest tones to the darkest. Each motif takes an equal band of tones, and Invert reverses the order. The new `colorMode: "original"` keeps each motif's own colors; the other color modes use the motif's alpha as its shape.
- d8c72e9: Add a Photocopy effect layer: crushed toner over paper with Threshold, Contrast and Generations (a copy of a copy), uneven fill, toner speckle, drum streaks, misregistration, grain and fold creases, any toner and paper color or transparent paper. Five starting styles (Office Copy, Zine, Fax, Blueprint Copy, Pink Flyer).
- 897c1c0: Add persisted Paint selection to Photographic Cells. Painted coverage shares cell geometry and perimeter outlines with automatic regions, stays anchored in composition space, and reuses its GPU texture while the source animates.
- cbb925c: Add coherent Photographic Cells regions with separate region and cell sizes, image-guided or seeded selection, and None/Perimeter/Every Cell outline modes. Preserve saved cell layouts and contour settings while new layers start with connected regions and fine perimeter outlines.
- 75968e3: Add Photographic Cells with light/dark/random selection, irregular rectangular cells, full-resolution photographic interiors, alpha cutouts, and optional outlines. Support the effect in runtime configs and grouped compositions. Apply user-curated editor defaults to new Displaced Rings layers while preserving saved settings and renderer fallbacks.
- 3177d02: Rework Plotter into a pen-plotter drawing: Hatch (crosshatch layers by tone), Flow (dense lines following the forms), Contour (smooth tone contours), Squiggle (rows that wave in the darks), Spiral (one continuous spiral whose line thickens with tone) and Stipple (dots by density), with pen width, pressure, wobble, ink bleed, ink, source or three pens, paper color, grain or transparent paper, and seven starting styles. The original parameters and their defaults are kept, so saved plotter layers still open.
- 151a9d5: Add a Relief effect layer that embosses or debosses the image into a lit surface, with height from luminance, scene depth or a cutout's alpha, Depth, Bevel, light angle, elevation and ambient, a single material or the source colors with specular highlights, grain, and optional parallel or radial engraving. Five starting styles (Silver Plate, Letterpress, Blind Emboss, Gold Foil, Source Relief). It renders identically in the editor, exports and the runtime package.
- 2f9107f: Displaced Rings gains ring shapes (Circle, Triangle, Square, Polygon with Sides) alongside the Full/Half cut, per-band Rotation Jitter and Width Jitter driven by Seed, and Lines: thin strokes on the band boundaries that can keep repeating across the canvas beyond the outer band, with width, color and opacity. New controls default to off, so existing layers and saved projects look the same.
- 0a1665a: Add a Shape source layer: ellipse, rectangle, triangle, polygon, star, ring and blades silhouettes with color, outline, softness and canvas handles. Renders identically in the editor, exports and the runtime package, and combines with blend modes and layer masks.
- a41da7b: Add a Signal Rot effect layer for scanner drag and decaying signal: held streaks, snaking wobble, uneven scan speed, torn bands with paper dropouts, chroma drift, crushed levels and line noise, frozen or animated. Three starting styles (Scanner Drag, Signal Rot, Torn Scan). It renders identically in the editor, exports and the runtime package.
- ec5cae6: Add a stable artboard: any composition aspect other than Screen (adaptive) is a fixed document size, centered in the editor and letterboxed in the community player, so framing, masks and text no longer follow the window. Screen mode and older scenes are unchanged.
- ad947c9: Shape layers can draw an SVG: set `shape: "svg"` and give the layer an image `asset` pointing at the file. The SVG becomes a signed distance field, so its edges stay sharp at any size and Softness and Outline work as on the built-in shapes. `svgColorMode: "original"` keeps the file's colors, and `svgPalette` (a JSON map from a file color to a new color) recolors them; `"single"` fills the shape with `color`.
- ca1c86c: Text layers support multiline content, explicit alignment, line height, rotation and font sizes down to 8px, rendered identically in the editor and runtime. The editor adds in-place editing by double-click and canvas handles for position, rotation and size.
- dca5491: Require three 0.185: the `three` peer dependency is now `^0.185.0` (was `^0.183.0`). Projects still on three 0.183 need to update three together with this release.
- 76efc85: Add darkColor and lightColor to Threshold, retaining black/white fallbacks. Recolor the existing threshold field without another render pass; softness, noise, inversion and source coverage retain their behavior.

### Patch Changes

- 94c7312: Preserve alpha when copying external input textures and applying effect passes. Source layers use straight-alpha source-over blending; effect passes preserve input coverage and retain their existing alpha-as-strength behavior. Opaque compositions and legacy mask semantics are unchanged.
- 7fbb10a: Blob Tracking inner effects cover every current effect, including Blur, Glass, Gradient Map, Grain, Lumen Print, Photocopy, Relief, Erosion and Signal Rot. A newly picked inner effect now starts from its default settings instead of rendering nothing until a setting was changed.
- ac5e152: Image layers accept a grayscale depth map as a second asset (`depthAsset` in the runtime config) and gain Depth controls: invert, range, focus plane, orbit/sway/nod/dolly camera motion with amount and speed, a keyframable camera offset, stretched or transparent edges, march quality and a depth preview. The pass marches depth layers from near to far with binary refinement so nearer content covers what is behind it. Layers without a depth map keep the previous shader. An **Estimate** button generates the depth map in the browser with Depth Anything V2 Small (transformers.js in a Web Worker, WebGPU with a WASM fallback) and attaches it as a local asset. The image pass publishes its displaced depth as scene depth for the layers above: ASCII, Halftone, Pattern and Gradient Map gain `input: "luminance" | "depth"`, and layer masks gain a `depth` shape with a near/far range. Mask center, size, rotation and feather are keyframable and audio-linkable as `mask.*` tracks, evaluated in the editor and the runtime.
- 322980b: Add isolated, nested group rendering to the internal renderer frame contract. Group children render against transparent targets before the combined result is blended into the parent. Existing flat public shader configs retain their behavior; editor grouping controls and persisted groups follow separately.
- e958dac: Text layers redraw at the right size after the canvas or composition is resized. The text texture kept its first size on the GPU, so a resized canvas showed the text scaled down.
- c69bafd: Support transparent borders for contained image and video layers with `params.transparentBounds: true`. Existing runtime configs without the setting retain black borders.
- 9a3945b: Render the V3 effect layers with less GPU work and no visual change: Connected Dots reads its dot sites from a per-cell pre-pass (about 9x faster at 1080p), and Displaced Rings, Glass, Blur, Plotter, Signal Rot, Outline, Photocopy, Erosion, Lumen Print, Dot Grid and Relief skip work their current settings don't use. Blob Tracking stops requesting continuous rendering once its output settles on a still image, and Annotations only re-read their Edges field when the image below changes. Outline, Flares and Relief no longer read the wrong texture when their shader compiles before the first frame.

## 3.0.2

### Patch Changes

- 9eb80d5: Fix CRT layer opacity fading to black instead of becoming transparent.

  `CrtPass.render` re-implemented the base `PassNode.render` body but never
  assigned `this.inputNode.value`, so the opacity blend mixed toward an empty
  placeholder texture (black) rather than the upstream composite. It now calls
  `super.render(...)` before capturing history, which also fixes `multiply` /
  `darken` blend modes and `mask` composite mode at full opacity.

## 3.0.1

### Patch Changes

- e6efb83: Retry a media load that failed instead of giving up for good. `MediaPass`
  recorded the signature of the media it was about to load before awaiting the
  load, so a failure left that signature committed and every later call with the
  same source hit the "already loaded" early return. One transient failure — a
  flaky network, a CORS response that arrived wrong once — disabled that layer's
  image or video for the rest of the session, with an empty layer and no error to
  explain it. The signature is now committed only after the load succeeds.
- e6efb83: Set `crossOrigin="anonymous"` on video textures so media served from a CDN can be
  uploaded as a WebGPU texture without tainting the canvas. Previously a
  cross-origin video would render but break any subsequent canvas readback.

## 3.0.0

### Major Changes

- aecec38: Blob tracking: motion pipeline rebuild, instanced decorations, motion mask.

  **Breaking:** `sensitivity` on the blob-tracking layer is inverted. It was fed
  straight in as a luma cutoff, so raising it detected _less_; it now reads
  high-is-more-sensitive. Hosts passing this parameter directly should use
  `1 - previousValue`. Editor project files are migrated automatically (v5).

  **Breaking:** the `innerEffectMask` parameter is removed. Where the inner effect
  renders is now decided by `outputMode` — `"decorated"` puts it inside the blob
  shapes, `"motion"` puts it inside the motion mask.

  Added

  - `outputMode: "motion"` emits a full-detail motion mask, or the inner effect
    carried by that mask's alpha when one is set, so effects can be confined to
    whatever is moving and stay transparent elsewhere.
  - `motionMaskThreshold` and `motionPersistence` parameters.
  - Per-blob velocity estimation. Track matching now predicts ahead, which stops
    ids swapping when two subjects cross, and boxes are led by their velocity to
    cancel the asynchronous readback latency.

  Changed

  - Blob boxes use both extents instead of collapsing them, so they hug their
    subject rather than always drawing square.
  - Detection is resolution-independent: a luma pyramid replaces a fixed-offset
    tap pattern whose behaviour depended on output resolution.
  - Decorations are rasterised as instanced quads instead of full-screen SDF
    loops, so each pixel only shades primitives that cover it.
  - Trails are a GPU feedback buffer rather than a 2D canvas re-uploaded each
    frame.
  - The layer emits a real alpha instead of pre-mixing against its input, so an
    unlit mask leaves it transparent and blend modes apply only where it is lit.

  Fixed

  - `dispose()` no longer leaks the label atlas and glyph index texture.
  - A failed analysis readback logs once instead of silently leaving the layer
    with no blobs forever.

## 2.1.0

### Minor Changes

- cb2e508: Replace three.js `BloomNode` with a shared Jimenez-style bloom, and cut the CRT
  layer's GPU cost by ~3.3x.

  **Bloom.** All six bloom-using passes (crt, bloom, pattern, ink, halftone,
  particle-grid) each instantiated their own `BloomNode`, which renders a fixed
  5-mip chain of large separable Gaussians (11 to 43 taps) every frame regardless
  of `bloomRadius` — the radius only reweighted the mips, it never reduced cost.
  They now share a single `DualFilterBloom`: the Call of Duty: Advanced Warfare
  progressive downsample/upsample (13-tap downsample, 9-tap tent upsample,
  additive accumulation). `bloomRadius` now controls how many mip levels actually
  render, so a small radius is genuinely cheaper.

  Measured on an M-series GPU at 1512x949 with DPR 2, CRT layer with bloom on:
  p50 frame time 24.9ms -> 17.6ms, which is the vsync floor (bloom's marginal cost
  8.2ms -> 0.9ms). The glow is also no longer subject to three's `nodeFrame`
  frame-id race, which could silently omit it from exported frames.

  The bloom result is normalised by active level count and clamped, because CRT
  feeds its output back through the persistence buffer (~0.091 per frame) and an
  unbounded additive chain makes that loop diverge to white. `bloomIntensity` is
  also capped at 2 (was 8) on all six layers: above that the wash itself saturates
  at high radius. The cap is enforced in the compositor as well as the slider,
  because the layer store writes params through without clamping, so saved
  projects, MCP writes and audio modulation would otherwise bypass it. The ink
  layer's default drops from 6.19 to 2 for the same reason.

  **CRT.** The pass was rendering its full fragment program twice per frame — once
  to the pipeline target and once more to the temporal-history target. History is
  now filled with a GPU texture copy. The shader graph is also specialized per
  `crtMode` at build time instead of evaluating all three mask models and blending
  by a 1.0/0.0 weight, which removes 32 of 48 source texture fetches in slot-mask
  and aperture-grille modes and drops the phosphor mask from 27 rounded-phosphor
  evaluations to 9. `crtMode` is now structural and no longer keyframeable.

  CRT layer cost 12.50ms -> 3.76ms. Slot-mask output is pixel-identical; the other
  two modes differ by at most 1/255 on under 0.04% of pixels, from floating-point
  reassociation in the platform shader compiler.

  Also adds an opt-in preview render scale (Quality / Balanced / Performance) that
  scales the live viewport only — exports always render at full quality.

## 2.0.0

### Major Changes

- 992154e: ASCII layer rebuilt (v3), renderer-wide HiDPI fix, and no-blink shader rebuilds.

  **Renderer-wide fix**

  Post-processing ran at CSS-pixel resolution while the canvas was sized in device pixels, so on HiDPI displays the whole effect chain rendered at half resolution and was nearest-upscaled. Render targets are now sized in device pixels. The headless renderer only applies this when it owns the renderer, so host-provided renderers keep producing textures at the requested size.

  **No-blink shader rebuilds (all layers)**

  Structural parameter changes used to swap `colorNode` on live materials, and the pipeline manager dropped recompiling passes from the render chain — any rebuild made the layer vanish until the new pipelines compiled. Passes now precompile replacement materials on standby buffers and swap atomically; only never-compiled passes are excluded from the chain.

  **ASCII layer, rebuilt from the ground up**

  Crisp runtime-SDF glyphs (grid-packed atlas, shared baseline, analytic edge, adjustable `boldness`), grid-resolution glyph selection (a supersampled analysis pass plus an optional layout pass feed a small full-resolution composite), and a control surface reduced to 14 parameters:

  - `columns` — one grid-size control, measured against the composition so the editor and an export of any size produce the same lattice.
  - `breakGrid` (off/2x/4x/8x/16x) + `breakThreshold` — flat regions merge into larger cells. Merging and glyph placement derive from one quantized lattice, so blocks are coherent and glyphs never bleed across block boundaries.
  - `fontFamily` (all bundled families) + `fontWeight`, with per-font weight snapping. Charsets are auto-sorted by measured ink coverage; glyphs the chosen font cannot draw are filtered out, and rasterization falls back through a CJK-capable system family so the `katakana`, `boxes`, and `shades` charsets work with any font.
  - `charset` presets + `customChars` (128 chars).
  - `colorMode` (source / monochrome + `monoColor`), `bgOpacity` per-cell background in source mode.
  - `signalBlackPoint` / `signalWhitePoint` / `invert` — the only signal shaping.
  - `rowWarp` — slides whole cells along their row by brightness; glyphs stay crisp and may overlap, never shear.

  Color mode and invert compile branchlessly, so source mode selects exactly the same glyphs as monochrome. Generated shaders avoid chained vector swizzles, working around a Tint compiler regression in current Chrome Canary that killed pipeline creation. Retired atlas textures now outlive their bind groups, fixing a render-loop crash (`mipLevelCount` of undefined) when a font finished loading after boot.

  **Fonts in the package**

  The package now ships Geist Sans, Geist Mono, and BSMNT Grotesque with an importable stylesheet — `import "@basementstudio/shader-lab/fonts.css"` — that declares the `@font-face` rules and sets the CSS variables the font resolver reads. The commercially licensed families remain available in the hosted app only; hosts can enable them (or any font) by loading the font themselves and setting the matching CSS variable. See the Fonts section of the package README.

  **Removed** (breaking): `cellUnit`/`cellSize` (use `columns`), `glyphSource` structure/contour matching, `flowWarp`/`warpMode`, `glyphRotation`, `glyphScale`/`glyphScaleSource`/`glyphScaleMin`, `toneMapping`, `glyphSignalMode`/`colorSignalMode`, `signalGamma`, `presenceThreshold`/`presenceSoftness`, `shimmerAmount`/`shimmerSpeed`, `advection`/`motionScramble`/`scrambleDecay`, `directionBias`, `cellAspect` (now always follows the font), `renderMode` (always smooth), green-terminal color mode (use monochrome with a green tint), and the 32x break level. Unknown parameters in saved configs are ignored and fall back to defaults.

## 1.5.0

### Minor Changes

- 27c5f15: Blob tracking: fix exports rendering without blobs, move decorations to the GPU, and stabilise tracking.

  **Fixes**

  - Exports rendered with no blobs at all. `BlobTracker.step()` skipped any timestamp it had already seen, and the export pipeline's first render happens on a cold pipeline whose analysis reads back empty — so the tracker stepped once at time `t`, found nothing, and refused to run again at that `t` even though later prewarm renders produced good analysis. A repeated timestamp now rewinds to the state captured before the first step at that time and re-runs against the newer grid, so tracker state after `t` depends only on (state before `t`, best analysis at `t`) and not on how many times the pipeline rendered it. Live playback was unaffected and stays unchanged.
  - Track matching had no distance limit, so a detection could claim an arbitrarily distant track and swap ids. Matching is now bounded, with the reach widening while a track is missing so occlusion still re-acquires the same id.
  - Stroke colours rendered darker than the value passed in: the decoration texture never set a colour space.
  - Decorations desynced from the shapes when blobs were static and `shapeType` or `shapeScale` changed, and animating any decoration parameter bypassed the redraw throttle.

  **Performance**

  - Shape rendering no longer costs 32 texture samples per fragment regardless of `blobAmount`; the blob table is a uniform array read in a loop bounded by the live blob count, and the shape SDF is specialised per `shapeType`.
  - Outlines, centre markers, connectors, arrowheads and labels are now rendered as SDFs and glyph-atlas lookups in the shader instead of a 2D canvas re-uploaded as a texture. The canvas is only used for trails.
  - Detection reads a box-filtered downsample of the input rather than a point sample, so blobs jitter far less. Motion energy is correspondingly lower and smoother — a project with a hand-tuned `motionThreshold` may want it lowered.

  **New parameters**

  - `centerShape` — `"dot"` (default), `"cross"` or `"none"`.
  - `connectorDashed` — dashed connector lines, off by default.
  - `connectorArrows` — direction arrowheads on connectors, off by default.

  **Appearance changes**

  Existing blob-tracking layers will look different: blobs now fade in on spawn and out across the grace window instead of appearing and vanishing instantly, labels are pixel-space (`x:851 y:373`) rather than normalised and sit below the shape, `strokeColor` defaults to white, and a centre dot is drawn by default.

## 1.4.0

### Minor Changes

- 6f06d73: Add the blob-tracking effect layer: motion-first detection with automatic luminance fallback, persistent tracking with stable ids and smoothing, square/circle/diamond shape framing, one configurable inner effect rendered inside the detected shapes (`params.innerEffectType` / `params.innerEffectParams`), CCTV-style decorations (outlines, id+coordinate labels, straight or curved connecting lines, decaying trails), and a `"mask"` output mode that emits white-on-black fills for `compositeMode: "mask"`. Exports the `ShaderLabBlobInnerEffect` helper type. Decorations degrade gracefully when `document` is unavailable.

### Patch Changes

- 6f06d73: `onRuntimeError` on `<ShaderLabComposition>` is no longer called with `null` after every successful renderer initialization. It now only fires with `null` once a previously reported error has been resolved, and consecutive identical messages are not repeated. Consumers that surfaced the message without a null check no longer show a false error state.
- 6f06d73: Lint cleanup: convert type-only `three/webgpu` imports to `import type`, remove an unused suppression comment, and simplify a guard expression in the fluid runtime. No behavior changes.

## 1.3.14

### Patch Changes

- 23ae465: voxel pass - new shader effect that fakes isometric blocks

## 1.3.13

### Patch Changes

- 7257f2a: new interactive layers - fluid, magnifying, and pixel trail

## 1.3.12

### Patch Changes

- f94e6f2: Allow ShaderLabComposition to infer size from its container when composition is omitted

## 1.3.11

### Patch Changes

- 8979cdb: add sdbox3d utility for custom shader layer

## 1.3.10

### Patch Changes

- 768c7e9: ink pass updates and new standalone bloom layer

## 1.3.9

### Patch Changes

- a43c21f: improve performance on particle grid pass, and use logical dimensions fixes across several passes

## 1.3.8

### Patch Changes

- 42bff22: fix offsets in live and media passes

## 1.3.7

### Patch Changes

- 8678fd0: sync the package text runtime with the latest text layer updates and fix npm provenance publishing by declaring the repository url

## 1.3.6

### Patch Changes

- 9ad4873: Improve the timeline editor with multi-keyframe selection, marquee selection, keyboard editing shortcuts, and track toggles. Add curve editing and new easings, per keyframe.
- Sync the package text runtime with the newer text layer canvas rendering behavior, including logical-size scaling, anchor/offset placement, and background alpha support. Fix npm provenance publishing by declaring the package repository URL.

## 1.3.5

### Patch Changes

- 45227dc: minor fixes in pattern and ascii layers

## 1.3.4

### Patch Changes

- 34c1436: new circuit bent shader pass, crt version 2.0

## 1.3.3

### Patch Changes

- 72491d0: ascii pass improvements

## 1.3.2

### Patch Changes

- 95e78ee: srgb-fix

## 1.3.1

### Patch Changes

- a7eafe4: fix dithering color conversion

## 1.3.0

### Minor Changes

- fc1bf5d: Support custom shader layers running in effect mode. When `effectMode` is enabled in layer params, the shader receives `inputTexture` (the composited layers below) and skips sRGB-to-linear conversion since the input is already linear.

## 1.2.4

### Patch Changes

- 2e85f79: performance fixes

## 1.2.3

### Patch Changes

- 878a432: fix colorspace correction for media (imgs, videos...), per-layer adjustment for custom shaders

## 1.2.2

### Patch Changes

- ad9cd7d: perf improvements: -52% allocation pressure, -37% gpu overhead, -24% cpu per frame

## 1.2.1

### Patch Changes

- ab760fa: performance improvements

## 1.2.0

### Minor Changes

- adbbc04: Add directional blur, posterize, slice effect layers and more to the package

## 1.1.2

### Patch Changes

- 02e331f: new core layer effects

## 1.1.1

### Patch Changes

- 9803868: masking

## 1.1.0

### Minor Changes

- 9dbf768: high-level and advanced apis added to support other use cases

## 1.0.2

### Patch Changes

- b86e1f6: fix
- 6e5377b: fix package publishing so only @basementstudio/shader-lab is released from the workspace package

## 1.0.1

### Patch Changes

- 9a5c8d0: fix workflow

## 1.0.0

### Major Changes

- b878ba0: Publish the first release of `@basementstudio/shader-lab`.

  This package provides the Shader Lab runtime for rendering exported Shader Lab compositions in React apps.
