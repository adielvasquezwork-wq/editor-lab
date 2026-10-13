import type { AssetKind } from "@/types/editor"

export function isSvgFileName(fileName: string | null | undefined): boolean {
  return fileName?.toLowerCase().endsWith(".svg") ?? false
}

export function isSvgMediaSource(input: {
  fileName?: string | null
  mimeType?: string | null
}): boolean {
  return (
    input.mimeType?.toLowerCase() === "image/svg+xml" ||
    isSvgFileName(input.fileName)
  )
}

export const AUDIO_FILE_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
] as const

export const AUDIO_FILE_ACCEPT = `audio/*,${AUDIO_FILE_EXTENSIONS.join(",")}`

export function isAudioFileName(fileName: string | null | undefined): boolean {
  const lower = fileName?.toLowerCase()

  if (!lower) {
    return false
  }

  return AUDIO_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function isEnvironmentFileName(
  fileName: string | null | undefined
): boolean {
  return fileName?.toLowerCase().endsWith(".hdr") ?? false
}

export function getAssetAccept(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
    case "video":
      return "video/mp4,video/webm,video/quicktime,.mov"
    case "model":
      return ".glb,.gltf,.svg,model/gltf-binary,model/gltf+json,image/svg+xml"
    case "environment":
      return ".hdr,image/vnd.radiance"
    case "audio":
      return AUDIO_FILE_ACCEPT
  }
}

export function inferFileAssetKind(file: File): AssetKind | null {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (isEnvironmentFileName(fileName) || mimeType === "image/vnd.radiance") {
    return "environment"
  }

  if (mimeType.startsWith("image/") || isSvgFileName(fileName)) {
    return "image"
  }

  if (mimeType.startsWith("video/")) {
    return "video"
  }

  if (fileName.endsWith(".mov")) {
    return "video"
  }

  if (mimeType.startsWith("audio/") || isAudioFileName(fileName)) {
    return "audio"
  }

  if (
    fileName.endsWith(".glb") ||
    fileName.endsWith(".gltf") ||
    mimeType === "model/gltf-binary" ||
    mimeType === "model/gltf+json"
  ) {
    return "model"
  }

  return null
}

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  hdr: "image/vnd.radiance",
  m4a: "audio/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  svg: "image/svg+xml",
  wav: "audio/wav",
}

const MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/opus": "audio/ogg",
  "audio/wave": "audio/wav",
  "audio/x-flac": "audio/flac",
  "audio/x-wav": "audio/wav",
}

/** Canonicalize browser MIME guesses, including assets restored from old drafts. */
export function normalizeAssetMimeType(input: {
  fileName: string
  mimeType: string
}): string {
  const mimeType = input.mimeType.toLowerCase().split(";")[0]!.trim()
  const extension = input.fileName.toLowerCase().split(".").at(-1) ?? ""
  const extensionMime = Object.hasOwn(MIME_BY_EXTENSION, extension)
    ? MIME_BY_EXTENSION[extension]
    : undefined
  const alias = Object.hasOwn(MIME_ALIASES, mimeType) ? MIME_ALIASES[mimeType] : undefined
  return extensionMime ?? alias ?? mimeType
}
