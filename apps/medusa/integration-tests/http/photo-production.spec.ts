import path from "node:path"
import { randomBytes, randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { beforeAll, describe, expect, it } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner, type MedusaSuiteOptions } from "@medusajs/test-utils"
import sharp from "sharp"

import { POST as requestAdminAssetAccess } from "../../src/api/admin/photo-jobs/[id]/assets/[assetId]/access/route"
import { GET as getAdminManifest } from "../../src/api/admin/photo-jobs/[id]/manifest/route"
import { runPhotoRetention } from "../../src/jobs/photo-retention"
import { BRANCH_CAPABILITY_MODULE } from "../../src/modules/branch-capability"
import { PHOTO_PRODUCTION_MODULE } from "../../src/modules/photo-production"
import { processImage } from "../../src/modules/photo-production/image-processor"
import { PHOTO_STORAGE_MODULE } from "../../src/modules/photo-storage"
import seedFotomax from "../../src/scripts/seed"

const appRoot = path.resolve(__dirname, "../..")
const env = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USERNAME: "fotomax",
  DB_PASSWORD: "fotomax_local_only",
  MEDUSA_WORKER_MODE: "shared",
  STORE_CORS: "http://localhost:3100",
  ADMIN_CORS: "http://localhost:9000",
  AUTH_CORS: "http://localhost:3100",
  JWT_SECRET: "fotomax-local-jwt-secret",
  COOKIE_SECRET: "fotomax-local-cookie-secret",
  PHOTO_STORAGE_ENDPOINT: process.env.PHOTO_STORAGE_ENDPOINT ?? "http://localhost:9002",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
  PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
}

type ImageFormat = "jpeg" | "png" | "webp"

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {}
}

function crc32c(bytes: Buffer): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
    }
  }
  const output = Buffer.alloc(4)
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return output.toString("base64")
}

async function generatedImage(format: ImageFormat): Promise<Buffer> {
  const image = sharp({
    create: { width: 1200, height: 1800, channels: 3, background: { r: 38, g: 126, b: 112 } },
  })
  return format === "jpeg"
    ? image.jpeg({ quality: 88 }).toBuffer()
    : format === "png"
      ? image.png().toBuffer()
      : image.webp({ quality: 88 }).toBuffer()
}

async function publishableKey(options: MedusaSuiteOptions): Promise<string> {
  const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY)
  const response = await query.graph({
    entity: "api_key",
    fields: ["token"],
    filters: { title: "Fotomax Storefront Staging" },
  })
  return record(response.data[0]).token as string
}

async function waitForAsset(options: MedusaSuiteOptions, assetId: string, statuses: string[]) {
  const service: any = options.getContainer().resolve(PHOTO_PRODUCTION_MODULE)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const asset = await service.retrievePhotoAsset(assetId)
    if (statuses.includes(asset.status)) return asset
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`photo_asset_timeout:${assetId}`)
}

