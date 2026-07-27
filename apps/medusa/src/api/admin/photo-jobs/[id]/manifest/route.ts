import { buildProductionManifest } from "../../admin-operations"
import { adminActor, photoServices, sendAdminError } from "../../admin-runtime"

export async function GET(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    const id = String(req.params?.id ?? "").trim()
    const { service } = photoServices(req)
    const job = await service.retrievePhotoJob(id)
    if (!job.active_version_id) throw new Error("photo_version_not_found")
    const version = await service.retrievePhotoJobVersion(job.active_version_id)
    const [assets, items] = await Promise.all([
      service.listPhotoAssets({ job_id: id }, { take: 500 }),
      service.listPrintItems({ version_id: version.id }, { take: 500 }),
    ])
    res.json({ manifest: buildProductionManifest(job, version, assets, items) })
  } catch (error) {
    sendAdminError(res, error)
  }
}
