import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  type CreateApiKeysWorkflowInput,
  type CreateCollectionsWorkflowInput,
  type CreateProductsWorkflowInput,
  type CreateSalesChannelsWorkflowInput,
  type LinkProductsToSalesChannelWorkflowInput,
  type LinkSalesChannelsToApiKeyWorkflowInput,
  updateApiKeysWorkflow,
  updateCollectionsWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateSalesChannelsWorkflow,
  type UpdateApiKeysWorkflowInput,
  type UpdateCollectionsWorkflowInput,
  type UpdateProductsWorkflowInputProducts,
  type UpdateSalesChannelsWorkflowInput,
} from "@medusajs/core-flows"
import type { ExecArgs, Logger, WorkflowTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { categories, localize, products, serviceEntries } from "@fotomax/shared"
import { reconcileByKey } from "./reconcile"
import {
  createMedusaOperationalOperations,
  reconcileFotomaxOperationalData,
} from "./seed-operational"
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
      status: product.commerceMode === "deferred" ? "draft" : "published",
      thumbnail: product.image,
      options,
      metadata: {
        title_zh_hk: localize(product.name, "zh-HK"),
        description_zh_hk: localize(product.description, "zh-HK"),
        badge_en: localize(product.badge, "en"),
        badge_zh_hk: localize(product.badge, "zh-HK"),
        commerce_mode: product.commerceMode,
      },
      variants: variantOptions.map((optionValues, index) => ({
        title: Object.values(optionValues).join(" / "),
        sku: `FOTOMAX-${product.handle.toUpperCase()}-${index + 1}`,
        manage_inventory: product.commerceMode === "retail",
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
  await reconcileFotomaxReferenceData(
    createMedusaReconcileOperations(container),
  )
  await reconcileFotomaxOperationalData(
    createMedusaOperationalOperations(container),
  )
  logger.info("Reconciled Fotomax Medusa reference and operational data")
  logger.info(
    `Deferred ${serviceEntries.length} next-phase service entries without a Medusa model`,
  )
}

const STAGING_SALES_CHANNEL_NAME = "Fotomax Hong Kong Staging"
const STAGING_PUBLISHABLE_KEY_TITLE = "Fotomax Storefront Staging"

export type ReferenceRecord = {
  id: string
  name?: string
  title?: string
  handle?: string
  sku?: string | null
  variants?: Array<{ id: string; sku?: string | null }>
  sales_channels?: Array<{ id: string }>
}

export interface FotomaxReconcileOperations {
  listRegions(names: readonly string[]): Promise<ReferenceRecord[]>
  createRegions(
    input: WorkflowTypes.RegionWorkflow.CreateRegionsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  updateRegions(
    input: WorkflowTypes.RegionWorkflow.UpdateRegionsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  listCollections(handles: readonly string[]): Promise<ReferenceRecord[]>
  createCollections(
    input: CreateCollectionsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  updateCollections(
    input: UpdateCollectionsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  listProducts(handles: readonly string[]): Promise<ReferenceRecord[]>
  listVariants(skus: readonly string[]): Promise<ReferenceRecord[]>
  createProducts(input: CreateProductsWorkflowInput): Promise<ReferenceRecord[]>
  updateProducts(
    input: UpdateProductsWorkflowInputProducts,
  ): Promise<ReferenceRecord[]>
  listSalesChannels(names: readonly string[]): Promise<ReferenceRecord[]>
  createSalesChannels(
    input: CreateSalesChannelsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  updateSalesChannels(
    input: UpdateSalesChannelsWorkflowInput,
  ): Promise<ReferenceRecord[]>
  listApiKeys(titles: readonly string[]): Promise<ReferenceRecord[]>
  createApiKeys(input: CreateApiKeysWorkflowInput): Promise<ReferenceRecord[]>
  updateApiKeys(input: UpdateApiKeysWorkflowInput): Promise<ReferenceRecord[]>
  linkProductsToSalesChannel(
    input: LinkProductsToSalesChannelWorkflowInput,
  ): Promise<void>
  linkSalesChannelsToApiKey(
    input: LinkSalesChannelsToApiKeyWorkflowInput,
  ): Promise<void>
}

async function listReferenceRecords(
  container: ExecArgs["container"],
  entity: string,
  fields: string[],
  filters: Record<string, unknown>,
): Promise<ReferenceRecord[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await query.graph({ entity, fields, filters })
  return result.data as ReferenceRecord[]
}

function createMedusaReconcileOperations(
  container: ExecArgs["container"],
): FotomaxReconcileOperations {
  return {
    listRegions(names) {
      return listReferenceRecords(container, "region", ["id", "name"], {
        name: [...names],
      })
    },
    async createRegions(input) {
      return (await createRegionsWorkflow(container).run({ input })).result
    },
    async updateRegions(input) {
      return (await updateRegionsWorkflow(container).run({ input })).result
    },
    listCollections(handles) {
      return listReferenceRecords(
        container,
        "product_collection",
        ["id", "handle"],
        { handle: [...handles] },
      )
    },
    async createCollections(input) {
      return (await createCollectionsWorkflow(container).run({ input })).result
    },
    async updateCollections(input) {
      return (await updateCollectionsWorkflow(container).run({ input })).result
    },
    listProducts(handles) {
      return listReferenceRecords(
        container,
        "product",
        ["id", "handle", "sales_channels.id"],
        { handle: [...handles] },
      )
    },
    listVariants(skus) {
      return listReferenceRecords(
        container,
        "product_variant",
        ["id", "sku"],
        { sku: [...skus] },
      )
    },
    async createProducts(input) {
      return (await createProductsWorkflow(container).run({ input })).result
    },
    async updateProducts(input) {
      return (await updateProductsWorkflow(container).run({ input })).result
    },
    listSalesChannels(names) {
      return listReferenceRecords(
        container,
        "sales_channel",
        ["id", "name"],
        { name: [...names] },
      )
    },
    async createSalesChannels(input) {
      return (await createSalesChannelsWorkflow(container).run({ input })).result
    },
    async updateSalesChannels(input) {
      return (await updateSalesChannelsWorkflow(container).run({ input })).result
    },
    listApiKeys(titles) {
      return listReferenceRecords(
        container,
        "api_key",
        ["id", "title", "sales_channels.id"],
        { title: [...titles] },
      )
    },
    async createApiKeys(input) {
      return (await createApiKeysWorkflow(container).run({ input })).result
    },
    async updateApiKeys(input) {
      return (await updateApiKeysWorkflow(container).run({ input })).result
    },
    async linkProductsToSalesChannel(input) {
      await linkProductsToSalesChannelWorkflow(container).run({ input })
    },
    async linkSalesChannelsToApiKey(input) {
      await linkSalesChannelsToApiKeyWorkflow(container).run({ input })
    },
  }
}

type ProductUpdate =
  UpdateProductsWorkflowInputProducts["products"][number]
type VariantUpdate = NonNullable<ProductUpdate["variants"]>[number]

export async function reconcileFotomaxReferenceData(
  operations: FotomaxReconcileOperations,
): Promise<void> {
  const payload = buildFotomaxSeedPayload()
  const desiredRegionNames = payload.regions.map((region) => region.name)
  const existingRegions = await operations.listRegions(desiredRegionNames)
  const regionPlan = reconcileByKey({
    desired: payload.regions,
    existing: existingRegions,
    desiredKey: (region) => region.name,
    existingKey: (region) => region.name ?? "",
    toCreate: (region) => region,
    toUpdate: (region, existing) => ({
      selector: { id: existing.id },
      update: region,
    }),
  })

  if (regionPlan.create.length) {
    await operations.createRegions({ regions: regionPlan.create })
  }
  for (const input of regionPlan.update) {
    await operations.updateRegions(input)
  }

  const desiredCollectionHandles = payload.collections.map(
    (collection) => collection.handle ?? "",
  )
  const existingCollections = await operations.listCollections(
    desiredCollectionHandles,
  )
  const collectionPlan = reconcileByKey({
    desired: payload.collections,
    existing: existingCollections,
    desiredKey: (collection) => collection.handle ?? "",
    existingKey: (collection) => collection.handle ?? "",
    toCreate: (collection) => collection,
    toUpdate: (collection, existing) => ({
      selector: { id: existing.id },
      update: collection,
    }),
  })
  const createdCollections = collectionPlan.create.length
    ? await operations.createCollections({
        collections: collectionPlan.create,
      })
    : []

  for (const input of collectionPlan.update) {
    await operations.updateCollections(input)
  }

  const collectionIdsByHandle = new Map(
    [...existingCollections, ...createdCollections].flatMap((collection) =>
      collection.handle
        ? [[collection.handle, collection.id] as const]
        : [],
    ),
  )
  const desiredProducts = buildFotomaxProductInputs(collectionIdsByHandle)
  const desiredProductHandles = desiredProducts.map(
    (product) => product.handle ?? "",
  )
  const desiredVariants = desiredProducts.flatMap(
    (product) => product.variants ?? [],
  )
  const desiredVariantSkus = desiredVariants.map(
    (variant) => variant.sku ?? "",
  )
  const [existingProducts, existingVariants] = await Promise.all([
    operations.listProducts(desiredProductHandles),
    operations.listVariants(desiredVariantSkus),
  ])
  const variantPlan = reconcileByKey({
    desired: desiredVariants,
    existing: existingVariants,
    desiredKey: (variant) => variant.sku ?? "",
    existingKey: (variant) => variant.sku ?? "",
    toCreate: (variant): VariantUpdate => ({ ...variant }),
    toUpdate: (variant, existing): VariantUpdate => ({
      ...variant,
      id: existing.id,
    }),
  })
  const variantsBySku = new Map(
    [...variantPlan.create, ...variantPlan.update].map((variant) => [
      variant.sku ?? "",
      variant,
    ]),
  )
  const productPlan = reconcileByKey({
    desired: desiredProducts,
    existing: existingProducts,
    desiredKey: (product) => product.handle ?? "",
    existingKey: (product) => product.handle ?? "",
    toCreate: (product) => product,
    toUpdate: (product, existing): ProductUpdate => {
      const { options: _options, variants, ...productData } = product
      return {
        ...productData,
        handle: productData.handle ?? undefined,
        id: existing.id,
        variants: variants?.map((variant) => {
          const reconciled = variantsBySku.get(variant.sku ?? "")
          if (!reconciled) {
            throw new Error(
              `Missing reconciled variant for SKU ${variant.sku ?? ""}`,
            )
          }
          return reconciled
        }),
      }
    },
  })
  const createdProducts = productPlan.create.length
    ? await operations.createProducts({ products: productPlan.create })
    : []

  if (productPlan.update.length) {
    await operations.updateProducts({ products: productPlan.update })
  }

  const existingChannels = await operations.listSalesChannels([
    STAGING_SALES_CHANNEL_NAME,
  ])
  const channelPlan = reconcileByKey({
    desired: [{ name: STAGING_SALES_CHANNEL_NAME }],
    existing: existingChannels,
    desiredKey: (channel) => channel.name,
    existingKey: (channel) => channel.name ?? "",
    toCreate: (channel) => channel,
    toUpdate: (channel, existing) => ({
      selector: { id: existing.id },
      update: { name: channel.name },
    }),
  })
  const createdChannels = channelPlan.create.length
    ? await operations.createSalesChannels({
        salesChannelsData: channelPlan.create,
      })
    : []

  for (const input of channelPlan.update) {
    await operations.updateSalesChannels(input)
  }

  const salesChannelId = [...existingChannels, ...createdChannels][0]?.id
  if (!salesChannelId) {
    throw new Error("Missing Fotomax staging sales channel")
  }

  const productRecordsByHandle = new Map(
    [...existingProducts, ...createdProducts].flatMap((product) =>
      product.handle ? [[product.handle, product] as const] : [],
    ),
  )
  const productIdsToLink = products
    .filter((product) => product.commerceMode !== "deferred")
    .map((product) => {
      const record = productRecordsByHandle.get(product.handle)
      if (!record) {
        throw new Error(`Missing Medusa product for ${product.handle}`)
      }
      return record.sales_channels?.some(
        (channel) => channel.id === salesChannelId,
      )
        ? undefined
        : record.id
    })
    .filter((id): id is string => Boolean(id))

  if (productIdsToLink.length) {
    await operations.linkProductsToSalesChannel({
      id: salesChannelId,
      add: productIdsToLink,
      remove: [],
    })
  }

  const existingKeys = await operations.listApiKeys([
    STAGING_PUBLISHABLE_KEY_TITLE,
  ])
  const keyPlan = reconcileByKey({
    desired: [{ title: STAGING_PUBLISHABLE_KEY_TITLE }],
    existing: existingKeys,
    desiredKey: (key) => key.title,
    existingKey: (key) => key.title ?? "",
    toCreate: (key) => ({
      ...key,
      type: "publishable" as const,
      created_by: "fotomax-seed",
    }),
    toUpdate: (key, existing) => ({
      selector: { id: existing.id },
      update: { title: key.title },
    }),
  })
  const createdKeys = keyPlan.create.length
    ? await operations.createApiKeys({ api_keys: keyPlan.create })
    : []

  for (const input of keyPlan.update) {
    await operations.updateApiKeys(input)
  }

  const publishableKey = [...existingKeys, ...createdKeys][0]
  if (!publishableKey) {
    throw new Error("Missing Fotomax storefront publishable key")
  }
  if (
    !publishableKey.sales_channels?.some(
      (channel) => channel.id === salesChannelId,
    )
  ) {
    await operations.linkSalesChannelsToApiKey({
      id: publishableKey.id,
      add: [salesChannelId],
      remove: [],
    })
  }
}
