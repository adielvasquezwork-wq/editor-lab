# Lens Distortion (`lens-distortion`)

Barrel / pincushion distortion (Brown model, r' = r (1 + k1 r² + k2 r⁴))
with an edge scale to hide the pulled-in borders and optional colour
fringing. Use it on screen-plane shots and UI captures so they read as
photographed, not pasted.

| Param | What it does |
|---|---|
| k1 | Main distortion. Positive = barrel (bulge), negative = pincushion. |
| k2 | Corner term; shapes the corners without moving the mid-frame. |
| scale | Zoom that hides the edges distortion pulls in (1.06 covers k1 ≈ 0.12). |
| chromatic | Spreads red and blue apart toward the edges. |
| center | Moves the optical centre. |

Typical: k1 0.08–0.15 and scale 1.04–1.08 for a subtle "shot off a
monitor" feel; k1 0.3+ with chromatic 0.3 for a security-camera look.

No reference clip in the handoff; built from the spec in `EFFECTS.md`.
