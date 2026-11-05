import { describe, expect, test } from "bun:test"
import {
  describeDeterminismIssues,
  findDeterminismIssues,
  isStatefulLayerType,
  STATEFUL_LAYER_TYPES,
} from "@/editorlab/effects/determinism"
import { createLayer } from "@/lib/editor/layers"

describe("determinism lint", () => {
  test("flags stateful and pointer-driven layers, not deterministic ones", () => {
    const layers = [
      createLayer("pixel-trail"),
      createLayer("fluid"),
      createLayer("blob-tracking"),
      createLayer("live"),
      createLayer("magnify-lens"),
      createLayer("grain"),
      createLayer("vignette"),
      createLayer("light-leak"),
      createLayer("video"),
    ]
    const issues = findDeterminismIssues(layers)
    expect(issues.map((issue) => String(issue.type)).sort()).toEqual(
      ["blob-tracking", "fluid", "live", "magnify-lens", "pixel-trail"].sort()
    )
    expect(describeDeterminismIssues(issues)).toContain("pointer")
  })

  test("CRT is flagged only while persistence is above zero", () => {
    const crt = createLayer("crt")
    expect(findDeterminismIssues([crt])).toHaveLength(1)
    const safe = { ...crt, params: { ...crt.params, persistence: 0 } }
    expect(findDeterminismIssues([safe])).toHaveLength(0)
  })

  test("hidden layers and layers inside hidden groups are ignored", () => {
    const group = { ...createLayer("group"), visible: false }
    const inside = { ...createLayer("fluid"), parentId: group.id }
    const hidden = { ...createLayer("pixel-trail"), visible: false }
    expect(findDeterminismIssues([group, inside, hidden])).toHaveLength(0)
    expect(
      findDeterminismIssues([{ ...group, visible: true }, inside])
    ).toHaveLength(1)
  })

  test("the stateful list matches the type check used by the CLI", () => {
    for (const type of STATEFUL_LAYER_TYPES) {
      expect(isStatefulLayerType(type)).toBe(true)
    }
    expect(isStatefulLayerType("vignette")).toBe(false)
    expect(STATEFUL_LAYER_TYPES).toContain("crt")
  })
})
