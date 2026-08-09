import { describe, expect, it } from "vitest"
import { detectPhotoFileType, validatePhotoFile } from "./file-validation"

const cases = [
  ["jpeg", "image/jpeg", "photo.jpg", [0xff, 0xd8, 0xff, 0xe0]],
  ["png", "image/png", "photo.png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["webp", "image/webp", "photo.webp", [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]],
  ["heic", "image/heic", "photo.heic", [0, 0, 0, 24, ...Buffer.from("ftypheic")]],
  ["heif", "image/heif", "photo.heif", [0, 0, 0, 24, ...Buffer.from("ftypmif1")]],
] as const

describe("photo file validation", () => {
  for (const [type, mime, filename, bytes] of cases) {
    it(`detects ${type} by signature`, () => {
      expect(detectPhotoFileType(Buffer.from(bytes))).toMatchObject({ mime })
      expect(validatePhotoFile({ filename, reportedMime: mime, bytes: 42, signature: Buffer.from(bytes) })).toMatchObject({ detectedMime: mime })
    })
  }

  it("rejects extension and MIME mismatches", () => {
    expect(() => validatePhotoFile({ filename: "photo.png", reportedMime: "image/png", bytes: 42, signature: Buffer.from([0xff, 0xd8, 0xff]) })).toThrow("photo_file_type_mismatch")
    expect(() => validatePhotoFile({ filename: "photo.jpg", reportedMime: "image/png", bytes: 42, signature: Buffer.from([0xff, 0xd8, 0xff]) })).toThrow("photo_file_type_mismatch")
  })

  it("rejects unsupported signatures and oversized files", () => {
    expect(() => detectPhotoFileType(Buffer.from("nope"))).toThrow("photo_file_unsupported")
    expect(() => validatePhotoFile({ filename: "photo.jpg", reportedMime: "image/jpeg", bytes: 50 * 1024 * 1024 + 1, signature: Buffer.from([0xff, 0xd8, 0xff]) })).toThrow("photo_file_too_large")
  })
})
