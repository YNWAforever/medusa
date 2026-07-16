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

export function buildContainerEnv(source: RuntimeSecrets): Record<string, string> {
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
    DISABLE_MEDUSA_ADMIN: "false",
  }
}
