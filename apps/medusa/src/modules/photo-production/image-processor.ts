import { Readable } from "node:stream"
import heicConvert from "heic-convert"
import sharp from "sharp"
import {
  MAX_IMAGE_BYTES,
  MAX_DECODED_PIXELS,
  PREVIEW_JPEG_QUALITY,
  PREVIEW_LONGEST_EDGE,
  type PhotoQualityBand,
  validateDecodedImage,
} from "./image-policy"

type HeicConverter = (input: {
  buffer: Buffer
  format: "JPEG"
  quality: number
}) => Promise<Buffer | Uint8Array | ArrayBuffer>

export type ImageProcessorInput = {
  filename: string
  reportedMime: string
  detectedMime: string
  bytes: number
  source: Readable
  readOriginal?: () => Promise<Buffer>
  convertHeic?: HeicConverter
}

type ImageProcessorResult = {
  preview: Buffer
  width: number
  height: number
  orientation: number
  estimatedPpi: number
  qualityBand: PhotoQualityBand
}

let heicTail: Promise<void> = Promise.resolve()

async function oneAtATime<T>(operation: () => Promise<T>): Promise<T> {
  const previous = heicTail
  let release!: () => void
  heicTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

function assertByteLimit(bytes: number): void {
  if (!Number.isInteger(bytes) || bytes < 1) throw new Error("photo_file_invalid_size")
  if (bytes > MAX_IMAGE_BYTES) throw new Error("photo_file_too_large")
}

async function bufferedOriginal(input: ImageProcessorInput): Promise<Buffer> {
  if (!input.readOriginal) throw new Error("photo_image_decode_failed")
  const original = await input.readOriginal()
  if (original.length > MAX_IMAGE_BYTES) throw new Error("photo_file_too_large")
  return original
}

async function imageForProcessing(input: ImageProcessorInput) {
  if (input.detectedMime !== "image/heic" && input.detectedMime !== "image/heif") {
    const image = sharp({ limitInputPixels: MAX_DECODED_PIXELS, failOn: "error" })
    input.source.pipe(image)
    return image
  }

  const original = await bufferedOriginal(input)
  const convert = input.convertHeic ?? (heicConvert as unknown as HeicConverter)
  const converted = await oneAtATime(() => convert({
    buffer: original,
    format: "JPEG",
    quality: PREVIEW_JPEG_QUALITY,
  }))
  const convertedBuffer = converted instanceof ArrayBuffer ? Buffer.from(new Uint8Array(converted)) : Buffer.from(converted)
  return sharp(convertedBuffer, { limitInputPixels: MAX_DECODED_PIXELS, failOn: "error" })
}

export async function processImage(input: ImageProcessorInput): Promise<ImageProcessorResult> {
  assertByteLimit(input.bytes)
  try {
    const image = await imageForProcessing(input)
    const metadata = await image.metadata()
    const validated = validateDecodedImage({
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      orientation: metadata.orientation,
    })
    const preview = await image
      .rotate()
      .toColorspace("srgb")
      .resize({ width: PREVIEW_LONGEST_EDGE, height: PREVIEW_LONGEST_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PREVIEW_JPEG_QUALITY })
      .toBuffer()

    return {
      preview,
      width: validated.width,
      height: validated.height,
      orientation: validated.orientation,
      estimatedPpi: validated.estimatedPpi,
      qualityBand: validated.qualityBand,
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("photo_")) throw error
    throw new Error("photo_image_decode_failed")
  }
}
