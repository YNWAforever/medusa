import { randomBytes } from "node:crypto"
import path from "node:path"

import { beforeAll, describe, expect, it } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  medusaIntegrationTestRunner,
  type MedusaSuiteOptions,
} from "@medusajs/test-utils"

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
  moduleName: "fotomax-photo-upload",
  cwd: appRoot,
  env,
  testSuite: (options) => {
    let key: string

    beforeAll(async () => {
      await seedFotomax({ container: options.getContainer() } as ExecArgs)
      key = await publishableKey(options)
    })

    describe("private photo upload journey", () => {
      it("uploads by signed PUT, completes with its ETag, and conceals it cross-owner", async () => {
        const guest = randomBytes(32).toString("base64url")
        const headers = {
          "x-publishable-api-key": key,
          "x-fotomax-guest-token": guest,
        }
        const created = await options.api.post(
          "/store/photo-jobs",
          { locale: "en" },
          { headers },
        )
        const job = record(created.data.photo_job)
        const bytes = Buffer.from([
          0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7,
        ])
        const started = await options.api.post(
          `/store/photo-jobs/${job.id}/uploads`,
          {
            filename: "journey.jpg",
            reportedMime: "image/jpeg",
            bytes: bytes.length,
            sourceIdempotencyKey: "integration-journey",
            signatureBase64: bytes.toString("base64"),
          },
          { headers },
        )
        const upload = record(started.data.upload)
        expect(upload).toMatchObject({
          strategy: "single-put",
          uploadUrl: expect.any(String),
          requiredHeaders: { "content-type": "image/jpeg" },
        })
        expect(upload).not.toHaveProperty("partSize")

        const unsigned = new URL(String(upload.uploadUrl))
        unsigned.search = ""
        await expect(fetch(unsigned)).resolves.toMatchObject({ status: 403 })

        const put = await fetch(String(upload.uploadUrl), {
          method: "PUT",
          headers: record(upload.requiredHeaders) as Record<string, string>,
          body: bytes,
        })
        expect(put.status).toBe(200)
        const etag = put.headers.get("etag")
        expect(etag).toEqual(expect.any(String))
        const completed = await options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          { etag },
          { headers },
        )
        const replay = await options.api.post(
          `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
          { etag },
          { headers },
        )
        const completedAsset = record(completed.data.asset)
        expect(record(replay.data.asset).id).toBe(completedAsset.id)

        const production: any = options.getContainer().resolve(
          PHOTO_PRODUCTION_MODULE,
        )
        const storage: any = options.getContainer().resolve(PHOTO_STORAGE_MODULE)
        const asset = await production.retrievePhotoAsset(completedAsset.id)
        const session = await production.retrievePhotoUploadSession(
          upload.sessionId,
        )
        expect(asset).toMatchObject({
          stored_bytes: bytes.length,
          provider_etag: etag,
        })
        const ref = {
          provider: asset.storage_provider,
          key: asset.object_key,
        }
        await expect(storage.inspect(ref)).resolves.toEqual({
          bytes: bytes.length,
          contentType: "image/jpeg",
          etag,
        })
        await expect(storage.readPrefix(ref, 8)).resolves.toEqual(
          Uint8Array.from(bytes.subarray(0, 8)),
        )
        expect(session).toMatchObject({
          storage_provider: "s3",
          upload_strategy: "single-put",
          completion_metadata: { etag },
        })
        const assets = await production.listPhotoAssets({ job_id: job.id })
        expect(assets.filter((candidate: any) => candidate.id === asset.id))
          .toHaveLength(1)

        await expect(
          options.api.get(`/store/photo-jobs/${job.id}`, { headers }),
        ).resolves.toMatchObject({ status: 200 })
        const other = {
          ...headers,
          "x-fotomax-guest-token": randomBytes(32).toString("base64url"),
        }
        await expect(
          options.api.get(`/store/photo-jobs/${job.id}`, { headers: other }),
        ).rejects.toMatchObject({ response: { status: 404 } })
      })
    })
  },
})
