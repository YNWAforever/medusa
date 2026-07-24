import path from "node:path"
import { randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner, type MedusaSuiteOptions } from "@medusajs/test-utils"
import seedFotomax from "../../src/scripts/seed"

const appRoot = path.resolve(__dirname, "../..")
const env = { NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL ?? "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax", REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379", DB_HOST: "localhost", DB_PORT: "5432", DB_USERNAME: "fotomax", DB_PASSWORD: "fotomax_local_only", MEDUSA_WORKER_MODE: "shared", STORE_CORS: "http://localhost:3100", ADMIN_CORS: "http://localhost:9000", AUTH_CORS: "http://localhost:3100", JWT_SECRET: "fotomax-local-jwt-secret", COOKIE_SECRET: "fotomax-local-cookie-secret", PHOTO_STORAGE_ENDPOINT: process.env.PHOTO_STORAGE_ENDPOINT ?? "http://localhost:9002", PHOTO_STORAGE_REGION: "us-east-1", PHOTO_STORAGE_BUCKET: "fotomax-photo-private", PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio", PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only", PHOTO_STORAGE_FORCE_PATH_STYLE: "true", PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false" }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" ? value as Record<string, any> : {} }
function crc32c(bytes: Uint8Array): string {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
    }
  }
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return checksum.toString("base64")
}
async function publishableKey(options: MedusaSuiteOptions) { const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY); const response = await query.graph({ entity: "api_key", fields: ["token"], filters: { title: "Fotomax Storefront Staging" } }); return record(response.data[0]).token as string }

medusaIntegrationTestRunner({ moduleName: "fotomax-photo-upload", cwd: appRoot, env, testSuite: (options) => {
  let key: string
  beforeAll(async () => { await seedFotomax({ container: options.getContainer() } as ExecArgs); key = await publishableKey(options) })
  describe("private photo upload journey", () => {
    it("creates a guest job, uploads privately, reloads, and conceals it cross-owner", async () => {
      const guest = randomBytes(32).toString("base64url"); const headers = { "x-publishable-api-key": key, "x-fotomax-guest-token": guest }
      const created = await options.api.post("/store/photo-jobs", { locale: "en" }, { headers }); const job = record(created.data.photo_job)
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7])
      const checksumCRC32C = crc32c(bytes)
      const started = await options.api.post(`/store/photo-jobs/${job.id}/uploads`, { filename: "journey.jpg", reportedMime: "image/jpeg", bytes: bytes.length, sourceIdempotencyKey: "integration-journey", signatureBase64: bytes.toString("base64") }, { headers }); const upload = record(started.data.upload)
      const signed = await options.api.post(`/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/parts`, { partNumber: 1, checksumCRC32C }, { headers }); const part = record(signed.data.part)
      const put = await fetch(part.url, { method: "PUT", headers: part.requiredHeaders, body: bytes }); expect(put.ok).toBe(true); const etag = put.headers.get("etag"); expect(etag).toBeTruthy()
      await options.api.post(`/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`, { parts: [{ partNumber: 1, etag, checksumCRC32C }] }, { headers })
      await expect(options.api.get(`/store/photo-jobs/${job.id}`, { headers })).resolves.toMatchObject({ status: 200 })
      const other = { ...headers, "x-fotomax-guest-token": randomBytes(32).toString("base64url") }; await expect(options.api.get(`/store/photo-jobs/${job.id}`, { headers: other })).rejects.toMatchObject({ response: { status: 404 } })
    })
  })
} })
