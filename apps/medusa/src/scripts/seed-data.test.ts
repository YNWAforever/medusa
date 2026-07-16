import { describe, expect, it } from "vitest"

import {
  retailInventoryPerBranch,
  retailInventorySkus,
  stagingBranches,
  stagingStockLocations,
  supportedPrintSkus,
} from "./seed-data"

describe("staging branch seed data", () => {
  it("preserves the exact three bilingual staging branches", () => {
    expect(stagingBranches).toEqual([
      {
        handle: "central-staging",
        name: { en: "Central Staging Pickup", "zh-HK": "中環測試取貨點" },
        district: { en: "Central", "zh-HK": "中環" },
        pickupEnabled: true,
        leadTimeBusinessDays: 2,
        testOnly: true,
      },
      {
        handle: "mong-kok-staging",
        name: { en: "Mong Kok Staging Pickup", "zh-HK": "旺角測試取貨點" },
        district: { en: "Mong Kok", "zh-HK": "旺角" },
        pickupEnabled: true,
        leadTimeBusinessDays: 2,
        testOnly: true,
      },
      {
        handle: "sha-tin-staging",
        name: { en: "Sha Tin Staging Pickup", "zh-HK": "沙田測試取貨點" },
        district: { en: "Sha Tin", "zh-HK": "沙田" },
        pickupEnabled: true,
        leadTimeBusinessDays: 3,
        testOnly: true,
      },
    ])
  })

  it("uses unique handles, positive lead times, and test-only pickup flags", () => {
    const handles = stagingBranches.map((branch) => branch.handle)

    expect(new Set(handles).size).toBe(stagingBranches.length)
    expect(
      stagingBranches.every((branch) => branch.leadTimeBusinessDays > 0),
    ).toBe(true)
    expect(stagingBranches.every((branch) => branch.testOnly)).toBe(true)
    expect(stagingBranches.every((branch) => branch.pickupEnabled)).toBe(true)
  })

  it("pins print support and inventory to the intended SKU classifications", () => {
    expect(supportedPrintSkus).toEqual([
      "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
      "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-2",
    ])
    expect(retailInventorySkus).toEqual([
      "FOTOMAX-INSTAX-MINI-FILM-PACK-1",
      "FOTOMAX-INSTAX-MINI-FILM-PACK-2",
    ])
    expect(
      retailInventorySkus.some((sku) =>
        (supportedPrintSkus as readonly string[]).includes(sku),
      ),
    ).toBe(false)
    expect(retailInventoryPerBranch).toBe(25)
  })

  it("projects visibly non-real Hong Kong stock-location addresses", () => {
    expect(stagingStockLocations).toEqual(
      stagingBranches.map((branch) => ({
        ...branch,
        address: {
          address1: "Staging Test Location - No Customer Visits",
          city: branch.district.en,
          countryCode: "hk",
        },
      })),
    )
  })
})
