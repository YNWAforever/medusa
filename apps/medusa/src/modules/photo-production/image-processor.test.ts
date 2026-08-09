import { Readable } from "node:stream"
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { processImage } from "./image-processor"

async function jpeg(width = 2000, height = 1200) {
  return sharp({ create: { width, height, channels: 3, background: "#2679b2" } })
    .withMetadata({ orientation: 1, exif: { IFD0: { Artist: "Synthetic fixture" } } })
    .jpeg()
    .toBuffer()
}

describe("image processor", () => {
  it("normalizes a streamed image into metadata-free sRGB JPEG previews no larger than 1600 pixels", async () => {
    const original = await jpeg()
    const result = await processImage({ filename: "source.jpg", reportedMime: "image/jpeg", detectedMime: "image/jpeg", bytes: original.length, source: Readable.from(original) })
    const metadata = await sharp(result.preview).metadata()
    expect(metadata.format).toBe("jpeg")
    expect(metadata.space).toBe("srgb")
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600)
    expect(metadata.exif).toBeUndefined()
    expect(result).toMatchObject({ width: 2000, height: 1200, qualityBand: "good", estimatedPpi: 300 })
  })

  it("converts HEIC in the worker and serializes complete-buffer conversions", async () => {
    const converted = await jpeg(800, 600)
    let active = 0
    let maximum = 0
    const convert = vi.fn(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active -= 1
      return converted
    })
    const readOriginal = vi.fn(async () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(32)]))
    const input = () => ({ filename: "source.heic", reportedMime: "image/heic", detectedMime: "image/heic" as const, bytes: 40, source: Readable.from([]), readOriginal, convertHeic: convert })
    const [first, second] = await Promise.all([processImage(input()), processImage(input())])
    expect(first.preview.length).toBeGreaterThan(0)
    expect(second.preview.length).toBeGreaterThan(0)
    expect(convert).toHaveBeenCalledTimes(2)
    expect(readOriginal).toHaveBeenCalledTimes(2)
    expect(maximum).toBe(1)
  })

  it("rejects an oversized HEIC before allocating the complete original buffer", async () => {
    const readOriginal = vi.fn()
    await expect(processImage({ filename: "source.heic", reportedMime: "image/heic", detectedMime: "image/heic", bytes: 50 * 1024 * 1024 + 1, source: Readable.from([]), readOriginal })).rejects.toThrow("photo_file_too_large")
    expect(readOriginal).not.toHaveBeenCalled()
  })
})
