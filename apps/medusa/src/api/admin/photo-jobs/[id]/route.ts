import { adminActor, photoServices, safeAsset, safeJob, sendAdminError } from "../admin-runtime"

export async function GET(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    const id = String(req.params?.id ?? "").trim()
    if (!id) throw new Error("photo_job_not_found")
    const { service } = photoServices(req)
    const job = await service.retrievePhotoJob(id)
    const assets = await service.listPhotoAssets({ job_id: id }, { take: 100, order: { created_at: "ASC" } })
    let version: any = null
    let items: any[] = []
    if (job.active_version_id) {
      version = await service.retrievePhotoJobVersion(job.active_version_id)
      items = await service.listPrintItems({ version_id: version.id }, { take: 500, order: { created_at: "ASC" } })
    }
    const audits = await service.listPhotoAssetAccessAudits(
      { asset_id: [...assets.map((asset: any) => asset.id), `job:${id}`] },
      { take: 100, order: { created_at: "DESC" } },
    )
    res.json({
      photo_job: safeJob(job),
      assets: assets.map(safeAsset),
      version: version ? { id: version.id, order_id: version.order_id, manifest_digest: version.manifest_digest, status: version.status } : null,
      items: items.map((item: any) => ({ id: item.id, asset_id: item.asset_id, sku: item.sku, size: item.size, finish: item.finish, border: item.border, crop: item.crop, quantity: item.quantity, quality_band: item.quality_band, warning_acknowledgements: item.warning_acknowledgements })),
      audits: audits.map((audit: any) => ({ id: audit.id, asset_id: audit.asset_id, actor_id: audit.actor_id, action: audit.action, reason: audit.reason, request_id: audit.request_id, created_at: audit.created_at })),
    })
  } catch (error) {
    sendAdminError(res, error)
  }
}
