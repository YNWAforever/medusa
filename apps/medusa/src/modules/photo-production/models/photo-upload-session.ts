import { model } from "@medusajs/framework/utils"
import PhotoAsset from "./photo-asset"

const PhotoUploadSession = model.define("photo_upload_session", {
  id: model.id({ prefix: "phups" }).primaryKey(),
  asset: model.belongsTo(() => PhotoAsset),
  source_idempotency_key: model.text().unique(),
  storage_provider: model.enum(["s3", "vercel-blob"]).default("s3").index(),
  upload_strategy: model.enum(["multipart", "single-put"]).default("multipart"),
  provider_upload_id: model.text().nullable(),
  part_size: model.number(),
  expected_bytes: model.number(),
  completed_parts: model.json().default({}),
  completion_metadata: model.json().nullable(),
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
