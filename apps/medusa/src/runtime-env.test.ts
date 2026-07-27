import { describe, expect, it } from "vitest"

import { loadRuntimeEnv, resolveMedusaRuntimeEnv } from "./runtime-env"

const explicitRuntimeEnv = {
  NODE_ENV: "production",
  STORE_CORS: "https://shop.example.com",
  ADMIN_CORS: "https://admin.example.com",
  AUTH_CORS: "https://shop.example.com,https://admin.example.com",
  JWT_SECRET: "production-jwt-secret",
  COOKIE_SECRET: "production-cookie-secret",
}

const requiredVariables = [
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
] as const

describe("Medusa runtime environment", () => {
  it("uses the production-shaped local runtime defaults", () => {
    expect(loadRuntimeEnv({ NODE_ENV: "development" })).toMatchObject({
      workerMode: "shared",
      disableAdmin: false,
      redisUrl: "redis://localhost:6379",
      isMedusaCloud: false,
    })
  })

  it("parses explicit worker and admin deployment settings", () => {
    expect(
      loadRuntimeEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://db/fotomax",
        STORE_CORS: "https://staging.example.com",
        ADMIN_CORS: "https://api.example.com",
        AUTH_CORS: "https://staging.example.com",
        JWT_SECRET: "jwt-secret",
        COOKIE_SECRET: "cookie-secret",
        REDIS_URL: "redis://cache:6379",
        MEDUSA_WORKER_MODE: "worker",
        DISABLE_MEDUSA_ADMIN: "true",
      }),
    ).toMatchObject({ workerMode: "worker", disableAdmin: true })
  })

  it("rejects unsupported worker modes", () => {
    expect(() =>
      loadRuntimeEnv({
        ...explicitRuntimeEnv,
        DATABASE_URL: "postgres://db/fotomax",
        REDIS_URL: "redis://cache:6379",
        MEDUSA_WORKER_MODE: "scheduler",
      }),
    ).toThrow("MEDUSA_WORKER_MODE")
  })

  it.each(["preview", "staging", "production", "qa"])(
    "requires an explicit DISABLE_MEDUSA_ADMIN when NODE_ENV is %s",
    (nodeEnv) => {
      expect(() =>
        loadRuntimeEnv({
          ...explicitRuntimeEnv,
          NODE_ENV: nodeEnv,
          DATABASE_URL: "postgres://db/fotomax",
          REDIS_URL: "redis://cache:6379",
        }),
      ).toThrow("DISABLE_MEDUSA_ADMIN")
    },
  )

  it.each(["1", "yes", "off", "disabled"])(
    "rejects the unsupported DISABLE_MEDUSA_ADMIN value %s",
    (value) => {
      expect(() =>
        loadRuntimeEnv({
          ...explicitRuntimeEnv,
          DATABASE_URL: "postgres://db/fotomax",
          REDIS_URL: "redis://cache:6379",
          DISABLE_MEDUSA_ADMIN: value,
        }),
      ).toThrow("DISABLE_MEDUSA_ADMIN")
    },
  )

  it("accepts an explicit production opt-in to the admin dashboard", () => {
    expect(
      loadRuntimeEnv({
        ...explicitRuntimeEnv,
        DATABASE_URL: "postgres://db/fotomax",
        REDIS_URL: "redis://cache:6379",
        DISABLE_MEDUSA_ADMIN: " FALSE ",
      }),
    ).toMatchObject({ disableAdmin: false })
  })

  it.each([undefined, "development", "test"])(
    "uses local defaults when NODE_ENV is %s",
    (nodeEnv) => {
      expect(resolveMedusaRuntimeEnv({ NODE_ENV: nodeEnv })).toEqual({
        storeCors: "http://localhost:3000,http://localhost:8000",
        adminCors: "http://localhost:9000",
        authCors:
          "http://localhost:9000,http://localhost:3000,http://localhost:8000",
        jwtSecret: "fotomax-local-jwt-secret",
        cookieSecret: "fotomax-local-cookie-secret",
      })
    },
  )

  it.each(["preview", "staging", "production", "qa", ""])(
    "requires every explicit value when NODE_ENV is %s",
    (nodeEnv) => {
      for (const variable of requiredVariables) {
        expect(() =>
          resolveMedusaRuntimeEnv({
            ...explicitRuntimeEnv,
            NODE_ENV: nodeEnv,
            [variable]: " ",
          }),
        ).toThrow(variable)
      }
    },
  )

  it("returns trimmed explicit production values", () => {
    expect(
      resolveMedusaRuntimeEnv({
        ...explicitRuntimeEnv,
        STORE_CORS: ` ${explicitRuntimeEnv.STORE_CORS} `,
        JWT_SECRET: ` ${explicitRuntimeEnv.JWT_SECRET} `,
      }),
    ).toEqual({
      storeCors: explicitRuntimeEnv.STORE_CORS,
      adminCors: explicitRuntimeEnv.ADMIN_CORS,
      authCors: explicitRuntimeEnv.AUTH_CORS,
      jwtSecret: explicitRuntimeEnv.JWT_SECRET,
      cookieSecret: explicitRuntimeEnv.COOKIE_SECRET,
    })
  })
})
