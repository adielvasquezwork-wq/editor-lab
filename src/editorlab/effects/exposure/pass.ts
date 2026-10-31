import { float, pow, type TSLNode, uniform, vec3, vec4 } from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"
import { readNumber } from "../shared"

type Node = TSLNode

export class ExposurePass extends PassNode {
  private readonly stops: Node

  constructor(layerId: string) {
    super(layerId)
    this.stops = uniform(0)
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    this.stops.value = readNumber(params.stops, 0, -10, 8)
  }

  protected override buildEffectNode(): Node {
    if (!this.stops) {
      return this.inputNode
    }

    // Linear light, so this is a true camera exposure change.
    const gain = pow(float(2), this.stops)
    return vec4(
      vec3(this.inputNode.r, this.inputNode.g, this.inputNode.b).mul(gain),
      this.inputNode.a
    )
  }
}
