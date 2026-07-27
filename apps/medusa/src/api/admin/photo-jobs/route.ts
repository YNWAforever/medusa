import { createHash, randomUUID } from "node:crypto"

import { acceleratedRetentionEnabled, calculateMediaExpiry } from "../../../modules/photo-production/retention"
import { ADMIN_PHOTO_JOB_BATCH, adminActor, photoServices, safeJob, sendAdminError } from "./admin-runtime"

export async function GET(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    const { service } = photoServices(req)
    const filters: Record<string, unknown> = {}
    if (req.query?.status) filters.status = String(req.query.status)
    if (req.query?.production_status) filters.production_status = String(req.query.production_status)
    const jobs = await service.listPhotoJobs(filters, { take: ADMIN_PHOTO_JOB_BATCH, order: { updated_at: "DESC" } })
    const term = String(req.query?.q ?? "").trim().toLowerCase()
    const output = jobs.map(safeJob).filter((job: any) => !term || String(job.id).toLowerCase().includes(term))
    res.json({ photo_jobs: output, count: output.length, limit: ADMIN_PHOTO_JOB_BATCH })
  } catch (error) { sendAdminError(res, error) }
}

export async function POST(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    if (!acceleratedRetentionEnabled(process.env)) throw new Error("photo_retention_test_mode_disabled")
    const { service, query } = photoServices(req)
    let regionId = String(req.body?.regionId ?? "").trim()
    if (!regionId) {
      const regions = await query.graph({ entity: "region", fields: ["id", "countries.iso_2"], filters: {} })
      regionId = String(regions.data.find((region: any) => region.countries?.some((country: any) => String(country.iso_2).toLowerCase() === "hk"))?.id ?? "")
    }
    if (!regionId) throw new Error("photo_region_not_found")
    const now = new Date()
    const retentionJob = { status: "draft", retention_class: "accelerated_test", last_activity_at: now }
    const job = await service.createPhotoJob({
      guest_owner_hash: createHash("sha256").update(randomUUID()).digest("hex"),
      customer_id: null,
      region_id: regionId,
      locale: req.body?.locale === "zh-HK" ? "zh-HK" : "en",
      currency_code: "hkd",
      product_handle: "classic-4r-photo-print",
      status: "draft",
      production_status: null,
      revision: 0,
      retention_class: "accelerated_test",
      last_activity_at: now,
      media_expires_at: calculateMediaExpiry(retentionJob),
    })
    res.status(201).json({ photo_job: safeJob(Array.isArray(job) ? job[0] : job) })
  } catch (error) { sendAdminError(res, error) }
}