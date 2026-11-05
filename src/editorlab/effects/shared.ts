import { dot, fract, type TSLNode, vec3 } from "three/tsl"
import * as THREE from "three/webgpu"
import type { ParameterValue } from "@/types/editor"

type Node = TSLNode

export function readNumber(
  value: ParameterValue | undefined,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function readBoolean(
  value: ParameterValue | undefined,
  fallback: boolean
): boolean {
  return typeof value === "boolean" ? value : fallback
}

export function readVec2(
  value: ParameterValue | undefined,
  fallback: [number, number]
): [number, number] {
  return Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : fallback
}

function readHex(value: ParameterValue | undefined, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

/** sRGB hex -> linear-light RGB (the pipeline's working space). */
export function readLinearColor(
  value: ParameterValue | undefined,
  fallback: string
): THREE.Vector3 {
  const color = new THREE.Color(readHex(value, fallback))
  return new THREE.Vector3(color.r, color.g, color.b)
}

/** sRGB hex -> display-encoded RGB. */
export function readDisplayColor(
  value: ParameterValue | undefined,
  fallback: string
): THREE.Vector3 {
  const color = new THREE.Color().setStyle(
    readHex(value, fallback),
    THREE.NoColorSpace
  )
  return new THREE.Vector3(color.r, color.g, color.b)
}

/** Deterministic hash in [0, 1) of a vec3 (no sin; stable across GPUs). */
export function hash3(p: Node): Node {
  const q = fract(p.mul(vec3(0.1031, 0.103, 0.0973)))
  const r = q.add(dot(q, vec3(q.y, q.z, q.x).add(33.33)))
  return fract(r.x.add(r.y).mul(r.z))
}

export const BT709_LUMA = [0.2126, 0.7152, 0.0722] as const
