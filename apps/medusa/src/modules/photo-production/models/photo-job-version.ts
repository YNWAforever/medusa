import { model } from "@medusajs/framework/utils"
import PhotoJob from "./photo-job"

const PhotoJobVersion = model.define("photo_job_version", {
  id: model.id({ prefix: "phver" }).primaryKey(),
  job: model.belongsTo(() => PhotoJob),
  sequence: model.number(),
  source_revision: model.number(),
  idempotency_key: model.text(),
  status: model.enum(["draft", "quoted", "expired"]).default("draft").index(),
  defaults: model.json(),
  subtotal: model.number().nullable(),
  currency_code: model.text(),
  quoted_at: model.dateTime().nullable(),
  quote_expires_at: model.dateTime().nullable(),
  manifest_digest: model.text().nullable(),
  cart_id: model.text().nullable(),
  cart_attached_at: model.dateTime().nullable(),
  order_id: model.text().nullable(),
  order_frozen_at: model.dateTime().nullable(),
})

export default PhotoJobVersion
