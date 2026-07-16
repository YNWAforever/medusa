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

  it.each(Object.keys(secrets) as Array<keyof RuntimeSecrets>)(
    "rejects a blank %s without exposing its value",
    (name) => {
      expect(() =>
        buildContainerEnv({ ...secrets, [name]: "   " }),
      ).toThrow(`Missing Cloudflare secret: ${name}`)
    },
  )
})
