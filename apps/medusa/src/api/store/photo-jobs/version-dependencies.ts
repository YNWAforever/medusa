import { createHash } from "node:crypto"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PHOTO_PRODUCTION_MODULE } from "../../../modules/photo-production"
import { verifyGuestSecret } from "../../../modules/photo-production/ownership"
import { createPhotoJobVersion, type PhotoVersionStore } from "../../../workflows/create-photo-job-version"
import { quotePhotoJob, type QuoteStore } from "../../../workflows/quote-photo-job"
import type { VersionRouteDependencies } from "./version-handlers"

const finishSku = {
  glossy: "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
  matte: "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-2",
} as const

const first = (value: any) => Array.isArray(value) ? value[0] ?? null : value ?? null
const header = (request: any, name: string) => {
  const value = request.headers?.get?.(name) ?? request.headers?.[name]
  return typeof value === "string" ? value.trim() : ""
}

function serviceCall(service: any, method: string, args: any[], context?: Record<string, unknown>) {
  if (!context) return service[method](...args)
  if (method.startsWith("list") || method.startsWith("retrieve")) {
    return service[method](...args, {}, context)
  }
  return service[method](...args, context)
}

function versionStore(scope: any, context?: Record<string, unknown>): PhotoVersionStore {
  const service: any = scope.resolve(PHOTO_PRODUCTION_MODULE)
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  return {
    transaction: async (callback) => {
      if (context?.transactionManager) return callback(versionStore(scope, context))
      return service.withPhotoJobTransaction(
        (shared: Record<string, unknown>) => callback(versionStore(scope, shared)),
        { isolationLevel: "SERIALIZABLE" },
      )
    },
    findVersionByIdempotency: async (jobId, key) => {
      const versions = await serviceCall(service, "listPhotoJobVersions", [{ job_id: jobId, idempotency_key: key }], context)
      const version = versions[0]
      if (!version) return null
      const items = await serviceCall(service, "listPrintItems", [{ version_id: version.id }], context)
      return { version, items }
    },
    retrieveJob: async (id) => {
      try { return await serviceCall(service, "retrievePhotoJob", [id], context) } catch (error) {
        if (error instanceof Error && /not found|no .*found/i.test(error.message)) return null
        throw error
      }
    },
    listAssets: (filters) => serviceCall(service, "listPhotoAssets", [filters], context),
    listVersions: (filters) => serviceCall(service, "listPhotoJobVersions", [filters], context),
    createVersion: async (input) => first(await serviceCall(service, "createPhotoJobVersions", [input], context)),
    createItems: (inputs) => serviceCall(service, "createPrintItems", [inputs], context),
    updateJob: async (selector, data) => first(await serviceCall(service, "updatePhotoJobs", [{ selector, data }], context)),
    resolveFinishVariant: async (finish) => {
      const sku = finishSku[finish as keyof typeof finishSku]
      if (!sku) return { id: "", sku: "", published: false, commerceMode: "" }
      const result = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "product.status", "product.metadata"],
        filters: { sku },
      })
      const variant = result.data?.[0]
      return {
        id: variant?.id ?? "",
        sku: variant?.sku ?? sku,
        published: variant?.product?.status === "published",
        commerceMode: variant?.product?.metadata?.commerce_mode ?? "",
      }
    },
  }
}

