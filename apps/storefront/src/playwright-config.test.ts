import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const ambientSecrets = {
  BLOB_READ_WRITE_TOKEN: "sentinel-blob-token",
  PHOTO_STORAGE_PROVIDER: "sentinel-provider",
  PHOTO_STORAGE_ENDPOINT: "https://sentinel-storage.invalid",
  PHOTO_STORAGE_REGION: "sentinel-region",
  PHOTO_STORAGE_BUCKET: "sentinel-bucket",
  PHOTO_STORAGE_ACCESS_KEY: "sentinel-storage-access",
  PHOTO_STORAGE_SECRET_KEY: "sentinel-storage-secret",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "sentinel-path-style",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "sentinel-encryption",
  DATABASE_URL: "postgres://sentinel:sentinel@sentinel.invalid/sentinel",
  REDIS_URL: "redis://sentinel.invalid:6379",
  DB_HOST: "sentinel-db-host",
  DB_PORT: "6543",
  DB_USERNAME: "sentinel-db-user",
  DB_PASSWORD: "sentinel-db-password",
  POSTGRES_PASSWORD: "sentinel-postgres-password",
  PGPASSWORD: "sentinel-pg-password",
  JWT_SECRET: "sentinel-jwt-secret",
  COOKIE_SECRET: "sentinel-cookie-secret",
  MINIO_ROOT_USER: "sentinel-minio-user",
  MINIO_ROOT_PASSWORD: "sentinel-minio-password",
  AWS_ACCESS_KEY_ID: "sentinel-aws-access",
  AWS_SECRET_ACCESS_KEY: "sentinel-aws-secret",
  AWS_SESSION_TOKEN: "sentinel-aws-session",
  VERCEL_OIDC_TOKEN: "sentinel-vercel-oidc",
} as const

type PlaywrightConfig = (typeof import("../playwright.config"))["default"]

// Both are asserted against fixed values below, and playwright.config.ts falls
// back to those only when the variable is unset. CI sets them, so they must be
// stubbed or the assertion measures the runner's environment instead of the
// config's isolation contract.
const stubbedStorefrontEnvironment = {
  MEDUSA_PUBLISHABLE_KEY: "pk_e2e_environment_boundary",
  STOREFRONT_SESSION_SECRET: "fotomax-local-session-secret",
} as const

const originalEnvironment = new Map(
  [
    ...Object.keys(ambientSecrets),
    ...Object.keys(stubbedStorefrontEnvironment),
  ].map((key) => [key, process.env[key]]),
)

let playwrightConfig: PlaywrightConfig

describe("Playwright server ownership", () => {
  beforeAll(async () => {
    Object.assign(process.env, ambientSecrets, stubbedStorefrontEnvironment)
    vi.resetModules()
    playwrightConfig = (await import("../playwright.config")).default
  })

  afterAll(() => {
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("starts and owns fresh Medusa and storefront servers by default", () => {
    const servers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : playwrightConfig.webServer ? [playwrightConfig.webServer] : []
    const medusa = servers.find((server) => server.name === "Medusa")
    const storefront = servers.find((server) => server.name === "Storefront")

    expect(servers).toHaveLength(2)
    expect(medusa?.reuseExistingServer).toBe(false)
    expect(medusa?.command).toContain("dev --workspace @fotomax/medusa")
    expect(medusa?.env?.PHOTO_STORAGE_PROVIDER).toBe("s3")
    expect(storefront?.reuseExistingServer).toBe(false)
    expect(storefront?.command).toContain("next dev")
  })

  it("isolates backend secrets from the storefront child process", () => {
    const servers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : playwrightConfig.webServer ? [playwrightConfig.webServer] : []
    const medusa = servers.find((server) => server.name === "Medusa")
    const storefront = servers.find((server) => server.name === "Storefront")
    const medusaEnv = medusa?.env ?? {}
    const storefrontEnv = storefront?.env ?? {}

    expect(medusaEnv).toMatchObject({
      DATABASE_URL:
        "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "fotomax-local-jwt-secret",
      COOKIE_SECRET: "fotomax-local-cookie-secret",
      PHOTO_STORAGE_PROVIDER: "s3",
      PHOTO_STORAGE_ENDPOINT: "http://localhost:9002",
      PHOTO_STORAGE_REGION: "us-east-1",
      PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
      PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
      PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
    })
    expect(medusaEnv).not.toHaveProperty("BLOB_READ_WRITE_TOKEN")

    for (const [key, value] of Object.entries(ambientSecrets)) {
      expect(storefrontEnv, key).not.toHaveProperty(key)
      expect(Object.values(storefrontEnv), value).not.toContain(value)
    }

    for (const basicKey of ["PATH", "SYSTEMROOT"]) {
      const inheritedKey = Object.keys(process.env).find(
        (key) => key.toUpperCase() === basicKey,
      )
      if (inheritedKey) {
        expect(storefrontEnv[inheritedKey]).toBe(process.env[inheritedKey])
      }
    }
    expect(storefrontEnv).toMatchObject({
      MEDUSA_BACKEND_URL: "http://localhost:9000",
      MEDUSA_PUBLISHABLE_KEY: "pk_e2e_environment_boundary",
      STOREFRONT_SESSION_SECRET: "fotomax-local-session-secret",
    })
  })

  it("keeps every production application in the canonical root build gate", () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> }

    expect(rootPackage.scripts.build).toBe(
      "npm run build --workspace @fotomax/storefront && npm run build --workspace @fotomax/medusa && npm run build --workspace @fotomax/cloudflare",
    )
    expect(rootPackage.scripts.check).toBe(
      "npm run typecheck && npm run test && npm run build",
    )
  })
})