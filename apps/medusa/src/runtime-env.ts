export type MedusaWorkerMode = "shared" | "server" | "worker"

export interface RuntimeEnv {
  databaseUrl: string
  redisUrl?: string
  workerMode: MedusaWorkerMode
  disableAdmin: boolean
  isMedusaCloud: boolean
  storeCors: string
  adminCors: string
  authCors: string
  jwtSecret: string
  cookieSecret: string
}

export interface MedusaRuntimeEnvSource {
  NODE_ENV?: string
  DATABASE_URL?: string
  REDIS_URL?: string
  MEDUSA_WORKER_MODE?: string
  DISABLE_MEDUSA_ADMIN?: string
  MEDUSA_CLOUD_ENVIRONMENT_TYPE?: string
  STORE_CORS?: string
  ADMIN_CORS?: string
  AUTH_CORS?: string
  JWT_SECRET?: string
  COOKIE_SECRET?: string
}

export type MedusaRuntimeEnv = Pick<
  RuntimeEnv,
  "storeCors" | "adminCors" | "authCors" | "jwtSecret" | "cookieSecret"
>

const localDefaults: RuntimeEnv = {
  databaseUrl: "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
  redisUrl: "redis://localhost:6379",
  workerMode: "shared",
  disableAdmin: false,
  isMedusaCloud: false,
  storeCors: "http://localhost:3000,http://localhost:8000",
  adminCors: "http://localhost:9000",
  authCors:
    "http://localhost:9000,http://localhost:3000,http://localhost:8000",
  jwtSecret: "fotomax-local-jwt-secret",
  cookieSecret: "fotomax-local-cookie-secret",
}

function isLocalEnvironment(nodeEnv: string | undefined): boolean {
  return (
    nodeEnv === undefined || nodeEnv === "development" || nodeEnv === "test"
  )
}

function resolveRequiredValue(
  source: MedusaRuntimeEnvSource,
  variable: keyof MedusaRuntimeEnvSource,
  localDefault: string,
): string {
  const value = source[variable]?.trim()

  if (value) {
    return value
  }

  if (isLocalEnvironment(source.NODE_ENV)) {
    return localDefault
  }

  throw new Error(
    `Missing required environment variable ${variable} for NODE_ENV=${JSON.stringify(source.NODE_ENV)}`,
  )
}

export function loadRuntimeEnv(source: MedusaRuntimeEnvSource): RuntimeEnv {
  const isLocal = isLocalEnvironment(source.NODE_ENV)
  const requestedWorkerMode = source.MEDUSA_WORKER_MODE?.trim() || "shared"

  if (
    requestedWorkerMode !== "shared" &&
    requestedWorkerMode !== "server" &&
    requestedWorkerMode !== "worker"
  ) {
    throw new Error(
      `Invalid MEDUSA_WORKER_MODE ${JSON.stringify(requestedWorkerMode)}`,
    )
  }

  const redisUrl = source.REDIS_URL?.trim() || (isLocal ? localDefaults.redisUrl : undefined)

  return {
    databaseUrl: resolveRequiredValue(
      source,
      "DATABASE_URL",
      localDefaults.databaseUrl,
    ),
    redisUrl,
    workerMode: requestedWorkerMode,
    disableAdmin: source.DISABLE_MEDUSA_ADMIN?.trim().toLowerCase() === "true",
    isMedusaCloud: Boolean(source.MEDUSA_CLOUD_ENVIRONMENT_TYPE?.trim()),
    storeCors: resolveRequiredValue(source, "STORE_CORS", localDefaults.storeCors),
    adminCors: resolveRequiredValue(source, "ADMIN_CORS", localDefaults.adminCors),
    authCors: resolveRequiredValue(source, "AUTH_CORS", localDefaults.authCors),
    jwtSecret: resolveRequiredValue(source, "JWT_SECRET", localDefaults.jwtSecret),
    cookieSecret: resolveRequiredValue(
      source,
      "COOKIE_SECRET",
      localDefaults.cookieSecret,
    ),
  }
}

export function resolveMedusaRuntimeEnv(
  source: MedusaRuntimeEnvSource,
): MedusaRuntimeEnv {
  return {
    storeCors: resolveRequiredValue(source, "STORE_CORS", localDefaults.storeCors),
    adminCors: resolveRequiredValue(source, "ADMIN_CORS", localDefaults.adminCors),
    authCors: resolveRequiredValue(source, "AUTH_CORS", localDefaults.authCors),
    jwtSecret: resolveRequiredValue(source, "JWT_SECRET", localDefaults.jwtSecret),
    cookieSecret: resolveRequiredValue(
      source,
      "COOKIE_SECRET",
      localDefaults.cookieSecret,
    ),
  }
}
