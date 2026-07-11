export interface StorefrontEnv {
  backendUrl: string
  publishableKey: string
  sessionSecret: string
}

type Environment = Record<string, string | undefined>

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getStorefrontEnv(environment: Environment = process.env): StorefrontEnv {
  return {
    backendUrl: required(environment, "MEDUSA_BACKEND_URL"),
    publishableKey: required(environment, "MEDUSA_PUBLISHABLE_KEY"),
    sessionSecret: required(environment, "STOREFRONT_SESSION_SECRET"),
  }
}