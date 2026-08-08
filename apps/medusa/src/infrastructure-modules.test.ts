import { defineConfig } from "@medusajs/framework/utils"
import { describe, expect, it } from "vitest"

import { buildInfrastructureModules } from "./infrastructure-modules"
import { loadRuntimeEnv } from "./runtime-env"

const deployedEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://db/fotomax",
  STORE_CORS: "https://shop.example.com",
  ADMIN_CORS: "https://admin.example.com",
  AUTH_CORS: "https://shop.example.com,https://admin.example.com",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
  MEDUSA_STOREFRONT_URL: "https://shop.example.com",
  REDIS_URL: "redis://cache:6379",
} as const

describe("Medusa infrastructure modules", () => {
  it("uses Redis event bus, caching, locking, and workflow modules outside Cloud", () => {
    const modules = buildInfrastructureModules(loadRuntimeEnv(deployedEnv))

    expect(modules.map((module) => module.resolve)).toEqual([
      "@medusajs/medusa/event-bus-redis",
      "@medusajs/medusa/caching",
      "@medusajs/medusa/locking",
      "@medusajs/medusa/workflow-engine-redis",
    ])
    expect(modules).toEqual([
      expect.objectContaining({
        options: { redisUrl: "redis://cache:6379" },
      }),
      expect.objectContaining({
        options: {
          providers: [
            expect.objectContaining({
              id: "caching-redis",
              resolve: "@medusajs/medusa/caching-redis",
              is_default: true,
              options: { redisUrl: "redis://cache:6379" },
            }),
          ],
        },
      }),
      expect.objectContaining({
        options: {
          providers: [
            expect.objectContaining({
              id: "locking-redis",
              resolve: "@medusajs/medusa/locking-redis",
              is_default: true,
              options: { redisUrl: "redis://cache:6379" },
            }),
          ],
        },
      }),
      expect.objectContaining({
        options: { redis: { redisUrl: "redis://cache:6379" } },
      }),
    ])
  })

  it("builds module definitions accepted by Medusa defineConfig", () => {
    expect(() =>
      defineConfig({
        modules: buildInfrastructureModules(loadRuntimeEnv(deployedEnv)),
      }),
    ).not.toThrow()
  })

  it("leaves infrastructure modules to Medusa Cloud", () => {
    expect(
      buildInfrastructureModules(
        loadRuntimeEnv({
          ...deployedEnv,
          MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived",
        }),
      ),
    ).toEqual([])
  })

  it("requires Redis outside development", () => {
    expect(() =>
      buildInfrastructureModules(
        loadRuntimeEnv({
          ...deployedEnv,
          REDIS_URL: " ",
        }),
      ),
    ).toThrow("REDIS_URL")
  })
})
