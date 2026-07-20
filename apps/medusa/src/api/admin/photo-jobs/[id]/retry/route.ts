import { retryDeadLetteredPhotoAsset } from "../../../../../workflows/retry-photo-asset"
import { adminActor, photoServices, requestId, sendAdminError } from "../../admin-runtime"

export async function POST(req: any, res: any): Promise<void> {
  try {
    const actorId = adminActor(req)
    const jobId = String(req.params?.id ?? "").trim()
    const assetId = String(req.body?.assetId ?? "").trim()
    if (!jobId || !assetId) throw new Error("photo_retry_invalid")
    const { service, eventBus } = photoServices(req)
    const asset = await retryDeadLetteredPhotoAsset({ jobId, assetId, actorId, requestId: requestId(req) }, { service, eventBus })
    res.json({ asset: { id: asset.id, status: asset.status } })
  } catch (error) {
    sendAdminError(res, error)
  }
}
