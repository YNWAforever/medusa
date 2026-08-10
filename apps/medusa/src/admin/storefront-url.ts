// The Medusa Admin is compiled as Node16/CommonJS, while @fotomax/shared is
// ESM-only. Keep this boundary self-contained until the shared package exposes
// a CJS-safe entry.
export const defaultStorefrontLocalePath = "/zh-HK"

export function storefrontHomeHref(storefrontUrl: string): string {
  const normalizedOrigin = storefrontUrl.trim().replace(/\/+$/, "")

  if (!normalizedOrigin) {
    throw new Error("Storefront URL must not be empty")
  }

  return normalizedOrigin + defaultStorefrontLocalePath
}
