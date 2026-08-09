import { validatePhotoFile } from "./file-validation"

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
export const MAX_DECODED_PIXELS = 120_000_000
export const MIN_IMAGE_AXIS = 320
export const PREVIEW_LONGEST_EDGE = 1600
export const PREVIEW_JPEG_QUALITY = 82

export type PhotoQualityBand = "good" | "caution" | "poor"

export type DecodedImage = {
  width: number
  height: number
  orientation?: number | null
}

function fail(code: string): never {
  throw new Error(code)
}

function orientedDimensions({ width, height, orientation }: DecodedImage) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    fail("photo_image_decode_failed")
  }
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width, orientation }
    : { width, height, orientation: orientation ?? 1 }
}

export function classifyPrintQuality(estimatedPpi: number): PhotoQualityBand {
  if (estimatedPpi >= 250) return "good"
  if (estimatedPpi >= 150) return "caution"
  return "poor"
}

export function validateImageInput(input: {
  filename: string
  reportedMime: string
  bytes: number
  signature: Uint8Array
}) {
  return validatePhotoFile(input)
}

export function validateDecodedImage(input: DecodedImage) {
  const image = orientedDimensions(input)
  if (image.width * image.height > MAX_DECODED_PIXELS) {
    fail("photo_image_pixel_limit_exceeded")
  }
  if (image.width < MIN_IMAGE_AXIS || image.height < MIN_IMAGE_AXIS) {
    fail("photo_image_resolution_too_low")
  }

  const estimatedPpi = Math.floor(
    Math.min(Math.max(image.width, image.height) / 6, Math.min(image.width, image.height) / 4),
  )
  return {
    ...image,
    estimatedPpi,
    qualityBand: classifyPrintQuality(estimatedPpi),
  }
}
