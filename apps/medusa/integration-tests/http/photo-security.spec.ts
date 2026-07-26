import { randomBytes, randomUUID } from "node:crypto"
import path from "node:path"

import { beforeAll, describe, expect, it, jest } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  medusaIntegrationTestRunner,
  type MedusaSuiteOptions,
} from "@medusajs/test-utils"
import sharp from "sharp"

import { PHOTO_PRODUCTION_MODULE } from "../../src/modules/photo-production"
import { PHOTO_STORAGE_MODULE } from "../../src/modules/photo-storage"
import seedFotomax from "../../src/scripts/seed"

const appRoot = path.resolve(__dirname, "../..")
const env = {
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.DATABASE_URL
    ?? "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
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
  PHOTO_STORAGE_PROVIDER: "s3",
  PHOTO_STORAGE_ENDPOINT:
    process.env.PHOTO_STORAGE_ENDPOINT ?? "http://localhost:9002",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
  PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? value as Record<string, any>
    : {}
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

medusaIntegrationTestRunner({
  moduleName: "fotomax-photo-security",
  cwd: appRoot,
  env,
  testSuite: (options) => {
    let key: string

    beforeAll(async () => {
      await seedFotomax({ container: options.getContainer() } as ExecArgs)
      key = await publishableKey(options)
    })

    async function createJob() {
      const guest = randomBytes(32).toString("base64url")
      const headers = {
        "x-publishable-api-key": key,
        "x-fotomax-guest-token": guest,
      }
      const response = await options.api.post(
        "/store/photo-jobs",
        { locale: "en" },
        { headers },
      )
      return { job: record(response.data.photo_job), headers }
    }

    async function startAndPut(input: {
      jobId: string
      headers: Record<string, string>
      bytes: Buffer
      signature?: Buffer
      sourceKey?: string
    }) {
      const started = await options.api.post(
        `/store/photo-jobs/${input.jobId}/uploads`,
        {
          filename: "security.jpg",
          reportedMime: "image/jpeg",
          bytes: input.bytes.length,
          sourceIdempotencyKey: input.sourceKey ?? randomUUID(),
          signatureBase64: (input.signature ?? input.bytes.subarray(0, 64))
            .toString("base64"),
        },
        { headers: input.headers },
      )
      const upload = record(started.data.upload)
      expect(upload).toMatchObject({
        strategy: "single-put",
        uploadUrl: expect.any(String),
        requiredHeaders: { "content-type": "image/jpeg" },
      })
      const put = await fetch(String(upload.uploadUrl), {
        method: "PUT",
        headers: record(upload.requiredHeaders) as Record<string, string>,
        body: input.bytes as any,
      })
      expect(put.status).toBe(200)
      const etag = put.headers.get("etag")
      expect(etag).toEqual(expect.any(String))
      return { upload, etag: etag as string }
    }

    describe("photo production security boundaries", () => {
      it("rejects a direct PUT after its signed URL expires", async () => {
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const bytes = Buffer.from("expired-signature")
        const ref = {
          provider: "s3" as const,
          key: `photo-jobs/${randomUUID()}/originals/${randomUUID()}`,
        }
        const grant = await storage.createDirectUpload({
          ...ref,
          contentType: "image/jpeg",
          maxBytes: bytes.length,
          expiresIn: 1,
        })

        try {
          await new Promise((resolve) => setTimeout(resolve, 2_100))
          const response = await fetch(grant.url, {
            method: "PUT",
            headers: grant.requiredHeaders,
            body: bytes,
          })
          expect(response.status).toBe(403)
        } finally {
          await storage.delete([ref])
        }
      })

      it("rejects cross-origin photo mutations before creating a job", async () => {
        const headers = {
          "x-publishable-api-key": key,
          "x-fotomax-guest-token": randomBytes(32).toString("base64url"),
          Origin: "https://evil.example",
        }
        await expect(
          options.api.post("/store/photo-jobs", { locale: "en" }, { headers }),
        ).rejects.toMatchObject({
          response: {
            status: 403,
            data: expect.objectContaining({ message: "photo_origin_forbidden" }),
          },
        })
      })

      it("conceals jobs and rejects client prices and oversized files", async () => {
        const { job, headers } = await createJob()
        const otherHeaders = {
          ...headers,
          "x-fotomax-guest-token": randomBytes(32).toString("base64url"),
        }
        await expect(
          options.api.get(`/store/photo-jobs/${job.id}`, {
            headers: otherHeaders,
          }),
        ).rejects.toMatchObject({ response: { status: 404 } })

        await expect(options.api.post(
          `/store/photo-jobs/${job.id}/versions`,
          {
            expectedRevision: job.revision,
            defaults: {
              finish: "glossy",
              border: "none",
              cropMode: "fill",
              crop: { x: 0, y: 0, width: 1, height: 1 },
              quantity: 1,
              unitPrice: 1,
            },
            overrides: [],
            warningAcknowledgements: [],
          },
          { headers: { ...headers, "Idempotency-Key": randomUUID() } },
        )).rejects.toMatchObject({
          response: {
            status: 400,
            data: expect.objectContaining({
              message: "photo_client_price_forbidden",
            }),
          },
        })

        const signature = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
          .toString("base64")
        await expect(options.api.post(
          `/store/photo-jobs/${job.id}/uploads`,
          {
            filename: "oversized.jpg",
            reportedMime: "image/jpeg",
            bytes: 50 * 1024 * 1024 + 1,
            sourceIdempotencyKey: randomUUID(),
            signatureBase64: signature,
          },
          { headers },
        )).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("keeps direct media private and completes replay exactly once", async () => {
        const { job, headers } = await createJob()
        const bytes = await sharp({
          create: {
            width: 1200,
            height: 1800,
            channels: 3,
            background: "#307d70",
          },
        }).jpeg().toBuffer()
        const { upload, etag } = await startAndPut({
          jobId: job.id,
          headers,
          bytes,
        })

        const unsigned = new URL(String(upload.uploadUrl))
        unsigned.search = ""
        await expect(fetch(unsigned)).resolves.toMatchObject({ status: 403 })

        const payload = { etag }
        const first = await options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          payload,
          { headers },
        )
        const replay = await options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          payload,
          { headers },
        )
        expect(record(replay.data.asset).id).toBe(record(first.data.asset).id)

        const production: any = options.getContainer().resolve(
          PHOTO_PRODUCTION_MODULE,
        )
        const assets = await production.listPhotoAssets({ job_id: job.id })
        expect(
          assets.filter((asset: any) => asset.id === record(first.data.asset).id),
        ).toHaveLength(1)
      })

      it("fails a forged completion ETag closed and deletes the object", async () => {
        const { job, headers } = await createJob()
        const bytes = await sharp({
          create: {
            width: 20,
            height: 20,
            channels: 3,
            background: "#214f49",
          },
        }).jpeg().toBuffer()
        const { upload } = await startAndPut({ jobId: job.id, headers, bytes })
        const production: any = options.getContainer().resolve(
          PHOTO_PRODUCTION_MODULE,
        )
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const asset = await production.retrievePhotoAsset(upload.assetId)
        const ref = { provider: asset.storage_provider, key: asset.object_key }

        await expect(options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          { etag: '"forged-etag"' },
          { headers },
        )).rejects.toMatchObject({ response: { status: 409 } })
        await expect(storage.inspect(ref)).rejects.toThrow(
          "photo_storage_not_found",
        )
        await expect(
          production.retrievePhotoUploadSession(upload.sessionId),
        ).resolves.toMatchObject({ status: "aborted" })
        await expect(
          production.retrievePhotoAsset(upload.assetId),
        ).resolves.toMatchObject({
          status: "failed",
          failure_code: "photo_upload_completion_mismatch",
        })
      })

      it("uses a bounded prefix to reject mismatched magic bytes", async () => {
        const { job, headers } = await createJob()
        const validSignature = Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7,
        ])
        const invalidBytes = Buffer.concat([
          Buffer.alloc(validSignature.length, 0x41),
          Buffer.alloc(1024 * 1024, 0x42),
        ])
        const { upload, etag } = await startAndPut({
          jobId: job.id,
          headers,
          bytes: invalidBytes,
          signature: validSignature,
        })
        const production: any = options.getContainer().resolve(
          PHOTO_PRODUCTION_MODULE,
        )
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const asset = await production.retrievePhotoAsset(upload.assetId)
        const ref = { provider: asset.storage_provider, key: asset.object_key }
        const prefixRead = jest.spyOn(storage, "readPrefix")

        await expect(options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          { etag },
          { headers },
        )).rejects.toMatchObject({ response: { status: 409 } })
        expect(prefixRead).toHaveBeenCalledWith(ref, 12)
        prefixRead.mockRestore()
        await expect(storage.inspect(ref)).rejects.toThrow(
          "photo_storage_not_found",
        )
        await expect(
          production.retrievePhotoUploadSession(upload.sessionId),
        ).resolves.toMatchObject({ status: "aborted" })
        await expect(
          production.retrievePhotoAsset(upload.assetId),
        ).resolves.toMatchObject({
          status: "failed",
          failure_code: "photo_upload_metadata_mismatch",
        })
      })

      it("fails a persisted provider mismatch before object access", async () => {
        const { job, headers } = await createJob()
        const bytes = await sharp({
          create: {
            width: 20,
            height: 20,
            channels: 3,
            background: "#355d56",
          },
        }).jpeg().toBuffer()
        const { upload, etag } = await startAndPut({
          jobId: job.id,
          headers,
          bytes,
        })
        const production: any = options.getContainer().resolve(
          PHOTO_PRODUCTION_MODULE,
        )
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const asset = await production.retrievePhotoAsset(upload.assetId)
        const ref = { provider: asset.storage_provider, key: asset.object_key }
        await production.updatePhotoUploadSessions({
          selector: { id: upload.sessionId },
          data: { storage_provider: "vercel-blob" },
        })

        try {
          await expect(options.api.post(
            `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
            { etag },
            { headers },
          )).rejects.toMatchObject({ response: { status: 409 } })
          await expect(storage.inspect(ref)).resolves.toMatchObject({
            bytes: bytes.length,
            contentType: "image/jpeg",
            etag,
          })
          await expect(
            production.retrievePhotoUploadSession(upload.sessionId),
          ).resolves.toMatchObject({
            status: "active",
            storage_provider: "vercel-blob",
          })
        } finally {
          await storage.delete([ref])
        }
      })
    })
  },
})
