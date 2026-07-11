import "server-only"
import Medusa from "@medusajs/js-sdk"
import { getStorefrontEnv } from "./env"

export async function createStoreSdk(token?: string): Promise<Medusa> {
  const env = getStorefrontEnv()
  const sdk = new Medusa({
    baseUrl: env.backendUrl,
    publishableKey: env.publishableKey,
    auth: { type: "jwt", jwtTokenStorageMethod: "memory" },
  })

  if (token) {
    await sdk.client.setToken(token)
  }

  return sdk
}