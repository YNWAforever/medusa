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

  it("lets a binding disable the admin dashboard without a code change", () => {
    expect(
      buildContainerEnv({ ...secrets, DISABLE_MEDUSA_ADMIN: " TRUE " }),
    ).toMatchObject({ DISABLE_MEDUSA_ADMIN: "true" })
  })

  it.each(["1", "yes", "off"])(
    "rejects the unsupported DISABLE_MEDUSA_ADMIN value %s",
    (value) => {
      expect(() =>
        buildContainerEnv({ ...secrets, DISABLE_MEDUSA_ADMIN: value }),
      ).toThrow("DISABLE_MEDUSA_ADMIN")
    },
  )

  it("never forwards the worker's admin gate secret to the container", () => {
    const env = buildContainerEnv({
      ...secrets,
      ADMIN_GATE_SECRET: "must-not-reach-medusa",
    } as never)

    expect(Object.values(env)).not.toContain("must-not-reach-medusa")
    expect(env).not.toHaveProperty("ADMIN_GATE_SECRET")
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
