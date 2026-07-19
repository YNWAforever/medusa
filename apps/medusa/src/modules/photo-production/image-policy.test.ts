import { describe, expect, it } from "vitest"
import { classifyPrintQuality, validateDecodedImage, validateImageInput } from "./image-policy"

describe("image processing policy", () => {
  it("detects the signature before trusting the filename extension and MIME type", () => {
    expect(() => validateImageInput({ filename: "renamed.png", reportedMime: "image/png", bytes: 42, signature: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) })).toThrow("photo_file_type_mismatch")
  })

  it("allows exactly 120 decoded megapixels", () => {
    expect(validateDecodedImage({ width: 12000, height: 10000, orientation: 1 })).toMatchObject({ width: 12000, height: 10000 })
  })

  it("blocks decoded images over 120 megapixels", () => {
    expect(() => validateDecodedImage({ width: 12001, height: 10000, orientation: 1 })).toThrow("photo_image_pixel_limit_exceeded")
  })

  it.each([{ width: 319, height: 900 }, { width: 900, height: 319 }])("blocks images below 320 pixels on either axis", (metadata) => {
    expect(() => validateDecodedImage({ ...metadata, orientation: 1 })).toThrow("photo_image_resolution_too_low")
  })

  it("calculates initial PPI against the full oriented 6 by 4 inch fit", () => {
    expect(validateDecodedImage({ width: 3000, height: 2000, orientation: 1 }).estimatedPpi).toBe(500)
    expect(validateDecodedImage({ width: 2000, height: 3000, orientation: 6 }).estimatedPpi).toBe(500)
  })

  it.each([[250, "good"], [249, "caution"], [150, "caution"], [149, "poor"]] as const)("assigns %s PPI to the %s quality band", (ppi, band) => {
    expect(classifyPrintQuality(ppi)).toBe(band)
  })
})
