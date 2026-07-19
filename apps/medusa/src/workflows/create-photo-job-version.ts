import { evaluatePrintQuality, requiredWarningAcknowledgements } from "../modules/photo-production/quality"
import { resolvePrintSettings, type PrintSettings } from "../modules/photo-production/print-settings"

export type CreatePhotoVersionInput = {
  jobId: string
  idempotencyKey: string
  expectedRevision: number
  defaults: PrintSettings
  overrides: Array<{ assetId: string; settings: Partial<PrintSettings> }>
  warningAcknowledgements: Array<{ assetId: string; code: string }>
}

export type PhotoVersionStore = {
  transaction<T>(callback: (store: PhotoVersionStore) => Promise<T>): Promise<T>
  findVersionByIdempotency(jobId: string, key: string): Promise<any | null>
  retrieveJob(id: string): Promise<any | null>
  listAssets(filters: Record<string, unknown>): Promise<any[]>
  listVersions(filters: Record<string, unknown>): Promise<any[]>
  createVersion(input: Record<string, unknown>): Promise<any>
  createItems(inputs: Array<Record<string, unknown>>): Promise<any[]>
  updateJob(selector: Record<string, unknown>, data: Record<string, unknown>): Promise<any | null>
  resolveFinishVariant(finish: string): Promise<{ id: string; sku: string; published: boolean; commerceMode: string }>
}

export async function createPhotoJobVersion(input: CreatePhotoVersionInput, store: PhotoVersionStore) {
  return store.transaction(async (tx) => {
    const existing = await tx.findVersionByIdempotency(input.jobId, input.idempotencyKey)
    if (existing) return existing
    const job = await tx.retrieveJob(input.jobId)
    if (!job) throw new Error("photo_job_not_found")
    if (job.revision !== input.expectedRevision) throw new Error("photo_job_conflict")
    if (["cancelled", "expired"].includes(job.status)) throw new Error("photo_job_conflict")

    const normalizedDefaults = resolvePrintSettings(input.defaults)
    const assets = (await tx.listAssets({ job_id: input.jobId })).filter((asset) => asset.status !== "deleted")
    if (!assets.length || assets.some((asset) => asset.status !== "ready")) {
      throw new Error("photo_assets_not_ready")
    }
    const overrides = new Map<string, Partial<PrintSettings>>()
    for (const override of input.overrides) {
      if (overrides.has(override.assetId)) throw new Error("photo_override_invalid")
      overrides.set(override.assetId, override.settings)
    }
    if ([...overrides.keys()].some((id) => !assets.some((asset) => asset.id === id))) {
      throw new Error("photo_override_invalid")
    }
    const acknowledgements = new Map<string, Set<string>>()
    for (const acknowledgement of input.warningAcknowledgements) {
      const values = acknowledgements.get(acknowledgement.assetId) ?? new Set<string>()
      values.add(acknowledgement.code)
      acknowledgements.set(acknowledgement.assetId, values)
    }
    const resolved = []
    for (const asset of assets) {
      const settings = resolvePrintSettings(normalizedDefaults, overrides.get(asset.id))
      const variant = await tx.resolveFinishVariant(settings.finish)
      if (!variant.published || variant.commerceMode !== "photo_print") {
        throw new Error("photo_finish_unavailable")
      }
      const quality = evaluatePrintQuality({
        width: asset.width,
        height: asset.height,
        orientation: asset.orientation,
        cropMode: settings.cropMode,
        crop: settings.crop,
      })
      const required = requiredWarningAcknowledgements(quality.qualityBand, quality.warnings)
      const accepted = acknowledgements.get(asset.id) ?? new Set<string>()
      if (required.some((code) => !accepted.has(code))) {
        throw new Error("photo_warning_acknowledgement_required")
      }
      resolved.push({ asset, settings, variant, quality, accepted: [...accepted].sort() })
    }
    const previous = await tx.listVersions({ job_id: input.jobId })
    const sequence = Math.max(0, ...previous.map((version) => version.sequence ?? 0)) + 1
    const version = await tx.createVersion({
      job_id: input.jobId,
      sequence,
      source_revision: job.revision,
      idempotency_key: input.idempotencyKey,
      status: "draft",
      defaults: normalizedDefaults,
      currency_code: job.currency_code,
    })
    const items = await tx.createItems(resolved.map(({ asset, settings, variant, quality, accepted }) => ({
      version_id: version.id,
      asset_id: asset.id,
      variant_id: variant.id,
      sku: variant.sku,
      size: "4R",
      finish: settings.finish,
      border: settings.border,
      crop_mode: settings.cropMode,
      crop: settings.crop,
      quantity: settings.quantity,
      effective_ppi: quality.effectivePpi,
      quality_band: quality.qualityBand,
      warnings: quality.warnings,
      warning_acknowledgements: accepted,
      unit_price_snapshot: null,
    })))
    const updatedJob = await tx.updateJob(
      { id: job.id, revision: job.revision },
      { revision: job.revision + 1, active_version_id: version.id, last_activity_at: new Date() },
    )
    if (!updatedJob) throw new Error("photo_job_conflict")
    return { version, items, jobRevision: updatedJob.revision }
  })
}
