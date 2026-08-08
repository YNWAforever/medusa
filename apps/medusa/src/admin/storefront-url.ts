import { defaultLocale } from "@fotomax/shared"

export const defaultStorefrontLocalePath = "/" + defaultLocale

export function storefrontHomeHref(storefrontUrl: string): string {
  const normalizedOrigin = storefrontUrl.trim().replace(/\/+$/, "")

  if (!normalizedOrigin) {
    throw new Error("Storefront URL must not be empty")
  }

  return normalizedOrigin + defaultStorefrontLocalePath
}
