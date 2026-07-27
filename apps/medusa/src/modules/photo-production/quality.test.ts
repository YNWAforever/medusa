import { describe, expect, it } from "vitest"
import {
  evaluatePrintQuality,
  requiredWarningAcknowledgements,
} from "./quality"

describe("print quality", () => {
  it("calculates effective PPI against a 6 by 4 inch oriented crop", () => {
    expect(
      evaluatePrintQuality({
        width: 1800,
        height: 1200,
        orientation: 1,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toMatchObject({ effectivePpi: 300, qualityBand: "good", warnings: [] })
  })

  it("does not rotate dimensions that processing already oriented", () => {
    expect(
      evaluatePrintQuality({
        width: 1800,
        height: 1200,
        orientation: 6,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }).effectivePpi,
    ).toBe(300)
  })

  it("classifies caution and poor quality", () => {
    expect(
      evaluatePrintQuality({
        width: 1200,
        height: 800,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }).qualityBand,
    ).toBe("caution")
    expect(
      evaluatePrintQuality({
        width: 600,
        height: 400,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      }).qualityBand,
    ).toBe("poor")
  })

  it("warns when fill cropping removes more than fifteen percent", () => {
    expect(
      evaluatePrintQuality({
        width: 1800,
        height: 1200,
        cropMode: "fill",
        crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
      }).warnings,
    ).toContain("crop_loss_gt_15_percent")
  })

  it("does not warn when crop loss is exactly fifteen percent", () => {
    expect(
      evaluatePrintQuality({
        width: 1800,
        height: 1200,
        cropMode: "fill",
        crop: { x: 0, y: 0, width: 0.85, height: 1 },
      }).warnings,
    ).not.toContain("crop_loss_gt_15_percent")
  })
  it("requires acknowledgements for caution, poor, and crop loss", () => {
    expect(requiredWarningAcknowledgements("caution", [])).toEqual([
      "quality_caution",
    ])
    expect(
      requiredWarningAcknowledgements("poor", ["crop_loss_gt_15_percent"]),
    ).toEqual(["quality_poor", "crop_loss_gt_15_percent"])
  })
})
