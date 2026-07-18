import { model } from "@medusajs/framework/utils";
import PhotoJob from "./photo-job";

const PhotoAsset = model.define("photo_asset", {
  id: model.id({ prefix: "phast" }).primaryKey(),
  job: model.belongsTo(() => PhotoJob),
  display_name: model.text(),
  object_key: model.text().unique(),
  reported_mime_type: model.text().nullable(),
  detected_mime_type: model.text().nullable(),
  expected_bytes: model.number(),
  stored_bytes: model.number().nullable(),
  crc32c: model.text().nullable(),
  status: model
    .enum(["pending", "uploading", "uploaded", "failed", "deleted"])
    .default("pending")
    .index(),
  failure_code: model.text().nullable(),
  upload_started_at: model.dateTime().nullable(),
  uploaded_at: model.dateTime().nullable(),
  failed_at: model.dateTime().nullable(),
  provider_cleanup_completed_at: model.dateTime().nullable(),
});

export default PhotoAsset;
