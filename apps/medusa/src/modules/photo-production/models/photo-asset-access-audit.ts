import { model } from "@medusajs/framework/utils";
const PhotoAssetAccessAudit = model.define("photo_asset_access_audit", {
  id: model.id({ prefix: "phaud" }).primaryKey(),
  asset_id: model.text().index(),
  actor_id: model.text(),
  actor_type: model.text(),
  action: model.text(),
  reason: model.text(),
  request_id: model.text().nullable(),
});
export default PhotoAssetAccessAudit;
