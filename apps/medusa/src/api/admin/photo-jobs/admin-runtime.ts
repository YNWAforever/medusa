import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { BRANCH_CAPABILITY_MODULE } from "../../../modules/branch-capability"
import { PHOTO_PRODUCTION_MODULE } from "../../../modules/photo-production"
import { PHOTO_STORAGE_MODULE } from "../../../modules/photo-storage"
import { assertAdminActor } from "./admin-operations"

export const ADMIN_PHOTO_JOB_BATCH = 100

export function adminActor(req: any): string {
  return assertAdminActor({
    ...req.auth_context,
    actor_type: req.auth_context?.actor_type ?? "user",
  })
}

export function photoServices(req: any) {
  return {
    service: req.scope.resolve(PHOTO_PRODUCTION_MODULE),
    storage: req.scope.resolve(PHOTO_STORAGE_MODULE),
    eventBus: req.scope.resolve("event_bus"),
    query: req.scope.resolve(ContainerRegistrationKeys.QUERY),
  }
}

export function branchService(req: any): any {
  return req.scope.resolve(BRANCH_CAPABILITY_MODULE)
}

export function safeJob(job: any) {
  const fields = [
    "id", "locale", "currency_code", "product_handle", "status",
    "production_status", "revision", "active_version_id", "retention_class",
    "last_activity_at", "ready_at", "failed_at", "cancelled_at", "expired_at",
    "fulfilled_at", "retention_hold_until", "media_expires_at", "created_at", "updated_at",
  ]
  return Object.fromEntries(fields.filter((field) => field in job).map((field) => [field, job[field]]))
}

export function safeAsset(asset: any) {
  const fields = [
    "id", "display_name", "expected_bytes", "stored_bytes", "detected_mime_type",
    "status", "failure_code", "failure_class", "width", "height", "orientation",
    "quality_band", "estimated_ppi", "warnings", "errors", "processing_attempts",
    "uploaded_at", "failed_at", "media_deleted_at",
  ]
  return Object.fromEntries(fields.filter((field) => field in asset).map((field) => [field, asset[field]]))
}

export function requestId(req: any): string | undefined {
  const value = req.headers?.["x-request-id"]
  return Array.isArray(value) ? value[0] : value
}

export function sendAdminError(res: any, error: unknown): void {
  const code = error instanceof Error ? error.message : "photo_admin_error"
  if (code === "photo_admin_unauthorized") res.status(401).json({ code })
  else if (code.includes("not_found")) res.status(404).json({ code })
  else if (code.includes("transition") || code.includes("retry")) res.status(409).json({ code })
  else res.status(400).json({ code })
}
