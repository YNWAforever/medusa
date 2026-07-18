import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import { PHOTO_STORAGE_MODULE } from "../modules/photo-storage"

export const PHOTO_UPLOAD_CLEANUP_BATCH = 100
type Dependencies = { service: any; storage: any; logger: { info(message: string): void; warn(message: string): void }; now?: Date; batchSize?: number }
function first<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null }
function event(logger: Dependencies["logger"], level: "info" | "warn", code: string, fields: Record<string, string>) { logger[level]([`code=${code}`, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(" ")) }

export async function runPhotoUploadCleanup({ service, storage, logger, now = new Date(), batchSize = PHOTO_UPLOAD_CLEANUP_BATCH }: Dependencies) {
  const summary = { expiredSessions: 0, deletedAssets: 0, failures: 0 }
  const sessions = await service.listPhotoUploadSessions({ status: "active", expires_at: { $lt: now } }, { take: batchSize })
  for (const session of sessions.slice(0, batchSize)) {
    let asset: any
    try {
      asset = await service.retrievePhotoAsset(session.asset_id)
      if (session.provider_upload_id) await storage.abortMultipartUpload({ key: asset.object_key, uploadId: session.provider_upload_id })
      const updated = first(await service.updatePhotoUploadSessions({ selector: { id: session.id, status: "active" }, data: { status: "expired", aborted_at: now } }))
      if (!updated) throw new Error("conditional_update_empty")
      if (asset.status === "uploading") await service.updatePhotoAssets({ selector: { id: asset.id, status: "uploading" }, data: { status: "failed", failure_code: "upload_expired", failed_at: now } })
      summary.expiredSessions += 1; event(logger, "info", "photo_cleanup_session_expired", { session_id: session.id, asset_id: asset.id, object_key: asset.object_key })
    } catch {
      summary.failures += 1; event(logger, "warn", "photo_cleanup_provider_retry", { session_id: session.id, asset_id: asset?.id ?? "unknown", object_key: asset?.object_key ?? "unknown" })
    }
  }

  const jobs = await service.listPhotoJobs({ status: ["cancelled", "expired"] }, { take: batchSize })
  const terminalJobIds = new Set(jobs.slice(0, batchSize).map((job: any) => job.id))
  const assets = await service.listPhotoAssets({}, { take: batchSize })
  for (const asset of assets.slice(0, batchSize)) {
    if (asset.status !== "deleted" && !terminalJobIds.has(asset.job_id)) continue
    try {
      const assetSessions = await service.listPhotoUploadSessions({ asset_id: asset.id })
      for (const session of assetSessions) if (session.provider_upload_id) await storage.abortMultipartUpload({ key: asset.object_key, uploadId: session.provider_upload_id })
      await storage.deletePrivateObjects([asset.object_key])
      if (asset.status !== "deleted") {
        const updated = first(await service.updatePhotoAssets({ selector: { id: asset.id, status: asset.status }, data: { status: "deleted", deleted_at: now } }))
        if (!updated) throw new Error("conditional_update_empty")
      }
      summary.deletedAssets += 1; event(logger, "info", "photo_cleanup_asset_deleted", { asset_id: asset.id, job_id: asset.job_id, object_key: asset.object_key })
    } catch {
      summary.failures += 1; event(logger, "warn", "photo_cleanup_asset_retry", { asset_id: asset.id, job_id: asset.job_id, object_key: asset.object_key })
    }
  }
  return summary
}

export default async function photoUploadCleanup(container: MedusaContainer) {
  await runPhotoUploadCleanup({ service: container.resolve(PHOTO_PRODUCTION_MODULE), storage: container.resolve(PHOTO_STORAGE_MODULE), logger: container.resolve(ContainerRegistrationKeys.LOGGER) })
}

export const config = { name: "photo-upload-cleanup", schedule: "*/15 * * * *" }
