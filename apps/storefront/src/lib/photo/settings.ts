export type PhotoSettings = {
  finish: "glossy" | "matte"
  border: "none" | "white"
  cropMode: "fill" | "fit"
  crop: { x: number; y: number; width: number; height: number }
  quantity: number
}

export function normalizePhotoSettings(input: PhotoSettings): PhotoSettings {
  if (input.finish !== "glossy" && input.finish !== "matte") {
    throw new Error("photo_finish_invalid")
  }
  if (input.border !== "none" && input.border !== "white") {
    throw new Error("photo_border_invalid")
  }
  if (input.cropMode !== "fill" && input.cropMode !== "fit") {
    throw new Error("photo_crop_mode_invalid")
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new Error("photo_quantity_invalid")
  }
  const { x, y, width, height } = input.crop
  if (
    [x, y, width, height].some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || width <= 0
    || height <= 0
    || x + width > 1
    || y + height > 1
  ) {
    throw new Error("photo_crop_invalid")
  }
  return {
    finish: input.finish,
    border: input.border,
    cropMode: input.cropMode,
    crop: { ...input.crop },
    quantity: input.quantity,
  }
}
