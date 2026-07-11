import { products } from "@fotomax/shared"

export const stagingBranches = [
  { handle: "central-staging", name: { en: "Central Staging Pickup", "zh-HK": "中環測試取貨點" }, district: { en: "Central", "zh-HK": "中環" }, pickupEnabled: true, leadTimeBusinessDays: 2, testOnly: true },
  { handle: "mong-kok-staging", name: { en: "Mong Kok Staging Pickup", "zh-HK": "旺角測試取貨點" }, district: { en: "Mong Kok", "zh-HK": "旺角" }, pickupEnabled: true, leadTimeBusinessDays: 2, testOnly: true },
  { handle: "sha-tin-staging", name: { en: "Sha Tin Staging Pickup", "zh-HK": "沙田測試取貨點" }, district: { en: "Sha Tin", "zh-HK": "沙田" }, pickupEnabled: true, leadTimeBusinessDays: 3, testOnly: true },
] as const

export const retailInventoryPerBranch = 25
export const supportedPrintSkus = ["FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1", "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-2"] as const
export const retailInventorySkus = products.filter((product) => product.commerceMode === "retail").flatMap((product) => {
  const variantCount = product.options.reduce((count, option) => count * option.values.length, 1)
  return Array.from({ length: variantCount }, (_, index) => `FOTOMAX-${product.handle.toUpperCase()}-${index + 1}`)
})
export const stagingStockLocations = stagingBranches.map((branch) => ({ ...branch, address: { address1: "Staging Test Location - No Customer Visits", city: branch.district.en, countryCode: "hk" } }))
