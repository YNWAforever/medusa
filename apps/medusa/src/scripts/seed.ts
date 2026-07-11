import {
  createCollectionsWorkflow,
  createProductsWorkflow,
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkProductsToSalesChannelWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  type CreateCollectionsWorkflowInput,
  type CreateProductsWorkflowInput,
  updateApiKeysWorkflow,
  updateCollectionsWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateSalesChannelsWorkflow,
} from "@medusajs/core-flows"
import type { ExecArgs, Logger, WorkflowTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { categories, localize, products, serviceEntries } from "@fotomax/shared"
import { reconcileByKey } from "./reconcile"

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
  await reconcileFotomaxReferenceData(container)
  logger.info("Reconciled Fotomax Medusa reference data")
  logger.info(
    `Deferred ${serviceEntries.length} next-phase service entries without a Medusa model`,
  )
}

const STAGING_SALES_CHANNEL_NAME = "Fotomax Hong Kong Staging"
const STAGING_PUBLISHABLE_KEY_TITLE = "Fotomax Storefront Staging"

type ReferenceRecord = {
  id: string
  name?: string
  title?: string
  handle?: string
  sku?: string
  variants?: Array<{ id: string; sku?: string }>
  sales_channels?: Array<{ id: string }>
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

async function reconcileFotomaxReferenceData(container: ExecArgs["container"]) {
  const payload = buildFotomaxSeedPayload()
  const existingRegions = await listReferenceRecords(container, "region", ["id", "name"], { name: payload.regions.map((region) => region.name) })
  const regionPlan = reconcileByKey({
    desired: payload.regions, existing: existingRegions,
    desiredKey: (region) => region.name, existingKey: (region) => region.name ?? "",
    toCreate: (region) => region, toUpdate: (region, existing) => ({ id: existing.id, ...region }),
  })
  if (regionPlan.create.length) await createRegionsWorkflow(container).run({ input: { regions: regionPlan.create } })
  for (const region of regionPlan.update) await updateRegionsWorkflow(container).run({ input: { selector: { id: region.id }, update: region } })

  const existingCollections = await listReferenceRecords(container, "product_collection", ["id", "handle"], { handle: payload.collections.map((collection) => collection.handle) })
  const collectionPlan = reconcileByKey({
    desired: payload.collections, existing: existingCollections,
    desiredKey: (collection) => collection.handle ?? "", existingKey: (collection) => collection.handle ?? "",
    toCreate: (collection) => collection, toUpdate: (collection, existing) => ({ id: existing.id, ...collection }),
  })
  const createdCollections = collectionPlan.create.length ? (await createCollectionsWorkflow(container).run({ input: { collections: collectionPlan.create } })).result : []
  for (const collection of collectionPlan.update) await updateCollectionsWorkflow(container).run({ input: { selector: { id: collection.id }, update: collection } })
  const collectionIdsByHandle = new Map([...existingCollections, ...createdCollections].flatMap((collection) => collection.handle ? [[collection.handle, collection.id] as const] : []))
  const desiredProducts = buildFotomaxProductInputs(collectionIdsByHandle)
  const existingProducts = await listReferenceRecords(container, "product", ["id", "handle", "variants.id", "variants.sku"], { handle: desiredProducts.map((product) => product.handle) })
  await listReferenceRecords(container, "product_variant", ["id", "sku"], { sku: desiredProducts.flatMap((product) => product.variants?.map((variant) => variant.sku) ?? []) })
  const productPlan = reconcileByKey({
    desired: desiredProducts, existing: existingProducts,
    desiredKey: (product) => product.handle ?? "", existingKey: (product) => product.handle ?? "",
    toCreate: (product) => product,
    toUpdate: (product, existing) => ({ ...product, id: existing.id, variants: product.variants?.map((variant) => ({ ...variant, id: existing.variants?.find((current) => current.sku === variant.sku)?.id })) }),
  })
  if (productPlan.create.length) await createProductsWorkflow(container).run({ input: { products: productPlan.create } })
  if (productPlan.update.length) await updateProductsWorkflow(container).run({ input: { products: productPlan.update as never } })

  const existingChannels = await listReferenceRecords(container, "sales_channel", ["id", "name"], { name: [STAGING_SALES_CHANNEL_NAME] })
  const channelPlan = reconcileByKey({
    desired: [{ name: STAGING_SALES_CHANNEL_NAME }], existing: existingChannels,
    desiredKey: (channel) => channel.name, existingKey: (channel) => channel.name ?? "",
    toCreate: (channel) => channel, toUpdate: (channel, existing) => ({ id: existing.id, ...channel }),
  })
  const createdChannels = channelPlan.create.length ? (await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: channelPlan.create } })).result : []
  for (const channel of channelPlan.update) await updateSalesChannelsWorkflow(container).run({ input: { selector: { id: channel.id }, update: { name: channel.name } } })
  const salesChannelId = [...existingChannels, ...createdChannels][0]?.id
  if (!salesChannelId) throw new Error("Missing Fotomax staging sales channel")

  const existingKeys = await listReferenceRecords(container, "api_key", ["id", "title", "sales_channels.id"], { title: [STAGING_PUBLISHABLE_KEY_TITLE] })
  const keyPlan = reconcileByKey({
    desired: [{ title: STAGING_PUBLISHABLE_KEY_TITLE }], existing: existingKeys,
    desiredKey: (key) => key.title, existingKey: (key) => key.title ?? "",
    toCreate: (key) => ({ ...key, type: "publishable" as const, created_by: "fotomax-seed" }),
    toUpdate: (key, existing) => ({ id: existing.id, ...key }),
  })
  const createdKeys = keyPlan.create.length ? (await createApiKeysWorkflow(container).run({ input: { api_keys: keyPlan.create } })).result : []
  for (const key of keyPlan.update) await updateApiKeysWorkflow(container).run({ input: { selector: { id: key.id }, update: { title: key.title } } })
  const publishableKey = ([...existingKeys, ...createdKeys] as ReferenceRecord[])[0]
  if (!publishableKey) throw new Error("Missing Fotomax storefront publishable key")
  if (!publishableKey.sales_channels?.some((channel: { id: string }) => channel.id === salesChannelId)) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: publishableKey.id, add: [salesChannelId], remove: [] } })
  }

  const publishedProducts = await listReferenceRecords(container, "product", ["id", "handle"], { handle: products.filter((product) => product.commerceMode !== "deferred").map((product) => product.handle) })
  await linkProductsToSalesChannelWorkflow(container).run({ input: { id: salesChannelId, add: publishedProducts.map((product) => product.id), remove: [] } })
}
