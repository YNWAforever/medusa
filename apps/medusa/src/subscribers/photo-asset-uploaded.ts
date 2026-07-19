import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import { PHOTO_STORAGE_MODULE } from "../modules/photo-storage"
import { processPhotoAsset } from "../workflows/process-photo-asset"

export default async function photoAssetUploaded({ data, container }: { data: { asset_id: string }; container: any }) {
  const locking = container.resolve("locking")
  await processPhotoAsset(data.asset_id, {
    service: container.resolve(PHOTO_PRODUCTION_MODULE),
    storage: container.resolve(PHOTO_STORAGE_MODULE),
    locking: { acquire: async (key, ttl) => locking.acquire(key, { ttl }) },
    eventBus: container.resolve("event_bus"),
  })
}

export const config = { event: "photo_asset.uploaded" }
