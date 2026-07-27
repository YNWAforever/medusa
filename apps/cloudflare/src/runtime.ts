const secretNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
] as const

type SecretName = (typeof secretNames)[number]

export type RuntimeSecrets = Record<SecretName, string>

/**
 * Secrets the Worker itself consumes. Deliberately kept out of `secretNames` so
 * the admin gate secret is never handed to the Medusa container as an env var.
 */
export interface WorkerSecrets {
  ADMIN_GATE_SECRET?: string
}

/**
 * Container settings that are configuration rather than secrets, so they can be
 * changed with a binding instead of a code change and redeploy.
 */
export interface ContainerSettings {
  DISABLE_MEDUSA_ADMIN?: string
}

function resolveAdminFlag(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return "false"
  }

  if (normalized !== "true" && normalized !== "false") {
    throw new Error(`Invalid DISABLE_MEDUSA_ADMIN ${JSON.stringify(value)}`)
  }

  return normalized
}

export function buildContainerEnv(
  source: RuntimeSecrets & ContainerSettings,
): Record<string, string> {
  const secrets = Object.fromEntries(
    secretNames.map((name) => {
      const value = source[name]?.trim()

      if (!value) {
        throw new Error(`Missing Cloudflare secret: ${name}`)
      }

      return [name, value]
    }),
  ) as RuntimeSecrets

  return {
    ...secrets,
    NODE_ENV: "production",
    PORT: "9000",
    MEDUSA_WORKER_MODE: "shared",
    DISABLE_MEDUSA_ADMIN: resolveAdminFlag(source.DISABLE_MEDUSA_ADMIN),
  }
}
