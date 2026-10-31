# Look preset checks

Side-by-side sheets used to tune the one-click looks in
`src/editorlab/presets/*.json` against the handoff reference frames.
Each sheet is: plain plate | Editor Lab preset | reference frame(s).

| Sheet | Preset | Compared against | What to look for |
| --- | --- | --- | --- |
| `jani.png` | Jani | D1, D6 | Readable centre band with tilt-shift blur top and bottom, desaturated, crushed blacks, darker corners, no washed-out whites |
| `chuppl.png` | CHUPPL | D2 | Black and white with only the red accent kept, warm paper highlights, fine grain |
| `fern.png` | fern | D3 | Low-key grade, teal shadows, magenta-leaning highlights, soft glow, 2:1 letterbox |
| `plain_photo.png` | all three | — | The looks on an ordinary photo, to check none of them breaks on non-screen footage |

The sheets were rendered on headless WebGPU (SwiftShader) with the real
passes: MediaPass, then the preset's effect layers, then ScenePostProcess.
Colours can differ slightly from a hardware GPU; treat them as a check of
the direction, not exact pixel values.

The reference frames come from the private handoff pack and are kept here
only for internal comparison. Do not publish this folder.
