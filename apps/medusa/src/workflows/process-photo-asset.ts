import { createHash } from "node:crypto"
import { Readable, Transform } from "node:stream"
import { validateImageInput } from "../modules/photo-production/image-policy"
import { processImage } from "../modules/photo-production/image-processor"
import type { PhotoObjectStorage } from "../modules/photo-storage/types"

type Asset = Record<string, any> & { id: string; job_id: string; object_key: string; display_name: string; reported_mime_type: string | null; status: string; expected_bytes: number }
type Dependencies = { storage: PhotoObjectStorage; service: any; locking: { acquire(key: string, ttl: number): Promise<{ release(): Promise<void> | void }> }; eventBus?: { emit(input: { name: string; data: unknown }): Promise<void> | void } }
const permanent = (error: unknown) => error instanceof Error && error.message.startsWith("photo_")
const previewKey = (asset: Asset) => asset.object_key.replace("/originals/", "/previews/") + ".jpg"

function hashingStream(source: Readable) {
  const hash = createHash("sha256")
  let resolve!: (value: string) => void
  const digest = new Promise<string>((done) => { resolve = done })
  const stream = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk) }, flush(callback) { resolve(hash.digest("hex")); callback() } })
  source.pipe(stream)
  return { stream, digest }
}

async function buffer(stream: Readable, maximum: number) {
  const chunks: Buffer[] = []; let total = 0
  for await (const chunk of stream) { const value = Buffer.from(chunk); total += value.length; if (total > maximum) throw new Error("photo_file_too_large"); chunks.push(value) }
  return Buffer.concat(chunks)
}

export async function processPhotoAsset(assetId: string, dependencies: Dependencies): Promise<Asset | null> {
  const lock = await dependencies.locking.acquire(`photo-asset:${assetId}`, 120)
  try {
    let asset = await dependencies.service.retrievePhotoAsset(assetId) as Asset
    if (!asset || asset.status === "ready" || asset.status === "blocked" || asset.status === "deleted") return asset ?? null
    if (asset.status !== "uploaded" && asset.status !== "failed") return asset
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        asset = await dependencies.service.updatePhotoAssets({ id: asset.id, status: "processing", processing_attempts: (asset.processing_attempts ?? 0) + 1, last_activity_at: new Date(), failure_code: null, failure_class: null })
        const head = await dependencies.storage.headPrivateObject(asset.object_key)
        const signature = await dependencies.storage.readPrivateObjectPrefix(asset.object_key, 64)
        const detected = validateImageInput({ filename: asset.display_name, reportedMime: asset.reported_mime_type ?? head.contentType, bytes: head.bytes, signature })
        const source = await dependencies.storage.readPrivateObject(asset.object_key)
        const hashed = hashingStream(source)
        const image = await processImage({ filename: asset.display_name, reportedMime: asset.reported_mime_type ?? head.contentType, detectedMime: detected.detectedMime, bytes: head.bytes, source: hashed.stream, readOriginal: () => buffer(hashed.stream, 50 * 1024 * 1024) })
        const sha256 = await hashed.digest
        const duplicates = await dependencies.service.listPhotoAssets({ job_id: asset.job_id, status: "ready", sha256 })
        if (duplicates.some((candidate: Asset) => candidate.id !== asset.id)) {
          await dependencies.storage.deletePrivateObjects([asset.object_key])
          return await dependencies.service.updatePhotoAssets({ id: asset.id, status: "blocked", sha256, failure_code: "duplicate_asset", errors: [{ code: "duplicate_asset", recoveryAction: "remove" }], last_activity_at: new Date() })
        }
        const key = previewKey(asset)
        await dependencies.storage.writePrivatePreview({ key, bytes: image.preview, contentType: "image/jpeg" })
        return await dependencies.service.updatePhotoAssets({ id: asset.id, status: "ready", preview_key: key, sha256, detected_mime_type: detected.detectedMime, width: image.width, height: image.height, orientation: image.orientation, estimated_ppi: image.estimatedPpi, quality_band: image.qualityBand, warnings: image.qualityBand === "good" ? [] : [{ code: `quality_${image.qualityBand}`, acknowledged: false }], errors: [], failure_code: null, failed_at: null, last_activity_at: new Date() })
      } catch (error) {
        if (permanent(error)) return await dependencies.service.updatePhotoAssets({ id: asset.id, status: "blocked", failure_code: (error as Error).message, errors: [{ code: (error as Error).message, recoveryAction: "replace" }], last_activity_at: new Date() })
        if (attempt === 3) {
          const failed = await dependencies.service.updatePhotoAssets({ id: asset.id, status: "failed", failure_code: "photo_processing_dead_letter", failure_class: "dead_letter", dead_lettered_at: new Date(), errors: [{ code: "photo_processing_dead_letter", recoveryAction: "retry" }], failed_at: new Date(), last_activity_at: new Date() })
          await dependencies.eventBus?.emit({ name: "photo_asset.dead_lettered", data: { asset_id: asset.id } })
          return failed
        }
      }
    }
    return null
  } finally { await lock.release() }
}
