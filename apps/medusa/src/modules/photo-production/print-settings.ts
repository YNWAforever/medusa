export type PhotoFinish = "glossy" | "matte"
export type PhotoBorder = "none" | "white"
export type PhotoCropMode = "fill" | "fit"

export type NormalizedCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type PrintSettings = {
  finish: PhotoFinish
  border: PhotoBorder
  cropMode: PhotoCropMode
  crop: NormalizedCrop
  quantity: number
}

const finishes = new Set<PhotoFinish>(["glossy", "matte"])
const borders = new Set<PhotoBorder>(["none", "white"])
const cropModes = new Set<PhotoCropMode>(["fill", "fit"])

export function validateNormalizedCrop(crop: NormalizedCrop): NormalizedCrop {
  const values = [crop.x, crop.y, crop.width, crop.height]
  if (
    values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || crop.width <= 0
    || crop.height <= 0
    || crop.x + crop.width > 1
    || crop.y + crop.height > 1
  ) {
    throw new Error("photo_crop_invalid")
  }
  return { ...crop }
}

export function resolvePrintSettings(
  defaults: PrintSettings,
  override: Partial<PrintSettings> = {},
): PrintSettings {
  const settings = { ...defaults, ...override }
  if (!finishes.has(settings.finish)) throw new Error("photo_finish_invalid")
  if (!borders.has(settings.border)) throw new Error("photo_border_invalid")
  if (!cropModes.has(settings.cropMode)) throw new Error("photo_crop_mode_invalid")
  if (!Number.isInteger(settings.quantity) || settings.quantity < 1 || settings.quantity > 99) {
    throw new Error("photo_quantity_invalid")
  }
  return {
    finish: settings.finish,
    border: settings.border,
    cropMode: settings.cropMode,
    crop: validateNormalizedCrop(settings.crop),
    quantity: settings.quantity,
  }
}
