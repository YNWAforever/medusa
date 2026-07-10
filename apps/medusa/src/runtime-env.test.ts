import { describe, expect, it } from "vitest"

import { resolveMedusaRuntimeEnv } from "./runtime-env"

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
