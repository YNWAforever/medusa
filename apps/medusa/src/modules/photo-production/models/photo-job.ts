import { model } from "@medusajs/framework/utils"

const PhotoJob = model.define("photo_job", {
  id: model.id({ prefix: "phjob" }).primaryKey(),
  guest_owner_hash: model.text().index().nullable(),
  customer_id: model.text().index().nullable(),
  region_id: model.text().index(),
  locale: model.text(),
  currency_code: model.text(),
  product_handle: model.text().index(),
  status: model
    .enum(["draft", "uploading", "ready", "failed", "cancelled", "expired"])
    .default("draft")
    .index(),
  revision: model.number().default(0),
  active_version_id: model.text().nullable(),
  retention_class: model.text(),
  last_activity_at: model.dateTime(),
  upload_started_at: model.dateTime().nullable(),
  ready_at: model.dateTime().nullable(),
  failed_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
  expired_at: model.dateTime().nullable(),
})

export default PhotoJob
