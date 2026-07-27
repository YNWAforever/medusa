import type { NormalizedCrop, PhotoCropMode } from "./print-settings"

export type PrintQualityBand = "good" | "caution" | "poor"
export type PrintWarningCode =
  | "quality_caution"
  | "quality_poor"
  | "crop_loss_gt_15_percent"

type QualityInput = {
  width: number
  height: number
  orientation?: number | null
  cropMode?: PhotoCropMode
  crop: NormalizedCrop
}

export function requiredWarningAcknowledgements(
  qualityBand: PrintQualityBand,
  warnings: readonly string[],
): PrintWarningCode[] {
  const required: PrintWarningCode[] = []
  if (qualityBand === "caution") required.push("quality_caution")
  if (qualityBand === "poor") required.push("quality_poor")
  if (warnings.includes("crop_loss_gt_15_percent")) {
    required.push("crop_loss_gt_15_percent")
  }
  return required
}

export function evaluatePrintQuality(input: QualityInput): {
  effectivePpi: number
  qualityBand: PrintQualityBand
  warnings: PrintWarningCode[]
} {
  const width = input.width
  const height = input.height
  const effectivePpi = Math.round(
    Math.min((width * input.crop.width) / 6, (height * input.crop.height) / 4),
  )
  const qualityBand: PrintQualityBand =
    effectivePpi >= 250 ? "good" : effectivePpi >= 150 ? "caution" : "poor"
  const warnings: PrintWarningCode[] = []
  const cropLoss = 1 - input.crop.width * input.crop.height
  if ((input.cropMode ?? "fill") === "fill" && cropLoss - 0.15 > 1e-12) {
    warnings.push("crop_loss_gt_15_percent")
  }
  return { effectivePpi, qualityBand, warnings }
}
