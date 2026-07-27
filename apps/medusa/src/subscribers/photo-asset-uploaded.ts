import { randomUUID } from "node:crypto"
import type { SubscriberArgs } from "@medusajs/framework"
import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import { PHOTO_STORAGE_MODULE } from "../modules/photo-storage"
import { processPhotoAsset } from "../workflows/process-photo-asset"

export default async function photoAssetUploaded({ event, container }: SubscriberArgs<{ asset_id: string }>) {
  const locking = container.resolve("locking")
  await processPhotoAsset(event.data.asset_id, {
    service: container.resolve(PHOTO_PRODUCTION_MODULE),
    storage: container.resolve(PHOTO_STORAGE_MODULE),
    locking: {
      acquire: async (key, ttl) => {
        const ownerId = randomUUID()
        await locking.acquire(key, { ownerId, expire: ttl })
        return { release: async () => { await locking.release(key, { ownerId }) } }
      },
    },
    eventBus: container.resolve("event_bus"),
  })
}

export const config = { event: "photo_asset.uploaded" }
