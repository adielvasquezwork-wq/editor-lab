# Light Leak (`light-leak`)

A film light leak for transitions: warm blobs of light sweep across the
frame as **Progress** goes 0 → 1. It is deterministic from **Seed** and
**Progress** only, so the same keyframes always render the same pixels.

| Param | What it does |
|---|---|
| progress | 0 = not started, 0.5 = peak, 1 = gone. Both ends are an exact passthrough. |
| intensity | Overall brightness. 0 turns it off. |
| seed | Shapes and positions. Same seed, same leak. |
| edge | Which edge it comes in from. |
| hue / hueSpread | Main colour and how far the other blobs drift from it. |
| size | Blob size. |
| blend | Screen (safe, never blows out) or Add (harsher). |

**Transition recipe:** put the layer above both shots, keyframe `progress`
0 → 1 over 12–16 frames centred on the cut, with the house easing. Pick a
seed you like and keep it; change `edge` to match the direction of the
whip or slide under it.

No reference clip in the handoff; built from the spec in `EFFECTS.md`.
