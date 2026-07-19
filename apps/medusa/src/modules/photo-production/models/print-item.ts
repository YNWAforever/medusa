import { model } from "@medusajs/framework/utils"
import PhotoAsset from "./photo-asset"
import PhotoJobVersion from "./photo-job-version"

const PrintItem = model.define("print_item", {
  id: model.id({ prefix: "phitem" }).primaryKey(),
  version: model.belongsTo(() => PhotoJobVersion),
  asset: model.belongsTo(() => PhotoAsset),
  variant_id: model.text(),
  sku: model.text(),
  size: model.text().default("4R"),
  finish: model.enum(["glossy", "matte"]),
  border: model.enum(["none", "white"]),
  crop_mode: model.enum(["fill", "fit"]),
  crop: model.json(),
  quantity: model.number(),
  effective_ppi: model.number(),
  quality_band: model.enum(["good", "caution", "poor"]),
  warnings: model.json(),
  warning_acknowledgements: model.json(),
  unit_price_snapshot: model.number().nullable(),
})

export default PrintItem