medusaIntegrationTestRunner({
  moduleName: "fotomax-photo-production",
  cwd: appRoot,
  env,
  testSuite: (options) => {
    let key: string

    beforeAll(async () => {
      await seedFotomax({ container: options.getContainer() } as ExecArgs)
      key = await publishableKey(options)
      options.api.defaults.headers.common["x-publishable-api-key"] = key
    })

    async function createJob() {
      const guest = randomBytes(32).toString("base64url")
      const headers = { "x-publishable-api-key": key, "x-fotomax-guest-token": guest }
      const response = await options.api.post("/store/photo-jobs", { locale: "en" }, { headers })
      return { job: record(response.data.photo_job), headers }
    }

    async function upload(jobId: string, headers: Record<string, string>, bytes: Buffer, filename: string, mime: string) {
      const checksumCRC32C = crc32c(bytes)
      const started = await options.api.post(`/store/photo-jobs/${jobId}/uploads`, {
        filename,
        reportedMime: mime,
        bytes: bytes.length,
        sourceIdempotencyKey: randomUUID(),
        signatureBase64: bytes.subarray(0, 64).toString("base64"),
      }, { headers })
      const session = record(started.data.upload)
      const signed = await options.api.post(`/store/photo-jobs/${jobId}/uploads/${session.sessionId}/parts`, {
        partNumber: 1,
        checksumCRC32C,
      }, { headers })
      const part = record(signed.data.part)
      const put = await fetch(part.url, { method: "PUT", headers: part.requiredHeaders, body: bytes as any })
      expect(put.status).toBe(200)
      const etag = put.headers.get("etag")
      expect(etag).toBeTruthy()
      const completed = await options.api.post(`/store/photo-jobs/${jobId}/uploads/${session.sessionId}/complete`, {
        parts: [{ partNumber: 1, etag, checksumCRC32C }],
      }, { headers })
      return { assetId: record(completed.data.asset).id as string, sessionId: session.sessionId as string }
    }

    describe("photo production journey", () => {
      it("processes generated JPEG, PNG, and WebP files and blocks duplicates and corrupt images", async () => {
        const { job, headers } = await createJob()
        const fixtures = await Promise.all([generatedImage("jpeg"), generatedImage("png"), generatedImage("webp")])
        const inputs = [
          { bytes: fixtures[0], filename: "generated.jpg", mime: "image/jpeg" },
          { bytes: fixtures[1], filename: "generated.png", mime: "image/png" },
          { bytes: fixtures[2], filename: "generated.webp", mime: "image/webp" },
        ]

        for (const input of inputs) {
          const uploaded = await upload(job.id, headers, input.bytes, input.filename, input.mime)
          const ready = await waitForAsset(options, uploaded.assetId, ["ready"])
          expect(ready).toMatchObject({ status: "ready", width: 1200, height: 1800, quality_band: "good" })
          expect(ready.preview_key).toContain("/previews/")
        }

        const duplicate = await upload(job.id, headers, fixtures[0], "generated-copy.jpg", "image/jpeg")
        await expect(waitForAsset(options, duplicate.assetId, ["blocked"])).resolves.toMatchObject({
          status: "blocked",
          failure_code: "duplicate_asset",
        })

        const corruptBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7])
        const corrupt = await upload(job.id, headers, corruptBytes, "corrupt.jpg", "image/jpeg")
        await expect(waitForAsset(options, corrupt.assetId, ["blocked"])).resolves.toMatchObject({
          status: "blocked",
          failure_code: "photo_image_decode_failed",
        })
      })

      it("creates an immutable version, acknowledges quality policy, and returns a server quote", async () => {
        const { job, headers } = await createJob()
        const source = await generatedImage("jpeg")
        const uploaded = await upload(job.id, headers, source, "quote-source.jpg", "image/jpeg")
        const asset = await waitForAsset(options, uploaded.assetId, ["ready"])
        const service: any = options.getContainer().resolve(PHOTO_PRODUCTION_MODULE)
        const currentJob = await service.retrievePhotoJob(job.id)
        const versionResponse = await options.api.post(`/store/photo-jobs/${job.id}/versions`, {
          expectedRevision: currentJob.revision,
          defaults: {
            finish: "glossy",
            border: "none",
            cropMode: "fill",
            crop: { x: 0, y: 0, width: 1, height: 1 },
            quantity: 2,
          },
          overrides: [{
            assetId: asset.id,
            finish: "matte",
            cropMode: "fit",
            quantity: 3,
          }],
          warningAcknowledgements: [{ assetId: asset.id, code: "quality_caution" }],
        }, { headers: { ...headers, "Idempotency-Key": randomUUID() } })
        const version = record(versionResponse.data.version)
        expect(version.id).toBeTruthy()

        const quoteResponse = await options.api.post(`/store/photo-jobs/${job.id}/quote`, {
          versionId: version.id,
          fulfillment: { type: "delivery" },
        }, { headers })
        const quote = record(quoteResponse.data.quote)
        expect(quote).toMatchObject({ currencyCode: "hkd" })
        expect(quote.subtotal).toBeGreaterThan(0)
        expect(quote.manifestDigest).toEqual(expect.any(String))
      })

      it("freezes a mixed retail and photo order and exposes audited production access", async () => {
        const { job, headers } = await createJob()
        const source = await generatedImage("jpeg")
        const uploaded = await upload(job.id, headers, source, "mixed-order.jpg", "image/jpeg")
        const asset = await waitForAsset(options, uploaded.assetId, ["ready"])
        const service: any = options.getContainer().resolve(PHOTO_PRODUCTION_MODULE)
        const currentJob = await service.retrievePhotoJob(job.id)
        const versionResponse = await options.api.post(`/store/photo-jobs/${job.id}/versions`, {
          expectedRevision: currentJob.revision,
          defaults: {
            finish: "glossy",
            border: "none",
            cropMode: "fill",
            crop: { x: 0, y: 0, width: 1, height: 1 },
            quantity: 1,
          },
          overrides: [],
          warningAcknowledgements: [{ assetId: asset.id, code: "quality_caution" }],
        }, { headers: { ...headers, "Idempotency-Key": randomUUID() } })
        const version = record(versionResponse.data.version)
        const deliveryQuoteResponse = await options.api.post(`/store/photo-jobs/${job.id}/quote`, {
          versionId: version.id,
          fulfillment: { type: "delivery" },
        }, { headers })
        const deliveryQuote = record(deliveryQuoteResponse.data.quote)

        const regions = await options.api.get("/store/regions")
        const region = regions.data.regions.find((candidate: Record<string, any>) => candidate.currency_code === "hkd")
        expect(region?.id).toBeTruthy()
        const cartResponse = await options.api.post("/store/carts", { region_id: region.id })
        const cartId = String(record(cartResponse.data.cart).id)
        const products = await options.api.get("/store/products", {
          params: { handle: "instax-mini-film-pack", fields: "id,handle,*variants" },
        })
        const product = record(products.data.products?.[0])
        const retailVariant = (Array.isArray(product.variants) ? product.variants : [])
          .map(record)
          .find((candidate) => candidate.manage_inventory === true)
        if (!retailVariant?.id) throw new Error("seed_retail_variant_missing")
        const retailVariantId = String(retailVariant.id)
        await options.api.post(`/store/carts/${cartId}/line-items`, {
          variant_id: retailVariantId,
          quantity: 1,
        })

        const branchesResponse = await options.api.get("/store/branches", { params: { cart_id: cartId } })
        const branch = branchesResponse.data.branches.find((candidate: Record<string, any>) => candidate.compatible === true)
        expect(branch?.id).toBeTruthy()
        await expect(options.api.post(`/store/photo-jobs/${job.id}/quote`, {
          versionId: version.id,
          fulfillment: { type: "pickup", branchId: branch.id },
        }, { headers })).resolves.toMatchObject({ data: { quote: { versionId: version.id } } })
        await expect(options.api.post(`/store/photo-jobs/${job.id}/quote`, {
          versionId: version.id,
          fulfillment: { type: "pickup", branchId: "brcap_missing" },
        }, { headers })).rejects.toMatchObject({
          response: { status: 400, data: expect.objectContaining({ message: "photo_capability_unavailable" }) },
        })

        const attachedResponse = await options.api.post(`/store/photo-jobs/${job.id}/cart`, { cartId }, { headers })
        const attachedCart = record(attachedResponse.data.cart)
        const attachedItems = Array.isArray(attachedCart.items) ? attachedCart.items.map(record) : []
        expect(attachedItems.some((line) => line.variant_id === retailVariantId)).toBe(true)
        expect(attachedItems.some((line) => record(line.metadata).photo_job_version_id === version.id
          && record(line.metadata).photo_manifest_digest === deliveryQuote.manifestDigest)).toBe(true)

        await options.api.post(`/store/carts/${cartId}`, {
          email: `phase-2b-${Date.now()}@fotomax.test`,
          shipping_address: {
            first_name: "Fotomax",
            last_name: "Production",
            address_1: "Synthetic delivery address",
            city: "Hong Kong",
            postal_code: "000000",
            country_code: "hk",
          },
        })
        const shippingResponse = await options.api.get("/store/shipping-options", {
          params: { cart_id: cartId, fields: "id,name,amount,data,metadata,type,insufficient_inventory,service_zone.*" },
        })
        const deliveryOption = shippingResponse.data.shipping_options.find(
          (candidate: Record<string, any>) => record(candidate.data).fulfillment_kind === "delivery"
            || record(candidate.metadata).fulfillment_kind === "delivery",
        )
        expect(deliveryOption?.id).toBeTruthy()
        await options.api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: deliveryOption.id })
        const paymentCollectionResponse = await options.api.post("/store/payment-collections", { cart_id: cartId })
        const paymentCollection = record(paymentCollectionResponse.data.payment_collection)
        await options.api.post(`/store/payment-collections/${paymentCollection.id}/payment-sessions`, {
          provider_id: "pp_system_default",
        })
        const branchService: any = options.getContainer().resolve(BRANCH_CAPABILITY_MODULE)
        const selectedBranch = await branchService.retrieveBranchCapability(branch.id)
        await branchService.updateBranchCapabilities({
          selector: { id: branch.id },
          data: { supported_print_skus: [] },
        })
        await options.api.post(`/store/carts/${cartId}/shipping-methods`, {
          option_id: branch.shippingOptionId,
        })
        await options.api.post(`/store/payment-collections/${paymentCollection.id}/payment-sessions`, {
          provider_id: "pp_system_default",
        })
        try {
          await expect(options.api.post(`/store/carts/${cartId}/complete`)).rejects.toMatchObject({
            response: { data: expect.objectContaining({ message: "photo_capability_unavailable" }) },
          })
        } finally {
          await branchService.updateBranchCapabilities({
            selector: { id: branch.id },
            data: { supported_print_skus: selectedBranch.supported_print_skus },
          })
          await options.api.post(`/store/carts/${cartId}/shipping-methods`, {
            option_id: deliveryOption.id,
          })
          await options.api.post(`/store/payment-collections/${paymentCollection.id}/payment-sessions`, {
            provider_id: "pp_system_default",
          })
        }

        const completions = await Promise.allSettled([
          options.api.post(`/store/carts/${cartId}/complete`),
          options.api.post(`/store/carts/${cartId}/complete`),
        ])
        const completedOrders = completions.flatMap((attempt) => {
          if (attempt.status !== "fulfilled" || attempt.value.data.type !== "order") return []
          return [record(attempt.value.data.order)]
        })
        expect(completedOrders.length).toBeGreaterThan(0)
        const orderIds = [...new Set(completedOrders.map((order) => String(order.id)))]
        expect(orderIds).toHaveLength(1)
        const orderId = orderIds[0]
        const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const orderQuery = await query.graph({
          entity: "order",
          fields: ["id", "items.id", "items.metadata"],
          filters: { id: orderId },
        })
        expect(orderQuery.data).toHaveLength(1)
        const persistedOrder = record(orderQuery.data[0])
        expect(persistedOrder.id).toBe(orderId)
        const orderItems = Array.isArray(persistedOrder.items) ? persistedOrder.items.map(record) : []
        expect(orderItems.some((line) => record(line.metadata).photo_job_version_id === version.id
          && record(line.metadata).photo_manifest_digest === deliveryQuote.manifestDigest)).toBe(true)

        const frozenVersion = await service.retrievePhotoJobVersion(version.id)
        const orderedJob = await service.retrievePhotoJob(job.id)
        expect(frozenVersion.order_id).toBe(orderId)
        expect(orderedJob.status).toBe("ordered")

        let manifestPayload: any
        await getAdminManifest({
          params: { id: job.id },
          auth_context: { actor_id: "admin_phase_2b", actor_type: "admin" },
          scope: options.getContainer(),
        } as any, {
          json(value: unknown) { manifestPayload = value },
          status(code: number) { throw new Error(`unexpected_manifest_status:${code}`) },
        } as any)
        expect(record(manifestPayload.manifest)).toMatchObject({
          jobId: job.id,
          versionId: version.id,
          orderId,
          manifestDigest: deliveryQuote.manifestDigest,
        })
        expect(JSON.stringify(manifestPayload)).not.toMatch(/object_key|preview_key/i)

        let accessPayload: any
        let cacheControl = ""
        await requestAdminAssetAccess({
          params: { id: job.id, assetId: asset.id },
          body: { reason: "production" },
          headers: { "x-request-id": "phase-2b-production-access" },
          auth_context: { actor_id: "admin_phase_2b", actor_type: "admin" },
          scope: options.getContainer(),
        } as any, {
          setHeader(name: string, value: string) { if (name === "Cache-Control") cacheControl = value },
          json(value: unknown) { accessPayload = value },
          status(code: number) { throw new Error(`unexpected_access_status:${code}`) },
        } as any)
        expect(cacheControl).toBe("no-store")
        expect(record(accessPayload.access).url).toMatch(/^http:\/\/localhost:9002\//)
        const audits = await service.listPhotoAssetAccessAudits({ asset_id: asset.id })
        expect(audits).toEqual(expect.arrayContaining([
          expect.objectContaining({
            actor_id: "admin_phase_2b",
            reason: "production",
            request_id: "phase-2b-production-access",
          }),
        ]))
      })

      it("deletes accelerated-retention media once and leaves private objects absent", async () => {
        const { job, headers } = await createJob()
        const source = await generatedImage("jpeg")
        const uploaded = await upload(job.id, headers, source, "retention.jpg", "image/jpeg")
        const ready = await waitForAsset(options, uploaded.assetId, ["ready"])
        const service: any = options.getContainer().resolve(PHOTO_PRODUCTION_MODULE)
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const originalKey = String(ready.object_key)
        const previewKey = String(ready.preview_key)
        await expect(storage.headPrivateObject(originalKey)).resolves.toBeTruthy()
        await expect(storage.readPrivateObjectPrefix(previewKey, 1)).resolves.toHaveLength(1)

        const now = new Date()
        await service.updatePhotoJobs({
          selector: { id: job.id },
          data: {
            retention_class: "accelerated_test",
            last_activity_at: new Date(now.getTime() - 16 * 60 * 1000),
          },
        })
        const dependencies = {
          service,
          storage,
          locking: options.getContainer().resolve(Modules.LOCKING) as any,
          eventBus: options.getContainer().resolve(Modules.EVENT_BUS) as any,
          logger: options.getContainer().resolve(ContainerRegistrationKeys.LOGGER) as any,
          now,
          batchSize: 50,
        }
        await expect(runPhotoRetention(dependencies)).resolves.toMatchObject({
          expiredJobs: 1,
          deletedAssets: 1,
          failures: 0,
        })
        await expect(storage.headPrivateObject(originalKey)).rejects.toThrow("photo_storage_not_found")
        await expect(storage.headPrivateObject(previewKey)).rejects.toThrow("photo_storage_not_found")
        await expect(service.retrievePhotoJob(job.id)).resolves.toMatchObject({ status: "expired" })
        await expect(service.retrievePhotoAsset(ready.id)).resolves.toMatchObject({
          status: "deleted",
          object_key: null,
          preview_key: null,
        })
        await expect(runPhotoRetention(dependencies)).resolves.toEqual({
          expiredJobs: 0,
          deletedAssets: 0,
          failures: 0,
        })
      })
      it("normalizes the HEIC worker branch through the bounded converter", async () => {
        const jpeg = await generatedImage("jpeg")
        const heic = Buffer.from("00000018667479706865696300000000", "hex")
        const converted = await processImage({
          filename: "generated.heic",
          reportedMime: "image/heic",
          detectedMime: "image/heic",
          bytes: heic.length,
          source: Readable.from(heic),
          readOriginal: async () => heic,
          convertHeic: async ({ buffer, format }) => {
            expect(buffer).toEqual(heic)
            expect(format).toBe("JPEG")
            return jpeg
          },
        })
        expect(converted).toMatchObject({ width: 1200, height: 1800, qualityBand: "good" })
        expect(converted.preview.length).toBeGreaterThan(0)
      })
    })
  },
})
