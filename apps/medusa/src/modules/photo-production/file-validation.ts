const MAX_FILE_BYTES = 50 * 1024 * 1024

type PhotoType = { mime: string; extensions: string[] }

function fail(code: string): never { throw new Error(code) }

export function detectPhotoFileType(signature: Uint8Array): PhotoType {
  const bytes = Buffer.from(signature)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extensions: ["jpg", "jpeg"] }
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", extensions: ["png"] }
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") {
    return { mime: "image/webp", extensions: ["webp"] }
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString() === "ftyp") {
    const brand = bytes.subarray(8, 12).toString()
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return { mime: "image/heic", extensions: ["heic"] }
    if (["mif1", "msf1"].includes(brand)) return { mime: "image/heif", extensions: ["heif"] }
  }
  return fail("photo_file_unsupported")
}

export function sanitizePhotoFilename(filename: string): string {
  const leaf = filename.replace(/\\/g, "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return (leaf || "photo").slice(0, 255)
}

export function validatePhotoFile(input: { filename: string; reportedMime: string; bytes: number; signature: Uint8Array }) {
  if (!Number.isInteger(input.bytes) || input.bytes < 1) fail("photo_file_invalid_size")
  if (input.bytes > MAX_FILE_BYTES) fail("photo_file_too_large")
  const detected = detectPhotoFileType(input.signature)
  const extension = input.filename.split(".").pop()?.toLowerCase()
  if (!extension || !detected.extensions.includes(extension) || input.reportedMime.toLowerCase() !== detected.mime) {
    fail("photo_file_type_mismatch")
  }
  return { detectedMime: detected.mime, displayName: sanitizePhotoFilename(input.filename) }
}
