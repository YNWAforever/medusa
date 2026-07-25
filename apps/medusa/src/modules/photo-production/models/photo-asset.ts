import { model } from "@medusajs/framework/utils"
import PhotoJob from "./photo-job"

const PhotoAsset = model.define("photo_asset", {
  id: model.id({ prefix: "phast" }).primaryKey(),
  job: model.belongsTo(() => PhotoJob),
  display_name: model.text(),
  object_key: model.text().unique().nullable(),
  storage_provider: model.enum(["s3", "vercel-blob"]).default("s3").index(),
  provider_etag: model.text().nullable(),
  reported_mime_type: model.text().nullable(),
  detected_mime_type: model.text().nullable(),
  expected_bytes: model.number(),
  stored_bytes: model.number().nullable(),
  crc32c: model.text().nullable(),
  preview_key: model.text().unique().nullable(),
  sha256: model.text().nullable(),
  width: model.number().nullable(),
  height: model.number().nullable(),
  orientation: model.number().nullable(),
  quality_band: model.text().nullable(),
  estimated_ppi: model.number().nullable(),
  warnings: model.json().nullable(),
  errors: model.json().nullable(),
  processing_attempts: model.number().default(0),
  status: model.enum(["pending", "uploading", "uploaded", "processing", "ready", "blocked", "failed", "deleted"]).default("pending").index(),
  failure_code: model.text().nullable(),
  failure_class: model.text().nullable(),
  dead_lettered_at: model.dateTime().nullable(),
  upload_started_at: model.dateTime().nullable(),
  uploaded_at: model.dateTime().nullable(),
  failed_at: model.dateTime().nullable(),
  last_activity_at: model.dateTime().nullable(),
  deletion_requested_at: model.dateTime().nullable(),
  provider_cleanup_completed_at: model.dateTime().nullable(),
  media_deleted_at: model.dateTime().nullable(),
})

export default PhotoAsset