function quoteStore(scope: any, job: any): QuoteStore {
  const service: any = scope.resolve(PHOTO_PRODUCTION_MODULE)
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  return {
    retrieveVersion: async (id) => {
      try { return await service.retrievePhotoJobVersion(id) } catch (error) {
        if (error instanceof Error && /not found|no .*found/i.test(error.message)) return null
        throw error
      }
    },
    listItems: (filters) => service.listPrintItems(filters),
    resolveVariantPrice: async (id) => {
      const result = await query.graph({
        entity: "product_variant",
        fields: ["id", "calculated_price.*", "product.status", "product.metadata"],
        filters: { id },
        context: { region_id: job.region_id, currency_code: "hkd" },
      })
      const variant = result.data?.[0]
      if (!variant) return null
      return {
        id: variant.id,
        published: variant.product?.status === "published",
        commerceMode: variant.product?.metadata?.commerce_mode ?? "",
        currencyCode: variant.calculated_price?.currency_code ?? "hkd",
        amount: variant.calculated_price?.calculated_amount,
      }
    },
    assertCapability: async (_items, fulfillment) => {
      if (fulfillment?.type === "pickup") {
        throw new Error("photo_capability_unavailable")
      }
    },
    commitQuote: async (input) => service.withPhotoJobTransaction(
      async (shared: Record<string, unknown>) => {
        await Promise.all(input.snapshots.map(({ id, unit_price_snapshot }: any) =>
          service.updatePrintItems({
            selector: { id },
            data: { unit_price_snapshot },
          }, shared),
        ))
        const updated = first(await service.updatePhotoJobVersions({
          selector: { id: input.versionId, status: input.expectedStatus },
          data: input.version,
        }, shared))
        if (!updated) throw new Error("photo_job_conflict")
      },
      { isolationLevel: "SERIALIZABLE" },
    ),
    createPriceChangedQuote: async (input) => service.withPhotoJobTransaction(
      async (shared: Record<string, unknown>) => {
        const oldVersion = input.version
        const digest = createHash("sha256").update(JSON.stringify(input.snapshots)).digest("hex")
        const idempotencyKey = `price-change:${oldVersion.id}:${digest}`
        const existing = await service.listPhotoJobVersions(
          { job_id: oldVersion.job_id, idempotency_key: idempotencyKey }, {}, shared,
        )
        if (existing[0]) {
          return {
            versionId: existing[0].id,
            subtotal: existing[0].subtotal,
            currencyCode: existing[0].currency_code,
            quotedAt: new Date(existing[0].quoted_at).toISOString(),
            quoteExpiresAt: new Date(existing[0].quote_expires_at).toISOString(),
            manifestDigest: existing[0].manifest_digest,
            requiresReview: true,
          }
        }
        const job = await service.retrievePhotoJob(oldVersion.job_id, {}, shared)
        const versions = await service.listPhotoJobVersions({ job_id: oldVersion.job_id }, {}, shared)
        const sequence = Math.max(0, ...versions.map((value: any) => value.sequence ?? 0)) + 1
        const created = first(await service.createPhotoJobVersions({
          job_id: oldVersion.job_id,
          sequence,
          source_revision: job.revision,
          idempotency_key: idempotencyKey,
          status: "quoted",
          defaults: oldVersion.defaults,
          subtotal: input.subtotal,
          currency_code: "hkd",
          quoted_at: input.quotedAt,
          quote_expires_at: input.quoteExpiresAt,
          manifest_digest: input.manifestDigest,
        }, shared))
        if (!created) throw new Error("photo_quote_changed")
        const prices = new Map(input.snapshots.map((value: any) => [value.id, value.unit_price_snapshot]))
        await service.createPrintItems(input.items.map((item: any) => ({
          version_id: created.id,
          asset_id: item.asset_id,
          variant_id: item.variant_id,
          sku: item.sku,
          size: item.size ?? "4R",
          finish: item.finish,
          border: item.border,
          crop_mode: item.crop_mode,
          crop: item.crop,
          quantity: item.quantity,
          effective_ppi: item.effective_ppi,
          quality_band: item.quality_band,
          warnings: item.warnings ?? [],
          warning_acknowledgements: item.warning_acknowledgements ?? [],
          unit_price_snapshot: prices.get(item.id),
        })), shared)
        const updated = first(await service.updatePhotoJobs({
          selector: { id: job.id, revision: job.revision },
          data: { revision: job.revision + 1, active_version_id: created.id, last_activity_at: new Date() },
        }, shared))
        if (!updated) throw new Error("photo_job_conflict")
        return {
          versionId: created.id,
          subtotal: input.subtotal,
          currencyCode: "hkd",
          quotedAt: input.quotedAt.toISOString(),
          quoteExpiresAt: input.quoteExpiresAt.toISOString(),
          manifestDigest: input.manifestDigest,
          requiresReview: true,
        }
      },
      { isolationLevel: "SERIALIZABLE" },
    ),
  }
}

export function createMedusaVersionDependencies(request: any): VersionRouteDependencies {
  const service: any = request.scope.resolve(PHOTO_PRODUCTION_MODULE)
  const ownedJobs = new Map<string, any>()
  const retrieveOwned = async (jobId: string) => {
    let job: any
    try { job = await service.retrievePhotoJob(jobId) } catch (error) {
      if (error instanceof Error && /not found|no .*found/i.test(error.message)) {
        throw new Error("photo_job_not_found")
      }
      throw error
    }
    const customerId = request.auth_context?.actor_id?.trim()
    const guest = header(request, "x-fotomax-guest-token")
    const owned = customerId
      ? job.customer_id === customerId
      : Boolean(guest && job.guest_owner_hash && verifyGuestSecret(guest, job.guest_owner_hash))
    if (!owned || job.status === "expired") throw new Error("photo_job_not_found")
    ownedJobs.set(jobId, job)
    return job
  }
  return {
    assertOwner: async (jobId) => { await retrieveOwned(jobId) },
    createVersion: (input) => createPhotoJobVersion(input, versionStore(request.scope)),
    quoteVersion: async (input) => {
      const job = ownedJobs.get(input.jobId) ?? await retrieveOwned(input.jobId)
      return quotePhotoJob(input, quoteStore(request.scope, job))
    },
  }
}
