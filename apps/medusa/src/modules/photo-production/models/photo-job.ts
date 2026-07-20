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
    .enum(["draft", "uploading", "ready", "cart_attached", "ordered", "fulfilled", "failed", "cancelled", "expired"])
    .default("draft")
    .index(),
  production_status: model
    .enum(["accepted", "processing", "ready", "in_production", "ready_for_pickup", "shipped", "fulfilled", "failed", "cancelled"])
    .index()
    .nullable(),
  revision: model.number().default(0),
  active_version_id: model.text().nullable(),
  retention_class: model.text(),
  last_activity_at: model.dateTime(),
  upload_started_at: model.dateTime().nullable(),
  ready_at: model.dateTime().nullable(),
  failed_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
  expired_at: model.dateTime().nullable(),
  fulfilled_at: model.dateTime().nullable(),
  retention_hold_until: model.dateTime().nullable(),
  media_expires_at: model.dateTime().nullable(),
})

export default PhotoJob
