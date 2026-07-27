import { requestAuditedAssetAccess } from "../../../../admin-operations"
import { adminActor, photoServices, requestId, sendAdminError } from "../../../../admin-runtime"

export async function POST(req: any, res: any): Promise<void> {
  try {
    const actorId = adminActor(req)
    const { service, storage } = photoServices(req)
    const access = await requestAuditedAssetAccess({
      jobId: String(req.params?.id ?? ""),
      assetId: String(req.params?.assetId ?? ""),
      actorId,
      reason: String(req.body?.reason ?? ""),
      requestId: requestId(req),
    }, { service, storage })
    res.setHeader("Cache-Control", "no-store")
    res.json({ access })
  } catch (error) {
    sendAdminError(res, error)
  }
}
