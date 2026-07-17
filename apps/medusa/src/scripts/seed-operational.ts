import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
  createLinksWorkflow,
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  dismissLinksWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateInventoryLevelsWorkflow,
  updateRegionsWorkflow,
  updateShippingOptionsWorkflow,
  updateShippingProfilesWorkflow,
  updateStockLocationsWorkflow,
} from "@medusajs/core-flows"
import type {
  ExecArgs,
  FulfillmentTypes,
  LinkDefinition,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import stockLocationBranchCapabilityLink from "../links/stock-location-branch-capability"
import { BRANCH_CAPABILITY_MODULE } from "../modules/branch-capability"
import { reconcileByKey } from "./reconcile"
import {
  retailInventoryPerBranch,
  retailInventorySkus,
  stagingStockLocations,
  supportedPrintSkus,
} from "./seed-data"

const STAGING_SALES_CHANNEL_NAME = "Fotomax Hong Kong Staging"
export const FULFILLMENT_SET_QUERY_FIELDS = [
  "id",
  "name",
  "type",
  "service_zones.*",
  "service_zones.geo_zones.*",
] as const

async function listReferenceRecords(
  container: ExecArgs["container"],
  entity: string,
  fields: string[],
  filters: Record<string, unknown>,
): Promise<OperationalRecord[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await query.graph({ entity, fields, filters })
  return result.data
}
type StockLocationInput = {
  name: string
  metadata: { branch_handle: string }
  address: {
    address_1: string
    city: string
    country_code: string
  }
}

type FulfillmentSetInput = {
  name: string
  type: "pickup" | "shipping"
}

type ServiceZoneInput = {
  name: string
  fulfillment_set_id: string
  geo_zones: Array<{ type: "country"; country_code: "hk" }>
}

type ServiceZoneUpdateInput = {
  name: string
  geo_zones: Array<
    { id: string } | { type: "country"; country_code: "hk" }
  >
}

type ShippingProfileInput = {
  name: string
  type: "default"
}

type ShippingOptionInput = {
  name: string
  service_zone_id: string
  shipping_profile_id: string
  provider_id: string
  price_type: "flat"
  prices: Array<{ currency_code: "hkd"; amount: number }>
  type: { label: string; description?: string; code: string }
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

type InventoryItemInput = {
  sku: string
  title: string
  description: string
  requires_shipping: true
}

type InventoryLevelInput = {
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
}

type BranchCapabilityInput = {
  handle: string
  name_en: string
  name_zh_hk: string
  district_en: string
  district_zh_hk: string
  pickup_enabled: boolean
  test_only: boolean
  lead_time_business_days: number
  supported_print_skus: string[]
}

export function buildBranchCapabilityUpdateInput(
  id: string,
  data: BranchCapabilityInput,
): BranchCapabilityInput & { id: string } {
  return { id, ...data }
}

type OperationalRecord = {
  id: string
  name?: string
  title?: string
  handle?: string
  sku?: string | null
  variants?: Array<{ id: string; sku?: string | null }>
  sales_channels?: Array<{ id: string }>
  type?: string | ShippingOptionInput["type"]
  metadata?: Record<string, unknown>
  address?: StockLocationInput["address"]
  fulfillment_sets?: Array<{ id: string }>
  fulfillment_providers?: Array<{ id: string }>
  service_zones?: ServiceZoneRecord[]
  geo_zones?: Array<{ id?: string; type: string; country_code?: string }>
  fulfillment_set_id?: string
  shipping_profile_id?: string
  service_zone_id?: string
  provider_id?: string
  price_type?: string
  prices?: Array<{ currency_code: string; amount: number }>
  data?: Record<string, unknown>
  inventory_items?: Array<{ inventory: OperationalRecord }>
  inventory_item_id?: string
  location_id?: string
  stocked_quantity?: number
  payment_providers?: Array<{ id: string }>
  branch_capability_id?: string
  stock_location_id?: string
  name_en?: string
  name_zh_hk?: string
  district_en?: string
  district_zh_hk?: string
  pickup_enabled?: boolean
  test_only?: boolean
  lead_time_business_days?: number
  supported_print_skus?: string[]
}

type ServiceZoneRecord = OperationalRecord & {
  id: string
  name: string
  fulfillment_set_id: string
  geo_zones: Array<{ id?: string; type: string; country_code?: string }>
}

export function dedupeBranchCapabilityLinkRecords(
  records: OperationalRecord[],
): OperationalRecord[] {
  const recordsById = new Map<string, OperationalRecord>()
  for (const record of records) {
    const existing = recordsById.get(record.id)
    if (
      existing &&
      (existing.stock_location_id !== record.stock_location_id ||
        existing.branch_capability_id !== record.branch_capability_id)
    ) {
      throw new Error(`Conflicting branch capability link "${record.id}"`)
    }
    recordsById.set(record.id, record)
  }
  return [...recordsById.values()]
}

export interface FotomaxOperationalOperations {
  listSalesChannels(names: readonly string[]): Promise<OperationalRecord[]>
  listStockLocations(names: readonly string[]): Promise<OperationalRecord[]>
  createStockLocations(
    locations: StockLocationInput[],
  ): Promise<OperationalRecord[]>
  updateStockLocation(id: string, data: StockLocationInput): Promise<void>
  linkSalesChannelToStockLocation(
    locationId: string,
    salesChannelId: string,
  ): Promise<void>
  linkFulfillmentProviderToStockLocation(
    locationId: string,
    providerId: string,
  ): Promise<void>
  listFulfillmentSets(names: readonly string[]): Promise<OperationalRecord[]>
  createLocationFulfillmentSet(
    locationId: string,
    data: FulfillmentSetInput,
  ): Promise<OperationalRecord>
  updateFulfillmentSet(id: string, data: FulfillmentSetInput): Promise<void>
  listFulfillmentSetLocationLinks(
    fulfillmentSetIds: readonly string[],
  ): Promise<OperationalRecord[]>
  dismissFulfillmentSetFromStockLocation(
    locationId: string,
    fulfillmentSetId: string,
  ): Promise<void>
  linkFulfillmentSetToStockLocation(
    locationId: string,
    fulfillmentSetId: string,
  ): Promise<void>
  createServiceZone(data: ServiceZoneInput): Promise<ServiceZoneRecord>
  updateServiceZone(id: string, data: ServiceZoneUpdateInput): Promise<void>
  listShippingProfiles(names: readonly string[]): Promise<OperationalRecord[]>
  createShippingProfile(
    data: ShippingProfileInput,
  ): Promise<OperationalRecord>
  updateShippingProfile(id: string, data: ShippingProfileInput): Promise<void>
  listShippingOptions(names: readonly string[]): Promise<OperationalRecord[]>
  createShippingOption(data: ShippingOptionInput): Promise<OperationalRecord>
  updateShippingOption(
    id: string,
    data: ShippingOptionInput,
  ): Promise<void>
  listFulfillmentProviders(ids: readonly string[]): Promise<OperationalRecord[]>
  listProductVariants(skus: readonly string[]): Promise<OperationalRecord[]>
  listInventoryItems(skus: readonly string[]): Promise<OperationalRecord[]>
  createInventoryItems(
    items: InventoryItemInput[],
  ): Promise<OperationalRecord[]>
  linkVariantToInventoryItem(
    variantId: string,
    inventoryItemId: string,
  ): Promise<void>
  listInventoryLevels(
    inventoryItemIds: readonly string[],
    locationIds: readonly string[],
  ): Promise<OperationalRecord[]>
  createInventoryLevels(levels: InventoryLevelInput[]): Promise<void>
  updateInventoryLevels(
    updates: Array<InventoryLevelInput & { id: string }>,
  ): Promise<void>
  listBranchCapabilities(
    handles: readonly string[],
  ): Promise<OperationalRecord[]>
  createBranchCapabilities(
    capabilities: BranchCapabilityInput[],
  ): Promise<OperationalRecord[]>
  updateBranchCapability(
    id: string,
    data: BranchCapabilityInput,
  ): Promise<void>
  listBranchCapabilityLinks(
    locationIds: readonly string[],
    capabilityIds: readonly string[],
  ): Promise<OperationalRecord[]>
  dismissStockLocationBranchCapability(
    locationId: string,
    branchCapabilityId: string,
  ): Promise<void>
  linkStockLocationToBranchCapability(
    locationId: string,
    branchCapabilityId: string,
  ): Promise<void>
  listRegions(names: readonly string[]): Promise<OperationalRecord[]>
  listPaymentProviders(ids: readonly string[]): Promise<OperationalRecord[]>
  updateRegionPaymentProviders(
    regionId: string,
    providerIds: readonly string[],
  ): Promise<void>
}

function uniqueRecordsByKey<T>(
  records: readonly T[],
  keyOf: (record: T) => string,
): Map<string, T> {
  const recordsByKey = new Map<string, T>()
  for (const record of records) {
    const key = keyOf(record)
    if (recordsByKey.has(key)) {
      throw new Error(`Duplicate existing key "${key}"`)
    }
    recordsByKey.set(key, record)
  }
  return recordsByKey
}

function requiredRecord<T>(record: T | undefined, message: string): T {
  if (!record) {
    throw new Error(message)
  }
  return record
}

export type ExclusiveLink = {
  leftId: string
  rightId: string
}

export async function reconcileExclusiveLinks(args: {
  desired: readonly ExclusiveLink[]
  existing: readonly ExclusiveLink[]
  leftExclusive: boolean
  rightExclusive: boolean
  dismiss(link: ExclusiveLink): Promise<void>
  create(link: ExclusiveLink): Promise<void>
}): Promise<void> {
  const current = [...args.existing]
  uniqueRecordsByKey(current, (link) => link.leftId + ":" + link.rightId)

  for (const desired of args.desired) {
    const conflicts = current.filter(
      (link) =>
        (link.leftId !== desired.leftId || link.rightId !== desired.rightId) &&
        ((args.leftExclusive && link.leftId === desired.leftId) ||
          (args.rightExclusive && link.rightId === desired.rightId)),
    )

    for (const conflict of conflicts) {
      await args.dismiss(conflict)
      current.splice(current.indexOf(conflict), 1)
    }

    if (
      !current.some(
        (link) =>
          link.leftId === desired.leftId && link.rightId === desired.rightId,
      )
    ) {
      await args.create(desired)
      current.push(desired)
    }
  }
}

export async function reconcileFotomaxOperationalData(
  operations: FotomaxOperationalOperations,
): Promise<void> {
  const channels = await operations.listSalesChannels([
    STAGING_SALES_CHANNEL_NAME,
  ])
  const channel = requiredRecord(
    uniqueRecordsByKey(channels, (record) => record.name ?? "").get(
      STAGING_SALES_CHANNEL_NAME,
    ),
    "Missing Fotomax staging sales channel",
  )

  const desiredLocations: StockLocationInput[] = stagingStockLocations.map(
    (branch) => ({
      name: `Fotomax Staging ${branch.handle}`,
      metadata: { branch_handle: branch.handle },
      address: {
        address_1: branch.address.address1,
        city: branch.address.city,
        country_code: branch.address.countryCode,
      },
    }),
  )
  const existingLocations = await operations.listStockLocations(
    desiredLocations.map((location) => location.name),
  )
  const locationPlan = reconcileByKey({
    desired: desiredLocations,
    existing: existingLocations,
    desiredKey: (location) => location.name,
    existingKey: (location) => location.name ?? "",
    toCreate: (location) => location,
    toUpdate: (location, existing) => ({ id: existing.id, data: location }),
  })
  const createdLocations = locationPlan.create.length
    ? await operations.createStockLocations(locationPlan.create)
    : []
  for (const update of locationPlan.update) {
    await operations.updateStockLocation(update.id, update.data)
  }
  const locationsByName = uniqueRecordsByKey(
    [...existingLocations, ...createdLocations],
    (location) => location.name ?? "",
  )
  for (const desired of desiredLocations) {
    const location = requiredRecord(
      locationsByName.get(desired.name),
      `Missing stock location ${desired.name}`,
    )
    if (
      !location.sales_channels?.some(
        (salesChannel) => salesChannel.id === channel.id,
      )
    ) {
      await operations.linkSalesChannelToStockLocation(location.id, channel.id)
    }
  }

  const pickupSets = stagingStockLocations.map((branch) => ({
    locationName: `Fotomax Staging ${branch.handle}`,
    set: {
      name: `Fotomax Pickup ${branch.handle}`,
      type: "pickup" as const,
    },
    zoneName: `Fotomax Pickup HK ${branch.handle}`,
    branch,
  }))
  const deliverySet: FulfillmentSetInput = {
    name: "Fotomax Hong Kong Delivery",
    type: "shipping",
  }
  const desiredSetNames = [
    ...pickupSets.map(({ set }) => set.name),
    deliverySet.name,
  ]
  const existingSets = await operations.listFulfillmentSets(desiredSetNames)
  const setsByName = uniqueRecordsByKey(
    existingSets,
    (set) => set.name ?? "",
  )
  const existingSetLocationRecords =
    await operations.listFulfillmentSetLocationLinks(
      existingSets.map((fulfillmentSet) => fulfillmentSet.id),
    )
  const existingSetLocationLinks: ExclusiveLink[] =
    existingSetLocationRecords.map((link) => ({
      leftId: requiredRecord(
        link.stock_location_id,
        "Missing stock location ID on fulfillment-set link " + link.id,
      ),
      rightId: requiredRecord(
        link.fulfillment_set_id,
        "Missing fulfillment set ID on location link " + link.id,
      ),
    }))
  const desiredSetLocationLinks: ExclusiveLink[] = []

  for (const pickup of pickupSets) {
    const location = requiredRecord(
      locationsByName.get(pickup.locationName),
      `Missing stock location ${pickup.locationName}`,
    )
    let fulfillmentSet = setsByName.get(pickup.set.name)
    if (!fulfillmentSet) {
      fulfillmentSet = await operations.createLocationFulfillmentSet(
        location.id,
        pickup.set,
      )
      setsByName.set(pickup.set.name, fulfillmentSet)
      existingSetLocationLinks.push({
        leftId: location.id,
        rightId: fulfillmentSet.id,
      })
    } else {
      await operations.updateFulfillmentSet(fulfillmentSet.id, pickup.set)
    }
    desiredSetLocationLinks.push({
      leftId: location.id,
      rightId: fulfillmentSet.id,
    })
  }

  const firstLocation = requiredRecord(
    locationsByName.get(desiredLocations[0].name),
    "Missing first Fotomax staging stock location",
  )
  let sharedDeliverySet = setsByName.get(deliverySet.name)
  if (!sharedDeliverySet) {
    sharedDeliverySet = await operations.createLocationFulfillmentSet(
      firstLocation.id,
      deliverySet,
    )
    setsByName.set(deliverySet.name, sharedDeliverySet)
    existingSetLocationLinks.push({
      leftId: firstLocation.id,
      rightId: sharedDeliverySet.id,
    })
  } else {
    await operations.updateFulfillmentSet(sharedDeliverySet.id, deliverySet)
  }
  desiredSetLocationLinks.push({
    leftId: firstLocation.id,
    rightId: sharedDeliverySet.id,
  })

  await reconcileExclusiveLinks({
    desired: desiredSetLocationLinks,
    existing: existingSetLocationLinks,
    leftExclusive: false,
    rightExclusive: true,
    dismiss: ({ leftId, rightId }) =>
      operations.dismissFulfillmentSetFromStockLocation(leftId, rightId),
    create: ({ leftId, rightId }) =>
      operations.linkFulfillmentSetToStockLocation(leftId, rightId),
  })

  const desiredZones = [
    ...pickupSets.map((pickup) => ({
      name: pickup.zoneName,
      fulfillmentSet: requiredRecord(
        setsByName.get(pickup.set.name),
        `Missing fulfillment set ${pickup.set.name}`,
      ),
    })),
    {
      name: "Fotomax Hong Kong Delivery Zone",
      fulfillmentSet: sharedDeliverySet,
    },
  ]
  for (const desiredZone of desiredZones) {
    const zonesByName = uniqueRecordsByKey(
      desiredZone.fulfillmentSet.service_zones ?? [],
      (zone) => zone.name ?? "",
    )
    const zoneInput: ServiceZoneInput = {
      name: desiredZone.name,
      fulfillment_set_id: desiredZone.fulfillmentSet.id,
      geo_zones: [{ type: "country", country_code: "hk" }],
    }
    const existingZone = zonesByName.get(desiredZone.name)
    if (existingZone) {
      const hasHongKongCountryZone = existingZone.geo_zones.some(
        (geoZone) =>
          geoZone.type === "country" && geoZone.country_code === "hk",
      )
      if (!hasHongKongCountryZone) {
        const existingGeoZones = existingZone.geo_zones.map((geoZone) => ({
          id: requiredRecord(
            geoZone.id,
            "Missing geo zone ID for service zone " + existingZone.id,
          ),
        }))
        await operations.updateServiceZone(existingZone.id, {
          name: desiredZone.name,
          geo_zones: [
            ...existingGeoZones,
            { type: "country", country_code: "hk" },
          ],
        })
      }
    } else {
      const createdZone = await operations.createServiceZone(zoneInput)
      desiredZone.fulfillmentSet.service_zones = [
        ...(desiredZone.fulfillmentSet.service_zones ?? []),
        createdZone,
      ]
    }
  }

  const profileInput: ShippingProfileInput = {
    name: "Fotomax Standard",
    type: "default",
  }
  const profiles = await operations.listShippingProfiles([profileInput.name])
  const profilesByName = uniqueRecordsByKey(
    profiles,
    (profile) => profile.name ?? "",
  )
  let shippingProfile = profilesByName.get(profileInput.name)
  if (!shippingProfile) {
    shippingProfile = await operations.createShippingProfile(profileInput)
  } else {
    await operations.updateShippingProfile(shippingProfile.id, profileInput)
  }

  const providers = await operations.listFulfillmentProviders([
    "manual_manual",
  ])
  const manualProvider = requiredRecord(
    uniqueRecordsByKey(providers, (provider) => provider.id).get(
      "manual_manual",
    ),
    'Missing fulfillment provider "manual_manual"',
  )
  for (const desiredLocation of desiredLocations) {
    const location = requiredRecord(
      locationsByName.get(desiredLocation.name),
      `Missing stock location ${desiredLocation.name}`,
    )
    if (
      !location.fulfillment_providers?.some(
        (provider) => provider.id === manualProvider.id,
      )
    ) {
      await operations.linkFulfillmentProviderToStockLocation(
        location.id,
        manualProvider.id,
      )
    }
  }
  const deliveryZone = requiredRecord(
    sharedDeliverySet.service_zones?.find(
      (zone) => zone.name === "Fotomax Hong Kong Delivery Zone",
    ),
    "Missing Fotomax Hong Kong delivery service zone",
  )
  const desiredOptions: ShippingOptionInput[] = [
    {
      name: "Fotomax Hong Kong Delivery",
      service_zone_id: deliveryZone.id,
      shipping_profile_id: shippingProfile.id,
      provider_id: manualProvider.id,
      price_type: "flat",
      prices: [{ currency_code: "hkd", amount: 40 }],
      type: {
        label: "Hong Kong Delivery",
        description: "Flat-rate Hong Kong delivery",
        code: "fotomax-hk-delivery",
      },
      data: { fulfillment_kind: "delivery" },
      metadata: { fulfillment_kind: "delivery" },
    },
    ...pickupSets.map((pickup) => {
      const set = requiredRecord(
        setsByName.get(pickup.set.name),
        `Missing fulfillment set ${pickup.set.name}`,
      )
      const zone = requiredRecord(
        set.service_zones?.find(
          (serviceZone) => serviceZone.name === pickup.zoneName,
        ),
        `Missing service zone ${pickup.zoneName}`,
      )
      return {
        name: `Fotomax Pickup ${pickup.branch.handle}`,
        service_zone_id: zone.id,
        shipping_profile_id: shippingProfile.id,
        provider_id: manualProvider.id,
        price_type: "flat" as const,
        prices: [{ currency_code: "hkd" as const, amount: 0 }],
        type: {
          label: pickup.branch.name.en,
          description: `Pickup from ${pickup.branch.name.en}`,
          code: `fotomax-pickup-${pickup.branch.handle}`,
        },
        data: {
          fulfillment_kind: "pickup",
          branch_handle: pickup.branch.handle,
        },
        metadata: {
          fulfillment_kind: "pickup",
          branch_handle: pickup.branch.handle,
        },
      }
    }),
  ]
  const existingOptions = await operations.listShippingOptions(
    desiredOptions.map((option) => option.name),
  )
  const optionsByName = uniqueRecordsByKey(
    existingOptions,
    (option) => option.name ?? "",
  )
  for (const option of desiredOptions) {
    const existing = optionsByName.get(option.name)
    if (existing) {
      await operations.updateShippingOption(existing.id, option)
    } else {
      await operations.createShippingOption(option)
    }
  }

  const desiredVariantSkus = [...supportedPrintSkus, ...retailInventorySkus]
  const variants = await operations.listProductVariants(desiredVariantSkus)
  const variantsBySku = uniqueRecordsByKey(
    variants,
    (variant) => variant.sku ?? "",
  )
  const existingItems = await operations.listInventoryItems(
    retailInventorySkus,
  )
  const itemsBySku = uniqueRecordsByKey(
    existingItems,
    (item) => item.sku ?? "",
  )
  const missingItemInputs = retailInventorySkus
    .filter((sku) => !itemsBySku.has(sku))
    .map((sku) => ({
      sku,
      title: `Fotomax retail inventory ${sku}`,
      description: `Seeded staging inventory for ${sku}`,
      requires_shipping: true as const,
    }))
  const createdItems = missingItemInputs.length
    ? await operations.createInventoryItems(missingItemInputs)
    : []
  for (const item of createdItems) {
    if (!item.sku) {
      throw new Error(`Created inventory item ${item.id} has no SKU`)
    }
    if (itemsBySku.has(item.sku)) {
      throw new Error(`Duplicate existing key "${item.sku}"`)
    }
    itemsBySku.set(item.sku, item)
  }

  for (const sku of retailInventorySkus) {
    const variant = requiredRecord(
      variantsBySku.get(sku),
      `Missing retail product variant ${sku}`,
    )
    const item = requiredRecord(
      itemsBySku.get(sku),
      `Missing retail inventory item ${sku}`,
    )
    const linkedItems = variant.inventory_items ?? []
    if (linkedItems.length > 1) {
      throw new Error(`Variant ${sku} has multiple inventory item links`)
    }
    const linkedItem = linkedItems[0]?.inventory
    if (linkedItem && linkedItem.id !== item.id) {
      throw new Error(`Variant ${sku} is linked to a different inventory item`)
    }
    if (!linkedItem) {
      await operations.linkVariantToInventoryItem(variant.id, item.id)
    }
  }

  const inventoryItems = retailInventorySkus.map((sku) =>
    requiredRecord(itemsBySku.get(sku), `Missing retail inventory item ${sku}`),
  )
  const stockLocations = desiredLocations.map((location) =>
    requiredRecord(
      locationsByName.get(location.name),
      `Missing stock location ${location.name}`,
    ),
  )
  const existingLevels = await operations.listInventoryLevels(
    inventoryItems.map((item) => item.id),
    stockLocations.map((location) => location.id),
  )
  const levelsByKey = uniqueRecordsByKey(
    existingLevels,
    (level) => `${level.inventory_item_id ?? ""}:${level.location_id ?? ""}`,
  )
  const levelsToCreate: InventoryLevelInput[] = []
  const levelsToUpdate: Array<InventoryLevelInput & { id: string }> = []
  for (const item of inventoryItems) {
    for (const location of stockLocations) {
      const desiredLevel = {
        inventory_item_id: item.id,
        location_id: location.id,
        stocked_quantity: retailInventoryPerBranch,
      }
      const existing = levelsByKey.get(`${item.id}:${location.id}`)
      if (existing) {
        levelsToUpdate.push({ id: existing.id, ...desiredLevel })
      } else {
        levelsToCreate.push(desiredLevel)
      }
    }
  }
  if (levelsToCreate.length) {
    await operations.createInventoryLevels(levelsToCreate)
  }
  if (levelsToUpdate.length) {
    await operations.updateInventoryLevels(levelsToUpdate)
  }

  const capabilityInputs: BranchCapabilityInput[] = stagingStockLocations.map(
    (branch) => ({
      handle: branch.handle,
      name_en: branch.name.en,
      name_zh_hk: branch.name["zh-HK"],
      district_en: branch.district.en,
      district_zh_hk: branch.district["zh-HK"],
      pickup_enabled: branch.pickupEnabled,
      test_only: branch.testOnly,
      lead_time_business_days: branch.leadTimeBusinessDays,
      supported_print_skus: [...supportedPrintSkus],
    }),
  )
  const existingCapabilities = await operations.listBranchCapabilities(
    capabilityInputs.map((capability) => capability.handle),
  )
  const capabilitiesByHandle = uniqueRecordsByKey(
    existingCapabilities,
    (capability) => capability.handle ?? "",
  )
  const missingCapabilities = capabilityInputs.filter(
    (capability) => !capabilitiesByHandle.has(capability.handle),
  )
  const createdCapabilities = missingCapabilities.length
    ? await operations.createBranchCapabilities(missingCapabilities)
    : []
  for (const capability of capabilityInputs) {
    const existing = capabilitiesByHandle.get(capability.handle)
    if (existing) {
      await operations.updateBranchCapability(existing.id, capability)
    }
  }
  for (const capability of createdCapabilities) {
    if (!capability.handle) {
      throw new Error(`Created branch capability ${capability.id} has no handle`)
    }
    capabilitiesByHandle.set(capability.handle, capability)
  }

  const capabilityRecords = capabilityInputs.map((capability) =>
    requiredRecord(
      capabilitiesByHandle.get(capability.handle),
      `Missing branch capability ${capability.handle}`,
    ),
  )
  const existingCapabilityLinks = await operations.listBranchCapabilityLinks(
    stockLocations.map((location) => location.id),
    capabilityRecords.map((capability) => capability.id),
  )
  const existingCapabilityLinkPairs: ExclusiveLink[] =
    existingCapabilityLinks.map((link) => ({
      leftId: requiredRecord(
        link.stock_location_id,
        "Missing stock location ID on branch capability link " + link.id,
      ),
      rightId: requiredRecord(
        link.branch_capability_id,
        "Missing branch capability ID on stock location link " + link.id,
      ),
    }))
  const desiredCapabilityLinkPairs = stagingStockLocations.map((branch) => {
    const location = requiredRecord(
      locationsByName.get(`Fotomax Staging ${branch.handle}`),
      `Missing stock location for ${branch.handle}`,
    )
    const capability = requiredRecord(
      capabilitiesByHandle.get(branch.handle),
      `Missing branch capability ${branch.handle}`,
    )
    return { leftId: location.id, rightId: capability.id }
  })

  await reconcileExclusiveLinks({
    desired: desiredCapabilityLinkPairs,
    existing: existingCapabilityLinkPairs,
    leftExclusive: true,
    rightExclusive: true,
    dismiss: ({ leftId, rightId }) =>
      operations.dismissStockLocationBranchCapability(leftId, rightId),
    create: ({ leftId, rightId }) =>
      operations.linkStockLocationToBranchCapability(leftId, rightId),
  })

  const regions = await operations.listRegions(["Hong Kong"])
  const region = requiredRecord(
    uniqueRecordsByKey(regions, (record) => record.name ?? "").get("Hong Kong"),
    "Missing Hong Kong region",
  )
  const paymentProviders = await operations.listPaymentProviders([
    "pp_system_default",
  ])
  const systemProvider = requiredRecord(
    uniqueRecordsByKey(paymentProviders, (provider) => provider.id).get(
      "pp_system_default",
    ),
    'Missing payment provider "pp_system_default"',
  )
  await operations.updateRegionPaymentProviders(region.id, [
    ...new Set([
      ...(region.payment_providers ?? []).map((provider) => provider.id),
      systemProvider.id,
    ]),
  ])
}

interface ShippingOptionMetadataService {
  updateShippingOptions(
    id: string,
    data: { metadata: Record<string, unknown> },
  ): Promise<unknown>
}

interface BranchCapabilityService {
  listBranchCapabilities(
    filters: { handle: string[] },
  ): Promise<OperationalRecord[]>
  createBranchCapabilities(
    data: BranchCapabilityInput[],
  ): Promise<OperationalRecord[]>
  updateBranchCapabilities(
    data: BranchCapabilityInput & { id: string },
  ): Promise<OperationalRecord>
}

export function createMedusaOperationalOperations(
  container: ExecArgs["container"],
): FotomaxOperationalOperations {
  const fulfillmentService =
    container.resolve<FulfillmentTypes.IFulfillmentModuleService>(
      Modules.FULFILLMENT,
    )
  const shippingOptionMetadataService =
    container.resolve<ShippingOptionMetadataService>(Modules.FULFILLMENT)
  const branchCapabilityService =
    container.resolve<BranchCapabilityService>(BRANCH_CAPABILITY_MODULE)

  return {
    listSalesChannels(names) {
      return listReferenceRecords(
        container,
        "sales_channel",
        ["id", "name"],
        { name: [...names] },
      )
    },
    listStockLocations(names) {
      return listReferenceRecords(
        container,
        "stock_location",
        [
          "id",
          "name",
          "metadata",
          "address.address_1",
          "address.city",
          "address.country_code",
          "sales_channels.id",
          "fulfillment_sets.id",
          "fulfillment_providers.id",
        ],
        { name: [...names] },
      )
    },
    async createStockLocations(locations) {
      await createStockLocationsWorkflow(container).run({
        input: { locations },
      })
      return listReferenceRecords(
        container,
        "stock_location",
        [
          "id",
          "name",
          "metadata",
          "address.address_1",
          "address.city",
          "address.country_code",
          "sales_channels.id",
          "fulfillment_sets.id",
          "fulfillment_providers.id",
        ],
        { name: locations.map((location) => location.name) },
      )
    },
    async updateStockLocation(id, data) {
      await updateStockLocationsWorkflow(container).run({
        input: { selector: { id }, update: data },
      })
    },
    async linkSalesChannelToStockLocation(locationId, salesChannelId) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
          id: locationId,
          add: [salesChannelId],
          remove: [],
        },
      })
    },
    async linkFulfillmentProviderToStockLocation(locationId, providerId) {
      const links: LinkDefinition[] = [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
        },
      ]
      await createLinksWorkflow(container).run({ input: links })
    },
    listFulfillmentSets(names) {
      return listReferenceRecords(
        container,
        "fulfillment_set",
        [...FULFILLMENT_SET_QUERY_FIELDS],
        { name: [...names] },
      )
    },
    async createLocationFulfillmentSet(locationId, data) {
      await createLocationFulfillmentSetWorkflow(container).run({
        input: {
          location_id: locationId,
          fulfillment_set_data: data,
        },
      })
      const records = await listReferenceRecords(
        container,
        "fulfillment_set",
        [...FULFILLMENT_SET_QUERY_FIELDS],
        { name: data.name },
      )
      return requiredRecord(
        uniqueRecordsByKey(records, (record) => record.name ?? "").get(
          data.name,
        ),
        `Missing created fulfillment set ${data.name}`,
      )
    },
    async updateFulfillmentSet(id, data) {
      await fulfillmentService.updateFulfillmentSets({ id, ...data })
    },
    async listFulfillmentSetLocationLinks(fulfillmentSetIds) {
      if (!fulfillmentSetIds.length) {
        return []
      }
      return listReferenceRecords(
        container,
        "location_fulfillment_set",
        ["id", "stock_location_id", "fulfillment_set_id"],
        { fulfillment_set_id: [...fulfillmentSetIds] },
      )
    },
    async dismissFulfillmentSetFromStockLocation(
      locationId,
      fulfillmentSetId,
    ) {
      const links: LinkDefinition[] = [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSetId },
        },
      ]
      await dismissLinksWorkflow(container).run({ input: links })
    },
    async linkFulfillmentSetToStockLocation(locationId, fulfillmentSetId) {
      const links: LinkDefinition[] = [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSetId },
        },
      ]
      await createLinksWorkflow(container).run({ input: links })
    },
    async createServiceZone(data) {
      const result = (
        await createServiceZonesWorkflow(container).run({
          input: { data: [data] },
        })
      ).result[0]
      return {
        id: requiredRecord(result, `Missing created service zone ${data.name}`)
          .id,
        ...data,
      }
    },
    async updateServiceZone(id, data) {
      await fulfillmentService.updateServiceZones(id, data)
    },
    listShippingProfiles(names) {
      return listReferenceRecords(
        container,
        "shipping_profile",
        ["id", "name", "type"],
        { name: [...names] },
      )
    },
    async createShippingProfile(data) {
      await createShippingProfilesWorkflow(container).run({
        input: { data: [data] },
      })
      const records = await listReferenceRecords(
        container,
        "shipping_profile",
        ["id", "name", "type"],
        { name: data.name },
      )
      return requiredRecord(
        uniqueRecordsByKey(records, (record) => record.name ?? "").get(
          data.name,
        ),
        `Missing created shipping profile ${data.name}`,
      )
    },
    async updateShippingProfile(id, data) {
      await updateShippingProfilesWorkflow(container).run({
        input: { selector: { id }, update: data },
      })
    },
    listShippingOptions(names) {
      return listReferenceRecords(
        container,
        "shipping_option",
        [
          "id",
          "name",
          "service_zone_id",
          "shipping_profile_id",
          "provider_id",
          "price_type",
          "data",
          "metadata",
          "*prices",
          "*type",
        ],
        { name: [...names] },
      )
    },
    async createShippingOption(data) {
      const { metadata, ...workflowData } = data
      const result = (
        await createShippingOptionsWorkflow(container).run({
          input: [workflowData],
        })
      ).result[0]
      const created = requiredRecord(
        result,
        `Missing created shipping option ${data.name}`,
      )
      await shippingOptionMetadataService.updateShippingOptions(created.id, {
        metadata,
      })
      const records = await listReferenceRecords(
        container,
        "shipping_option",
        [
          "id",
          "name",
          "service_zone_id",
          "shipping_profile_id",
          "provider_id",
          "price_type",
          "data",
          "metadata",
          "*prices",
          "*type",
        ],
        { name: data.name },
      )
      return requiredRecord(
        uniqueRecordsByKey(records, (record) => record.name ?? "").get(
          data.name,
        ),
        `Missing created shipping option ${data.name}`,
      )
    },
    async updateShippingOption(id, data) {
      const { metadata, ...workflowData } = data
      await updateShippingOptionsWorkflow(container).run({
        input: [{ id, ...workflowData }],
      })
      await shippingOptionMetadataService.updateShippingOptions(id, {
        metadata,
      })
    },
    listFulfillmentProviders(ids) {
      return listReferenceRecords(
        container,
        "fulfillment_provider",
        ["id"],
        { id: [...ids] },
      )
    },
    listProductVariants(skus) {
      return listReferenceRecords(
        container,
        "product_variant",
        [
          "id",
          "sku",
          "inventory_items.inventory.id",
          "inventory_items.inventory.sku",
        ],
        { sku: [...skus] },
      )
    },
    listInventoryItems(skus) {
      return listReferenceRecords(
        container,
        "inventory_item",
        ["id", "sku"],
        { sku: [...skus] },
      )
    },
    async createInventoryItems(items) {
      const result = (
        await createInventoryItemsWorkflow(container).run({
          input: { items },
        })
      ).result
      type CreatedInventoryItem = (typeof result)[number]
      return result.map((item: CreatedInventoryItem) => ({
        id: item.id,
        sku: item.sku,
      }))
    },
    async linkVariantToInventoryItem(variantId, inventoryItemId) {
      const links: LinkDefinition[] = [
        {
          [Modules.PRODUCT]: { variant_id: variantId },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
          data: { required_quantity: 1 },
        },
      ]
      await createLinksWorkflow(container).run({ input: links })
    },
    listInventoryLevels(inventoryItemIds, locationIds) {
      return listReferenceRecords(
        container,
        "inventory_level",
        [
          "id",
          "inventory_item_id",
          "location_id",
          "stocked_quantity",
        ],
        {
          inventory_item_id: [...inventoryItemIds],
          location_id: [...locationIds],
        },
      )
    },
    async createInventoryLevels(levels) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: levels },
      })
    },
    async updateInventoryLevels(updates) {
      await updateInventoryLevelsWorkflow(container).run({
        input: { updates },
      })
    },
    listBranchCapabilities(handles) {
      return branchCapabilityService.listBranchCapabilities({
        handle: [...handles],
      })
    },
    createBranchCapabilities(capabilities) {
      return branchCapabilityService.createBranchCapabilities(capabilities)
    },
    async updateBranchCapability(id, data) {
      await branchCapabilityService.updateBranchCapabilities(
        buildBranchCapabilityUpdateInput(id, data),
      )
    },
    async listBranchCapabilityLinks(locationIds, capabilityIds) {
      const queries: Array<Promise<OperationalRecord[]>> = []
      if (locationIds.length) {
        queries.push(
          listReferenceRecords(
            container,
            stockLocationBranchCapabilityLink.entryPoint,
            ["id", "stock_location_id", "branch_capability_id"],
            { stock_location_id: [...locationIds] },
          ),
        )
      }
      if (capabilityIds.length) {
        queries.push(
          listReferenceRecords(
            container,
            stockLocationBranchCapabilityLink.entryPoint,
            ["id", "stock_location_id", "branch_capability_id"],
            { branch_capability_id: [...capabilityIds] },
          ),
        )
      }
      const records = (await Promise.all(queries)).flat()
      return dedupeBranchCapabilityLinkRecords(records)
    },
    async dismissStockLocationBranchCapability(
      locationId,
      branchCapabilityId,
    ) {
      const links: LinkDefinition[] = [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          [BRANCH_CAPABILITY_MODULE]: {
            branch_capability_id: branchCapabilityId,
          },
        },
      ]
      await dismissLinksWorkflow(container).run({ input: links })
    },
    async linkStockLocationToBranchCapability(
      locationId,
      branchCapabilityId,
    ) {
      const links: LinkDefinition[] = [
        {
          [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          [BRANCH_CAPABILITY_MODULE]: {
            branch_capability_id: branchCapabilityId,
          },
        },
      ]
      await createLinksWorkflow(container).run({ input: links })
    },
    listRegions(names) {
      return listReferenceRecords(
        container,
        "region",
        ["id", "name", "payment_providers.id"],
        { name: [...names] },
      )
    },
    listPaymentProviders(ids) {
      return listReferenceRecords(
        container,
        "payment_provider",
        ["id"],
        { id: [...ids] },
      )
    },
    async updateRegionPaymentProviders(regionId, providerIds) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: regionId },
          update: { payment_providers: [...providerIds] },
        },
      })
    },
  }
}
