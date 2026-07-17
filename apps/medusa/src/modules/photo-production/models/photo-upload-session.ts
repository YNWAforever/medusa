import { model } from "@medusajs/framework/utils"
import PhotoAsset from "./photo-asset"

const PhotoUploadSession = model.define("photo_upload_session", {
  id: model.id({ prefix: "phups" }).primaryKey(),
  asset: model.belongsTo(() => PhotoAsset),
  source_idempotency_key: model.text().unique(),
  provider_upload_id: model.text().nullable(),
  part_size: model.number(),
  expected_bytes: model.number(),
  completed_parts: model.json().default({}),
  status: model
    .enum(["active", "completed", "aborted", "expired"])
    .default("active")
    .index(),
  expires_at: model.dateTime(),
  completed_at: model.dateTime().nullable(),
  aborted_at: model.dateTime().nullable(),
  expired_at: model.dateTime().nullable(),
})

export default PhotoUploadSession
