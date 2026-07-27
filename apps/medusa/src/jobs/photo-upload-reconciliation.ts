import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"

const GRACE_MS = 2 * 60 * 1000
const BATCH_SIZE = 50

type Dependencies = {
  service: any
  eventBus: { emit(input: { name: string; data: unknown }): Promise<void> | void }
  logger?: { info(message: string): void; warn(message: string): void }
  now?: Date
}

export async function republishStrandedPhotoUploads({
  service,
  eventBus,
  logger,
  now = new Date(),
}: Dependencies) {
  const assets = await service.listPhotoAssets(
    { status: "uploaded" },
    { take: BATCH_SIZE, order: { updated_at: "ASC" } },
  )
  const summary = { candidates: assets.length, republished: 0, failures: 0 }
  for (const asset of assets) {
    const updatedAt = new Date(asset.updated_at).getTime()
    if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt < GRACE_MS) continue
    try {
      await eventBus.emit({
        name: "photo_asset.uploaded",
        data: { asset_id: asset.id },
      })
      summary.republished += 1
    } catch {
      summary.failures += 1
      logger?.warn(`code=photo_upload_republish_retry asset_id=${asset.id}`)
    }
  }
  if (summary.republished) {
    logger?.info(`code=photo_upload_republished count=${summary.republished}`)
  }
  return summary
}

export default async function photoUploadReconciliation(container: MedusaContainer) {
  await republishStrandedPhotoUploads({
    service: container.resolve(PHOTO_PRODUCTION_MODULE),
    eventBus: container.resolve(Modules.EVENT_BUS),
    logger: container.resolve(ContainerRegistrationKeys.LOGGER),
  })
}

export const config = { name: "photo-upload-reconciliation", schedule: "* * * * *" }
