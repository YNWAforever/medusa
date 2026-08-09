import { describe, expect, it } from "vitest"
import { normalizePhotoSettings } from "./settings"

describe("normalizePhotoSettings", () => {
  it("normalizes supported 4R editor settings", () => {
    expect(
      normalizePhotoSettings({
        finish: "matte",
        border: "white",
        cropMode: "fit",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        quantity: 2,
      }),
    ).toMatchObject({ finish: "matte", border: "white", quantity: 2 })
  })

  it("rejects settings that the server would reject", () => {
    expect(() =>
      normalizePhotoSettings({
        finish: "glossy",
        border: "none",
        cropMode: "fill",
        crop: { x: 0.8, y: 0, width: 0.4, height: 1 },
        quantity: 1,
      }),
    ).toThrow("photo_crop_invalid")
  })
})
