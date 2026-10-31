# Editor Lab effects

Each effect is its own module (`<id>/index.ts` = schema, `<id>/pass.ts` =
shader) following the contract in `contract.ts` (handoff `EFFECTS.md`):
id, version, category, typed params, `stateful`, `seeded`.

- The inspector UI, timeline keyframes and MCP tools come from the param
  schema automatically. Every number/colour/vec2 param is keyframable.
- Effects stack in any order: put one on top of the whole stack (frame),
  inside a group (only that group), or between layers (only what's below it).
- `bun run editorlab effects list` / `bun run editorlab effects describe <id>`
  print the schemas as JSON (Editor Lab and upstream effects).

Adding an effect: create `<id>/index.ts` + `<id>/pass.ts` + `README.md`, add
the layer type to `ids.ts`, the schema to `registry.ts` and the pass to
`passes.ts`. No upstream files need to change.

| Effect | Layer type | Category | Ref |
|---|---|---|---|
| [Vignette](vignette/README.md) | `vignette` | lens | A2 |
| [Split Tone](split-tone/README.md) | `split-tone` | colour | fern CG |
| [Exposure](exposure/README.md) | `exposure` | light | D4 |
| [Leave Color](leave-color/README.md) | `leave-color` | colour | B1 |

Saved projects from before vignette and split tone were layers are
converted on load (`migrate-scene-film.ts`). Letterbox stays a Scene setting.
