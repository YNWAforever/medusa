import type { RuntimeEnv } from "./runtime-env"

export interface InfrastructureModule {
  resolve: string
  options: {
    redisUrl: string
  }
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
      resolve: "@medusajs/event-bus-redis",
      options: { redisUrl: env.redisUrl },
    },
    {
      resolve: "@medusajs/caching-redis",
      options: { redisUrl: env.redisUrl },
    },
    {
      resolve: "@medusajs/locking-redis",
      options: { redisUrl: env.redisUrl },
    },
    {
      resolve: "@medusajs/workflow-engine-redis",
      options: { redisUrl: env.redisUrl },
    },
  ]
}
