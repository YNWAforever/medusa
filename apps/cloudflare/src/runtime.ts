const requiredSecretNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "PHOTO_STORAGE_ENDPOINT",
  "PHOTO_STORAGE_REGION",
  "PHOTO_STORAGE_BUCKET",
  "PHOTO_STORAGE_ACCESS_KEY",
  "PHOTO_STORAGE_SECRET_KEY",
  "PHOTO_STORAGE_FORCE_PATH_STYLE",
  "PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION",
] as const

const optionalEnvironmentNames = [
  "PHOTO_RETENTION_TEST_MODE",
  "MEDUSA_CLOUD_ENVIRONMENT_TYPE",
  "MEDUSA_CLOUD_ENVIRONMENT_NAME",
] as const

type SecretName = (typeof requiredSecretNames)[number]
type OptionalEnvironmentName = (typeof optionalEnvironmentNames)[number]

export type RuntimeSecrets = Record<SecretName, string> &
  Partial<Record<OptionalEnvironmentName, string>>

export function buildContainerEnv(source: RuntimeSecrets): Record<string, string> {
  const secrets = Object.fromEntries(
    requiredSecretNames.map((name) => {
      const value = source[name]?.trim()

      if (!value) {
        throw new Error(`Missing Cloudflare secret: ${name}`)
      }

      return [name, value]
    }),
  ) as Record<SecretName, string>
  const optionalEnvironment = Object.fromEntries(
    optionalEnvironmentNames.flatMap((name) => {
      const value = source[name]?.trim()
      return value ? [[name, value]] : []
    }),
  )

  return {
    ...secrets,
    ...optionalEnvironment,
    NODE_ENV: "production",
    PORT: "9000",
    MEDUSA_WORKER_MODE: "shared",
    DISABLE_MEDUSA_ADMIN: "false",
  }
}