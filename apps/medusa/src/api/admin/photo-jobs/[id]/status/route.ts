import { transitionProductionStatus } from "../../admin-operations"
import { adminActor, photoServices, requestId, safeJob, sendAdminError } from "../../admin-runtime"

export async function POST(req: any, res: any): Promise<void> {
  try {
    const actorId = adminActor(req)
    const id = String(req.params?.id ?? "").trim()
    const { service, eventBus } = photoServices(req)
    const job = await service.retrievePhotoJob(id)
    const current = job.production_status ?? "accepted"
    const next = transitionProductionStatus(current, String(req.body?.status ?? ""))
    const updated = await service.updatePhotoJobs({
      selector: { id },
      data: { production_status: next, revision: (job.revision ?? 0) + 1, last_activity_at: new Date() },
    })
    await service.createPhotoAssetAccessAudits({
      asset_id: `job:${id}`,
      actor_id: actorId,
      actor_type: "admin",
      action: "production_status",
      reason: `${current}:${next}`,
      request_id: requestId(req) ?? null,
    })
    await eventBus.emit({ name: "photo_production.status_changed", data: { job_id: id, from: current, to: next } })
    res.json({ photo_job: safeJob(Array.isArray(updated) ? updated[0] : updated) })
  } catch (error) {
    sendAdminError(res, error)
  }
}
