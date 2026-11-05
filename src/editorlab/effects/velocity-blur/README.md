# Velocity Blur (`velocity-blur`)

Motion blur that tracks speed (refs C1 whip, A8 scroll ramp): "none at
rest, long streaks at the peak, gone as it settles".

| Param | What it does |
|---|---|
| source | **Keyframes below**: speed and direction come from the keyframed Offset of the source layers below this effect (same group); the fastest one wins. **Manual**: use Angle and Speed, keyframe them yourself (or write them from a HyperFrames `shot.camera.json` as stack keys). |
| shutter | Streak = speed × shutter / 360. 180° is a film camera; 360° smears a whole frame of motion. |
| gain | Scales the keyframe speed. |
| angle / speed | Manual direction (degrees) and speed in composition px per frame. |
| maxLength | Caps the streak, in pixels. |

16 taps, centred on the pixel, so a still frame is untouched and the blur
is the same whichever direction the motion goes. Deterministic: the speed
comes from the keyframes at t ± half a frame, never from previous frames.

**Whip (C1):** put the slide on an image layer's Offset keyframes with the
house easing, add Velocity Blur above it on *Keyframes below*, shutter
180–270°. The blur peaks on the fastest frame by construction. For the
simpler keyed version use Directional Blur's **Key whip** button.
