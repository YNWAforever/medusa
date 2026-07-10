import type { ExecArgs, Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { categories, localize, products, serviceEntries } from "@fotomax/shared"

export function buildFotomaxSeedPayload() {
  return {
    region: {
      name: "Hong Kong",
      currency_code: "hkd",
      countries: ["hk"],
    },
    collections: categories.map((category) => ({
      handle: category.handle,
      title: localize(category.name, "en"),
      metadata: {
        title_zh_hk: localize(category.name, "zh-HK"),
        summary_en: localize(category.summary, "en"),
        summary_zh_hk: localize(category.summary, "zh-HK"),
        kind: category.kind,
        accent: category.accent,
      },
    })),
    products: products.map((product) => ({
      handle: product.handle,
      title: localize(product.name, "en"),
      description: localize(product.description, "en"),
      collection_handle: product.categoryHandle,
      status: "published",
      thumbnail: product.image,
      metadata: {
        title_zh_hk: localize(product.name, "zh-HK"),
        description_zh_hk: localize(product.description, "zh-HK"),
        badge_en: localize(product.badge, "en"),
        badge_zh_hk: localize(product.badge, "zh-HK"),
        fotomax_status: product.status,
      },
      variants: [
        {
          title: "Default",
          sku: `FOTOMAX-${product.handle.toUpperCase()}`,
          prices: [
            {
              currency_code: "hkd",
              amount: product.priceCents / 100,
            },
          ],
        },
      ],
    })),
    service_entries: serviceEntries.map((entry) => ({
      handle: entry.handle,
      title: localize(entry.title, "en"),
      title_zh_hk: localize(entry.title, "zh-HK"),
      category_handle: entry.categoryHandle,
      status: entry.status,
    })),
  }
}

export default async function seedFotomax({ container }: ExecArgs) {
  const payload = buildFotomaxSeedPayload()
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

  logger.info(`Prepared ${payload.collections.length} collections for Fotomax`)
  logger.info(`Prepared ${payload.products.length} products for Fotomax`)
  logger.info(
    `Prepared ${payload.service_entries.length} service entries for Fotomax`,
  )
}
