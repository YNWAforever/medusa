import {
  createCollectionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  type CreateCollectionsWorkflowInput,
  type CreateProductsWorkflowInput,
} from "@medusajs/core-flows"
import type { ExecArgs, Logger, WorkflowTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { categories, localize, products, serviceEntries } from "@fotomax/shared"

export interface FotomaxSeedOperations {
  createRegions(
    input: WorkflowTypes.RegionWorkflow.CreateRegionsWorkflowInput,
  ): Promise<Array<{ id: string }>>
  createCollections(
    input: CreateCollectionsWorkflowInput,
  ): Promise<Array<{ id: string; handle: string }>>
  createProducts(
    input: CreateProductsWorkflowInput,
  ): Promise<Array<{ id: string }>>
}

export function buildFotomaxSeedPayload(): {
  regions: WorkflowTypes.RegionWorkflow.CreateRegionsWorkflowInput["regions"]
  collections: CreateCollectionsWorkflowInput["collections"]
} {
  return {
    regions: [
      {
        name: "Hong Kong",
        currency_code: "hkd",
        countries: ["hk"],
      },
    ],
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
  }
}

function buildVariantOptions(
  options: Array<{ title: string; values: string[] }>,
): Array<Record<string, string>> {
  return options.reduce<Array<Record<string, string>>>(
    (combinations, option) =>
      combinations.flatMap((combination) =>
        option.values.map((value) => ({
          ...combination,
          [option.title]: value,
        })),
      ),
    [{}],
  )
}

export function buildFotomaxProductInputs(
  collectionIdsByHandle: ReadonlyMap<string, string>,
): CreateProductsWorkflowInput["products"] {
  return products.map((product) => {
    const collectionId = collectionIdsByHandle.get(product.categoryHandle)

    if (!collectionId) {
      throw new Error(
        `Missing Medusa collection ID for ${product.categoryHandle}`,
      )
    }

    const options = product.options.map((option) => ({
      title: localize(option.name, "en"),
      values: option.values.map((value) => localize(value, "en")),
      metadata: {
        title_zh_hk: localize(option.name, "zh-HK"),
        values_zh_hk: option.values.map((value) => localize(value, "zh-HK")),
      },
    }))
    const variantOptions = buildVariantOptions(options)

    return {
      handle: product.handle,
      title: localize(product.name, "en"),
      description: localize(product.description, "en"),
      collection_id: collectionId,
      status: "published",
      thumbnail: product.image,
      options,
      metadata: {
        title_zh_hk: localize(product.name, "zh-HK"),
        description_zh_hk: localize(product.description, "zh-HK"),
        badge_en: localize(product.badge, "en"),
        badge_zh_hk: localize(product.badge, "zh-HK"),
        fotomax_status: product.status,
      },
      variants: variantOptions.map((optionValues, index) => ({
        title: Object.values(optionValues).join(" / "),
        sku: `FOTOMAX-${product.handle.toUpperCase()}-${index + 1}`,
        manage_inventory: false,
        options: optionValues,
        prices: [
          {
            currency_code: "hkd",
            amount: product.priceCents / 100,
          },
        ],
      })),
    }
  })
}

export async function runFotomaxSeedWorkflows(
  operations: FotomaxSeedOperations,
): Promise<{ regions: number; collections: number; products: number }> {
  const payload = buildFotomaxSeedPayload()
  const createdRegions = await operations.createRegions({
    regions: payload.regions,
  })
  const createdCollections = await operations.createCollections({
    collections: payload.collections,
  })
  const collectionIdsByHandle = new Map(
    createdCollections.map((collection) => [collection.handle, collection.id]),
  )
  const productInputs = buildFotomaxProductInputs(collectionIdsByHandle)
  const createdProducts = await operations.createProducts({
    products: productInputs,
  })

  return {
    regions: createdRegions.length,
    collections: createdCollections.length,
    products: createdProducts.length,
  }
}

function createMedusaSeedOperations(
  container: ExecArgs["container"],
): FotomaxSeedOperations {
  return {
    async createRegions(input) {
      return (await createRegionsWorkflow(container).run({ input })).result
    },
    async createCollections(input) {
      return (await createCollectionsWorkflow(container).run({ input })).result
    },
    async createProducts(input) {
      return (await createProductsWorkflow(container).run({ input })).result
    },
  }
}

export default async function seedFotomax({ container }: ExecArgs) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const result = await runFotomaxSeedWorkflows(
    createMedusaSeedOperations(container),
  )

  logger.info(`Seeded ${result.regions} Fotomax region`)
  logger.info(`Seeded ${result.collections} Fotomax collections`)
  logger.info(`Seeded ${result.products} Fotomax products`)
  logger.info(
    `Deferred ${serviceEntries.length} next-phase service entries without a Medusa model`,
  )
}
