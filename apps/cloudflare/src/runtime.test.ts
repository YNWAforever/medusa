import { describe, expect, it } from "vitest"

import { buildContainerEnv, type RuntimeSecrets } from "./runtime"

const secrets: RuntimeSecrets = {
  DATABASE_URL: "postgres://staging-db",
  REDIS_URL: "rediss://staging-redis",
  STORE_CORS: "https://staging.fotomax.example",
  ADMIN_CORS: "https://fotomax-medusa.example.workers.dev",
  AUTH_CORS:
    "https://staging.fotomax.example,https://fotomax-medusa.example.workers.dev",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
  PHOTO_STORAGE_ENDPOINT: "https://s3.ap-east-1.amazonaws.com",
  PHOTO_STORAGE_REGION: "ap-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-staging",
  PHOTO_STORAGE_ACCESS_KEY: "access-key",
  PHOTO_STORAGE_SECRET_KEY: "secret-key",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "false",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "true",
}

describe("buildContainerEnv", () => {
  it("maps validated secrets and fixed Medusa settings", () => {
    expect(buildContainerEnv(secrets)).toEqual({
      ...secrets,
      NODE_ENV: "production",
      PORT: "9000",
      MEDUSA_WORKER_MODE: "shared",
      DISABLE_MEDUSA_ADMIN: "false",
    })
  })

  it("forwards private photo storage and guarded retention settings", () => {
    const photoRuntime = {
      ...secrets,
      PHOTO_RETENTION_TEST_MODE: "true",
      MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived",
      MEDUSA_CLOUD_ENVIRONMENT_NAME: "fotomax-staging",
    } as RuntimeSecrets

    expect(buildContainerEnv(photoRuntime)).toMatchObject(photoRuntime)
  })

  it.each(Object.keys(secrets) as Array<keyof RuntimeSecrets>)(
    "rejects a blank %s without exposing its value",
    (name) => {
      expect(() =>
        buildContainerEnv({ ...secrets, [name]: "   " }),
      ).toThrow(`Missing Cloudflare secret: ${name}`)
    },
  )
})
