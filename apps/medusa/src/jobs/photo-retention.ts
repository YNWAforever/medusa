import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import { isRetentionEligible } from "../modules/photo-production/retention"
import { PHOTO_STORAGE_MODULE } from "../modules/photo-storage"
import { photoObjectRef, type PhotoObjectRef } from "../modules/photo-storage/types"

export const PHOTO_RETENTION_BATCH = 50

type Dependencies = {
  service: any
  storage: any
  locking: { execute<T>(keys: string[], action: () => Promise<T>): Promise<T> }
  eventBus: { emit(input: { name: string; data: unknown }): Promise<void> | void }
  logger: { info(message: string): void; warn(message: string): void }
  now?: Date
  batchSize?: number
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /not.?found|photo_storage_not_found/i.test(error.message)
}

async function verifyAbsent(storage: any, ref: PhotoObjectRef): Promise<void> {
  try {
    await storage.inspect(ref)
    throw new Error("photo_retention_object_present")
  } catch (error) {
    if (isNotFound(error)) return
    throw error
  }
}

export async function runPhotoRetention({
  service,
  storage,
  locking,
  eventBus,
  logger,
  now = new Date(),
  batchSize = PHOTO_RETENTION_BATCH,
}: Dependencies) {
  const summary = { expiredJobs: 0, deletedAssets: 0, failures: 0 }
  const jobs = await service.listPhotoJobs(
    { status: ["draft", "uploading", "ready", "cart_attached", "failed", "cancelled", "fulfilled"] },
    { take: batchSize, order: { last_activity_at: "ASC" } },
  )
  for (const job of jobs.slice(0, batchSize)) {
    if (!isRetentionEligible(job, now)) continue
    try {
      await locking.execute([`photo-job:${job.id}`, `photo-retention:${job.id}`], async () => {
        const currentJob = await service.retrievePhotoJob(job.id)
        if (!isRetentionEligible(currentJob, now)) return
        const assets = await service.listPhotoAssets({ job_id: job.id })
        let objectCount = 0
        for (const asset of assets) {
          if (asset.status === "deleted" && !asset.object_key && !asset.preview_key) continue
          const refs = [asset.object_key, asset.preview_key]
            .filter((key): key is string => typeof key === "string" && key.length > 0)
            .map((key) => photoObjectRef(asset, key))
          if (refs.length) {
            await storage.delete(refs)
            for (const ref of refs) await verifyAbsent(storage, ref)
          }
          await service.updatePhotoAssets({
            selector: { id: asset.id },
            data: {
              status: "deleted",
              object_key: null,
              preview_key: null,
              media_deleted_at: now,
              provider_cleanup_completed_at: now,
              deletion_requested_at: asset.deletion_requested_at ?? now,
            },
          })
          summary.deletedAssets += 1
          objectCount += refs.length
        }
        await service.updatePhotoJobs({
          selector: { id: job.id },
          data: { status: "expired", expired_at: now, media_expires_at: now, last_activity_at: now },
        })
        await eventBus.emit({
          name: "photo_retention.deleted",
          data: { job_id: job.id, deleted_at: now.toISOString(), asset_count: assets.length, object_count: objectCount },
        })
        summary.expiredJobs += 1
        logger.info(`code=photo_retention_deleted job_id=${job.id} asset_count=${assets.length} object_count=${objectCount}`)
      })
    } catch {
      summary.failures += 1
      logger.warn(`code=photo_retention_retry job_id=${job.id}`)
    }
  }
  return summary
}

export default async function photoRetention(container: MedusaContainer) {
  await runPhotoRetention({
    service: container.resolve(PHOTO_PRODUCTION_MODULE),
    storage: container.resolve(PHOTO_STORAGE_MODULE),
    locking: container.resolve(Modules.LOCKING),
    eventBus: container.resolve(Modules.EVENT_BUS),
    logger: container.resolve(ContainerRegistrationKeys.LOGGER),
  })
}

export const config = { name: "photo-retention", schedule: "0 * * * *" }
