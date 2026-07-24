import path from "node:path"
import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner, type MedusaSuiteOptions } from "@medusajs/test-utils"
import sharp from "sharp"

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

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {}
}

function crc32c(bytes: Buffer): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
  }
  const output = Buffer.alloc(4)
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return output.toString("base64")
}

async function publishableKey(options: MedusaSuiteOptions): Promise<string> {
  const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY)
  const response = await query.graph({ entity: "api_key", fields: ["token"], filters: { title: "Fotomax Storefront Staging" } })
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
      const headers = { "x-publishable-api-key": key, "x-fotomax-guest-token": guest }
      const response = await options.api.post("/store/photo-jobs", { locale: "en" }, { headers })
      return { job: record(response.data.photo_job), headers }
    }

    describe("photo production security boundaries", () => {
      it("rejects an upload part after its presigned URL expires", async () => {
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const bytes = Buffer.from("expired-signature")
        const checksumCRC32C = crc32c(bytes)
        const key = `photo-jobs/${randomUUID()}/originals/${randomUUID()}`
        const { uploadId } = await storage.startMultipartUpload({
          key,
          contentType: "image/jpeg",
        })

        try {
          const signed = await storage.signUploadPart({
            key,
            uploadId,
            partNumber: 1,
            checksumCRC32C,
            expiresIn: 1,
          })
          await new Promise((resolve) => setTimeout(resolve, 2_100))
          const response = await fetch(signed.url, {
            method: "PUT",
            headers: signed.requiredHeaders,
            body: bytes as any,
          })
          expect(response.status).toBe(403)
        } finally {
          await storage.abortMultipartUpload({ key, uploadId })
        }
      })
      it("rejects cross-origin photo mutations before creating a job", async () => {
        const headers = {
          "x-publishable-api-key": key,
          "x-fotomax-guest-token": randomBytes(32).toString("base64url"),
          Origin: "https://evil.example",
        }
        await expect(options.api.post("/store/photo-jobs", { locale: "en" }, { headers })).rejects.toMatchObject({
          response: { status: 403, data: expect.objectContaining({ message: "photo_origin_forbidden" }) },
        })
      })
      it("conceals jobs cross-owner and rejects client-controlled prices and oversized files", async () => {
        const { job, headers } = await createJob()
        const otherHeaders = { ...headers, "x-fotomax-guest-token": randomBytes(32).toString("base64url") }
        await expect(options.api.get(`/store/photo-jobs/${job.id}`, { headers: otherHeaders })).rejects.toMatchObject({ response: { status: 404 } })

        await expect(options.api.post(`/store/photo-jobs/${job.id}/versions`, {
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
        }, { headers: { ...headers, "Idempotency-Key": randomUUID() } })).rejects.toMatchObject({
          response: { status: 400, data: expect.objectContaining({ message: "photo_client_price_forbidden" }) },
        })

        const signature = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")
        await expect(options.api.post(`/store/photo-jobs/${job.id}/uploads`, {
          filename: "oversized.jpg",
          reportedMime: "image/jpeg",
          bytes: 50 * 1024 * 1024 + 1,
          sourceIdempotencyKey: randomUUID(),
          signatureBase64: signature,
        }, { headers })).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("keeps private media unsigned and makes upload completion replay-safe", async () => {
        const { job, headers } = await createJob()
        const bytes = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: "#307d70" } }).jpeg().toBuffer()
        const checksumCRC32C = crc32c(bytes)
        const started = await options.api.post(`/store/photo-jobs/${job.id}/uploads`, {
          filename: "replay.jpg",
          reportedMime: "image/jpeg",
          bytes: bytes.length,
          sourceIdempotencyKey: randomUUID(),
          signatureBase64: bytes.subarray(0, 64).toString("base64"),
        }, { headers })
        const upload = record(started.data.upload)
        const signed = await options.api.post(`/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/parts`, {
          partNumber: 1,
          checksumCRC32C,
        }, { headers })
        const part = record(signed.data.part)

        const unsigned = new URL(part.url)
        unsigned.search = ""
        await expect(fetch(unsigned)).resolves.toMatchObject({ status: 403 })

        const put = await fetch(part.url, { method: "PUT", headers: part.requiredHeaders, body: bytes as any })
        expect(put.status).toBe(200)
        const payload = { parts: [{ partNumber: 1, etag: put.headers.get("etag"), checksumCRC32C }] }
        const first = await options.api.post(`/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`, payload, { headers })
        const replay = await options.api.post(`/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`, payload, { headers })
        expect(record(replay.data.asset).id).toBe(record(first.data.asset).id)
      })
    })
  },
})
