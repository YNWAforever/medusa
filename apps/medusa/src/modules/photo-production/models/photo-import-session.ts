import { model } from "@medusajs/framework/utils"
import PhotoJob from "./photo-job"

/**
 * One customer selection from one source.
 *
 * Distinct from PhotoUploadSession, which tracks a single asset's transfer into
 * storage. An import session spans the whole selection — many items from Google
 * Photos or Dropbox — and owns the provider credential for its lifetime.
 *
 * There is deliberately no plaintext token or link column. Credentials live only
 * in `credentials_ciphertext`, sealed by ProviderTokenVault, and are erased once
 * every selected item reaches a terminal state.
 */
const PhotoImportSession = model.define("photo_import_session", {
  id: model.id({ prefix: "phimp" }).primaryKey(),
  job: model.belongsTo(() => PhotoJob),
  source_type: model.enum(["device", "google_photos", "dropbox"]).index(),
  provider_session_id: model.text().nullable(),
  source_idempotency_key: model.text().unique(),
  credentials_ciphertext: model.text().nullable(),
  credentials_key_version: model.number().nullable(),
  credentials_cleared_at: model.dateTime().nullable(),
  selection_state: model
    .enum(["pending", "selected", "importing", "completed", "cancelled", "expired"])
    .default("pending")
    .index(),
  selected_count: model.number().default(0),
  imported_count: model.number().default(0),
  failed_count: model.number().default(0),
  expires_at: model.dateTime(),
  completed_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
})

export default PhotoImportSession
