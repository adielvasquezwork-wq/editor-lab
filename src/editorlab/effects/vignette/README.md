# Vignette (`vignette`)

Lens darkening toward the edges, or a fade to any colour. Being a layer, it
can be keyframed, scoped to a group, or placed under titles so they stay
bright.

| Param | What it does |
|---|---|
| amount | Edge darkening in stops (1 = half the light). |
| radius | Where the falloff starts (0 centre, 1 corners). |
| softness | Width of the falloff. |
| roundness | 0 follows the frame shape, 1 is a circle. |
| squareness | Corner shape: 0 oval, 1 rounded rectangle (edges darken almost as much as corners). |
| center | Moves the clear area. |
| color | What the edges fade to. Black = normal vignette; white/tints for paper or glow. |
| linearLight | On: true stops in linear light (natural lens). Off: multiplies the displayed image, heavier in the mids. |

**A2 (Jani, heavy corner darkening over a bright UI):** amount 1.6,
radius 0.25, softness 0.85, squareness 0.5, linear light **off**.

![check](check-A2.jpg)

Left: defaults. Middle: the A2 settings above. Right: the A2 reference.

![ref](ref-A2.jpg)
