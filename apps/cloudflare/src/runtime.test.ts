import { describe, expect, it } from "vitest"

import { buildContainerEnv, type RuntimeSecrets } from "./runtime"

const coreSecrets = {
  DATABASE_URL: "postgres://staging-db",
  REDIS_URL: "rediss://staging-redis",
  STORE_CORS: "https://staging.fotomax.example",
  ADMIN_CORS: "https://fotomax-medusa.example.workers.dev",
  AUTH_CORS:
    "https://staging.fotomax.example,https://fotomax-medusa.example.workers.dev",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
}

const s3ProviderSecrets = {
  PHOTO_STORAGE_ENDPOINT: "http://minio:9000",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
  PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
}

const s3Secrets = {
  ...coreSecrets,
  PHOTO_STORAGE_PROVIDER: "s3",
  ...s3ProviderSecrets,
}

const blobSecrets = {
  ...coreSecrets,
  PHOTO_STORAGE_PROVIDER: "vercel-blob",
  BLOB_READ_WRITE_TOKEN: "blob-token",
}

describe("buildContainerEnv", () => {
  it("forwards only the selected S3 provider settings", () => {
    expect(
      buildContainerEnv({
        ...s3Secrets,
        BLOB_READ_WRITE_TOKEN: "unused-blob-token",
      } as unknown as RuntimeSecrets),
    ).toEqual({
      ...s3Secrets,
      NODE_ENV: "production",
      PORT: "9000",
      MEDUSA_WORKER_MODE: "shared",
      DISABLE_MEDUSA_ADMIN: "false",
    })
  })

  it("forwards only the selected Vercel Blob provider setting", () => {
    expect(
      buildContainerEnv({
        ...blobSecrets,
        ...s3ProviderSecrets,
      } as unknown as RuntimeSecrets),
    ).toEqual({
      ...blobSecrets,
      NODE_ENV: "production",
      PORT: "9000",
      MEDUSA_WORKER_MODE: "shared",
      DISABLE_MEDUSA_ADMIN: "false",
    })
  })

  it("forwards guarded non-provider environment settings", () => {
    const photoRuntime = {
      ...blobSecrets,
      PHOTO_RETENTION_TEST_MODE: "true",
      MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived",
      MEDUSA_CLOUD_ENVIRONMENT_NAME: "fotomax-staging",
    } as unknown as RuntimeSecrets

    expect(buildContainerEnv(photoRuntime)).toMatchObject(photoRuntime)
  })

  it.each([...Object.keys(coreSecrets), "PHOTO_STORAGE_PROVIDER"])(
    "rejects a blank %s without exposing its value",
    (name) => {
      expect(() =>
        buildContainerEnv({
          ...blobSecrets,
          [name]: "   ",
        } as unknown as RuntimeSecrets),
      ).toThrow(`Missing Cloudflare secret: ${name}`)
    },
  )

  it.each(Object.keys(s3ProviderSecrets))(
    "names only the missing selected S3 setting %s",
    (name) => {
      expect(() =>
        buildContainerEnv({
          ...s3Secrets,
          BLOB_READ_WRITE_TOKEN: "unused-blob-token",
          [name]: "   ",
        } as unknown as RuntimeSecrets),
      ).toThrow(new Error(`Missing Cloudflare secret: ${name}`))
    },
  )

  it("names only the missing selected Vercel Blob token", () => {
    expect(() =>
      buildContainerEnv({
        ...blobSecrets,
        ...s3ProviderSecrets,
        BLOB_READ_WRITE_TOKEN: "   ",
      } as unknown as RuntimeSecrets),
    ).toThrow(new Error("Missing Cloudflare secret: BLOB_READ_WRITE_TOKEN"))
  })

  it("rejects an unknown provider without exposing its value", () => {
    const unknownProvider = "not-a-real-provider"

    expect(() =>
      buildContainerEnv({
        ...coreSecrets,
        PHOTO_STORAGE_PROVIDER: unknownProvider,
      } as unknown as RuntimeSecrets),
    ).toThrow(new Error("Invalid Cloudflare secret: PHOTO_STORAGE_PROVIDER"))

    try {
      buildContainerEnv({
        ...coreSecrets,
        PHOTO_STORAGE_PROVIDER: unknownProvider,
      } as unknown as RuntimeSecrets)
    } catch (error) {
      expect(String(error)).not.toContain(unknownProvider)
    }
  })
})
