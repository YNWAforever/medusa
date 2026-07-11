import { model } from "@medusajs/framework/utils"

const BranchCapability = model.define("branch_capability", {
  id: model.id({ prefix: "brcap" }).primaryKey(),
  handle: model.text().unique(),
  name_en: model.text(),
  name_zh_hk: model.text(),
  district_en: model.text(),
  district_zh_hk: model.text(),
  pickup_enabled: model.boolean().default(true),
  test_only: model.boolean().default(true),
  lead_time_business_days: model.number(),
  supported_print_skus: model.json(),
})

export default BranchCapability
