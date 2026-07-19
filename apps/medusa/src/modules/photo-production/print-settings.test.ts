import { describe, expect, it } from "vitest"
import {
  resolvePrintSettings,
  validateNormalizedCrop,
  type PrintSettings,
} from "./print-settings"

const defaults: PrintSettings = {
  finish: "glossy",
  border: "none",
  cropMode: "fill",
  crop: { x: 0, y: 0, width: 1, height: 1 },
  quantity: 1,
}

describe("print settings", () => {
  it("accepts a finite normalized crop contained by the source", () => {
    expect(validateNormalizedCrop({ x: 0.1, y: 0.2, width: 0.8, height: 0.7 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.7,
    })
  })

  it.each([
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1.1, height: 1 },
    { x: 0.5, y: 0, width: 0.6, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: Number.NaN, y: 0, width: 1, height: 1 },
  ])("rejects an invalid crop %#", (crop) => {
    expect(() => validateNormalizedCrop(crop)).toThrow("photo_crop_invalid")
  })

  it("merges a partial override without trusting unknown values", () => {
    expect(resolvePrintSettings(defaults, { finish: "matte", quantity: 4 })).toEqual({
      ...defaults,
      finish: "matte",
      quantity: 4,
    })
  })

  it.each([0, 100, 1.5])("rejects quantity %s", (quantity) => {
    expect(() => resolvePrintSettings(defaults, { quantity })).toThrow(
      "photo_quantity_invalid",
    )
  })

  it("rejects unsupported finish, border, and crop mode values", () => {
    expect(() => resolvePrintSettings(defaults, { finish: "silk" as never })).toThrow(
      "photo_finish_invalid",
    )
    expect(() => resolvePrintSettings(defaults, { border: "black" as never })).toThrow(
      "photo_border_invalid",
    )
    expect(() => resolvePrintSettings(defaults, { cropMode: "stretch" as never })).toThrow(
      "photo_crop_mode_invalid",
    )
  })
})
