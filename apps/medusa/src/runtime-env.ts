export interface MedusaRuntimeEnvSource {
  NODE_ENV?: string
  STORE_CORS?: string
  ADMIN_CORS?: string
  AUTH_CORS?: string
  JWT_SECRET?: string
  COOKIE_SECRET?: string
}

export interface MedusaRuntimeEnv {
  storeCors: string
  adminCors: string
  authCors: string
  jwtSecret: string
  cookieSecret: string
}

const localDefaults: MedusaRuntimeEnv = {
  storeCors: "http://localhost:3000,http://localhost:8000",
  adminCors: "http://localhost:9000",
  authCors:
    "http://localhost:9000,http://localhost:3000,http://localhost:8000",
  jwtSecret: "fotomax-local-jwt-secret",
  cookieSecret: "fotomax-local-cookie-secret",
}

export function resolveMedusaRuntimeEnv(
  source: MedusaRuntimeEnvSource,
): MedusaRuntimeEnv {
  const isLocal =
    source.NODE_ENV === undefined ||
    source.NODE_ENV === "development" ||
    source.NODE_ENV === "test"

  function resolveValue(
    variable: keyof Omit<MedusaRuntimeEnvSource, "NODE_ENV">,
    localDefault: string,
  ): string {
    const value = source[variable]?.trim()

    if (value) {
      return value
    }

    if (isLocal) {
      return localDefault
    }

    throw new Error(
      `Missing required environment variable ${variable} for NODE_ENV=${JSON.stringify(source.NODE_ENV)}`,
    )
  }

  return {
    storeCors: resolveValue("STORE_CORS", localDefaults.storeCors),
    adminCors: resolveValue("ADMIN_CORS", localDefaults.adminCors),
    authCors: resolveValue("AUTH_CORS", localDefaults.authCors),
    jwtSecret: resolveValue("JWT_SECRET", localDefaults.jwtSecret),
    cookieSecret: resolveValue("COOKIE_SECRET", localDefaults.cookieSecret),
  }
}
