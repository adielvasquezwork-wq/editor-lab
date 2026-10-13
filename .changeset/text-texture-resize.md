---
"@basementstudio/shader-lab": patch
---

Text layers redraw at the right size after the canvas or composition is resized. The text texture kept its first size on the GPU, so a resized canvas showed the text scaled down.
