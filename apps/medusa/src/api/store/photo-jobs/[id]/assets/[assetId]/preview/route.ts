import { MedusaError } from "@medusajs/framework/utils"
import { PHOTO_PRODUCTION_MODULE } from "../../../../../../../modules/photo-production"
import { verifyGuestSecret } from "../../../../../../../modules/photo-production/ownership"
import { PHOTO_STORAGE_MODULE } from "../../../../../../../modules/photo-storage"
import { photoObjectRef } from "../../../../../../../modules/photo-storage/types"

function notFound(): never { throw new MedusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found") }
function header(req: any, name: string): string | null { return typeof req.headers?.get === "function" ? req.headers.get(name) : req.headers?.[name] ?? null }

export async function GET(req: any, res: any): Promise<void> {
  const jobId = req.params?.id?.trim(); const assetId = req.params?.assetId?.trim(); if (!jobId || !assetId) notFound()
  const service: any = req.scope.resolve(PHOTO_PRODUCTION_MODULE); const storage: any = req.scope.resolve(PHOTO_STORAGE_MODULE)
  let job: any; let asset: any
  try { job = await service.retrievePhotoJob(jobId); asset = await service.retrievePhotoAsset(assetId) } catch { notFound() }
  const customerId = req.auth_context?.actor_id?.trim(); const guest = header(req, "x-fotomax-guest-token")?.trim()
  const owned = customerId ? job.customer_id === customerId : !!guest && !!job.guest_owner_hash && verifyGuestSecret(guest, job.guest_owner_hash)
  if (!owned || job.status === "expired" || asset.job_id !== jobId || asset.status !== "ready" || !asset.preview_key) notFound()
  const preview = await storage.signRead(photoObjectRef(asset, asset.preview_key), 300)
  res.status(302).setHeader("location", preview.url).setHeader("cache-control", "private, no-store").send()
}
