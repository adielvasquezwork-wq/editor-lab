# Editor Lab

Editor Lab is a post-processing and motion editor for documentary B-roll,
forked from basement's Shader Lab. Frames render deterministically: the same
time always gives the same pixels, so the output can feed HyperFrames and
re-render on demand. Everything new lives in `src/editorlab/`.

## Timing

| Feature | Where | Notes |
|---|---|---|
| Project frame rate | Transport bar (24 / 25 / 30) | Saved in the `.lab` file. Frame stepping, the timecode readout, stepped timing and video export default to it. |
| Frame stepping | `←` `→` (or `,` `.`) one frame, `Shift` ten, `Home` / `End` | Pauses playback. With the timeline open and a track selected, arrows walk keyframes instead. |
| Stepped timing | Properties → Stepped timing | On 2s / 3s / 4s / 8s per layer or group; everything inside holds, the rest keeps full rate (refs B1–B5). |
| Freeze frame | Properties → Freeze frame | Holds the frame at a time for a length, then resumes from where it paused (ref C3). |
| Markers | `M` adds one at the playhead, `Shift+M` removes it, `[` `]` jump; click a pin to go, double-click to rename, shift-click to remove | Saved in the `.lab` file. The Video and Frames export tabs offer "From markers" to export the range between the markers around the playhead. |
| Clips, cuts, ripple delete, subtitles | Timeline | From the earlier editing work. |

Time modifiers chain outermost group first: group step → own freeze → own
step. Video seeks, keyframes, clip in/out and shader time all use the
modified time.

## Effects

Each effect is a module with a typed, keyframable schema
(`src/editorlab/effects/<id>/`, see its README). Added so far: Vignette,
Split Tone, Exposure, Leave Color, Light Leak, Lens Distortion, Velocity
Blur (motion blur whose length follows the keyframed speed of the layers
below, or a manual direction and speed). Upstream
effects (bloom, grain, focus blur, directional blur, halftone, …) are used
as they are.

- **Snippets** (Properties → Snippets): save one effect's settings under a
  name, apply to any layer of that effect, delete; stored in this browser.
  Project menu → Export / Import snippets moves them as JSON.
- **Effect stack JSON** (Project menu): copy / paste / save / open the
  top-level effect layers with their keyframes, stepped timing and freeze
  as plain JSON. Format: `src/editorlab/stack/stack-json.ts`.
- **Determinism lint**: the Video and Frames export tabs warn about layers
  whose output depends on previous frames, the pointer or a live source.
- **Motion keying** (Properties → Motion): on a Directional Blur or
  Velocity Blur layer, "Key whip at <playhead>" writes Strength / Speed
  0 → peak → 0 with the peak one frame before the playhead (put the
  playhead on the cut); on a Light Leak layer, "Key leak across <playhead>"
  writes Progress 0 → 1 over N frames.
- **Agents**: the MCP bridge's `update_layer` takes `timeStep` and
  `freeze`; `get_layer` reports them.

## Export

- **Video** (WebM / MP4) with the fast WebCodecs decoder and audio mix.
- **Frames** tab: every frame as a PNG (`frame_0000.png`, frame n at
  start + n / fps) into a folder (Chromium) or a streamed ZIP.
- **Image**: a single PNG.

## Command line

```bash
bun run editorlab effects list
bun run editorlab effects describe vignette
bun run editorlab render --in shots/s010/raw --stack shots/s010/fx.json --out shots/s010/fx --fps 24 --time-step 3
```

`render` is stage 2 of the pipeline: it applies a stack to a PNG sequence
with the real passes in headless Chromium (WebGPU), one frame per input
PNG, deterministically. `--time-step n` renders every nth frame and copies
the held ones. Add `--software` to force SwiftShader (CI, machines without
a GPU). Two runs give byte-identical files; frames rendered in isolation
match the sequential run (`tests/film/render-cli.mjs`).

## Tests

- `bun test tests/editor`: unit tests (timing, effects registry, stack
  JSON, snippets, determinism lint, ZIP writer, CLI helpers, …).
- `bun run test:film`: headless WebGPU checks for every Editor Lab effect,
  the letterbox post-process, stepped video decoding and the render CLI.
- `bun run test:export-decode`, `bun run test:export-audio`: export paths.
