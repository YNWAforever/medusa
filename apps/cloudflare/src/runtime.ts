const coreSecretNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
] as const

const photoStorageProviderName = "PHOTO_STORAGE_PROVIDER" as const

const providerSecretNames = {
  s3: [
    "PHOTO_STORAGE_ENDPOINT",
    "PHOTO_STORAGE_REGION",
    "PHOTO_STORAGE_BUCKET",
    "PHOTO_STORAGE_ACCESS_KEY",
    "PHOTO_STORAGE_SECRET_KEY",
    "PHOTO_STORAGE_FORCE_PATH_STYLE",
    "PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION",
  ],
  "vercel-blob": ["BLOB_READ_WRITE_TOKEN"],
} as const

const optionalEnvironmentNames = [
  "PHOTO_RETENTION_TEST_MODE",
  "MEDUSA_CLOUD_ENVIRONMENT_TYPE",
  "MEDUSA_CLOUD_ENVIRONMENT_NAME",
] as const

type CoreSecretName = (typeof coreSecretNames)[number]
type PhotoStorageProviderName = typeof photoStorageProviderName
type S3SecretName = (typeof providerSecretNames.s3)[number]
type VercelBlobSecretName = (typeof providerSecretNames)["vercel-blob"][number]
type SecretName =
  | CoreSecretName
  | PhotoStorageProviderName
  | S3SecretName
  | VercelBlobSecretName
type OptionalEnvironmentName = (typeof optionalEnvironmentNames)[number]

export type RuntimeSecrets = Partial<
  Record<SecretName | OptionalEnvironmentName, string>
>

function requireSecret(source: RuntimeSecrets, name: SecretName): string {
  const value = source[name]?.trim()

  if (!value) {
    throw new Error(`Missing Cloudflare secret: ${name}`)
  }

  return value
}

/**
 * Secrets the Worker itself consumes. Deliberately kept out of the container
 * secret names so the admin gate secret is never handed to Medusa as an env var.
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
  const coreSecrets = Object.fromEntries(
    coreSecretNames.map((name) => [name, requireSecret(source, name)]),
  )
  const provider = requireSecret(source, photoStorageProviderName)

  if (provider !== "s3" && provider !== "vercel-blob") {
    throw new Error("Invalid Cloudflare secret: PHOTO_STORAGE_PROVIDER")
  }

  const providerSecrets = Object.fromEntries(
    providerSecretNames[provider].map((name) => [
      name,
      requireSecret(source, name),
    ]),
  )
  const optionalEnvironment = Object.fromEntries(
    optionalEnvironmentNames.flatMap((name) => {
      const value = source[name]?.trim()
      return value ? [[name, value]] : []
    }),
  )

  return {
    ...coreSecrets,
    PHOTO_STORAGE_PROVIDER: provider,
    ...providerSecrets,
    ...optionalEnvironment,
    NODE_ENV: "production",
    PORT: "9000",
    MEDUSA_WORKER_MODE: "shared",
    DISABLE_MEDUSA_ADMIN: resolveAdminFlag(source.DISABLE_MEDUSA_ADMIN),
  }
}
