import type { RuntimeEnv } from "./runtime-env"

interface RedisModuleProvider {
  id: string
  resolve: string
  is_default: true
  options: {
    redisUrl: string
  }
}

export interface InfrastructureModule {
  resolve: string
  options:
    | { redisUrl: string }
    | { redis: { redisUrl: string } }
    | { providers: RedisModuleProvider[] }
}

export function buildInfrastructureModules(
  env: RuntimeEnv,
): InfrastructureModule[] {
  if (env.isMedusaCloud) {
    return []
  }

  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required outside Medusa Cloud")
  }

  return [
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: env.redisUrl },
    },
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            id: "caching-redis",
            resolve: "@medusajs/medusa/caching-redis",
            is_default: true,
            options: { redisUrl: env.redisUrl },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            id: "locking-redis",
            resolve: "@medusajs/medusa/locking-redis",
            is_default: true,
            options: { redisUrl: env.redisUrl },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl: env.redisUrl } },
    },
  ]
}
