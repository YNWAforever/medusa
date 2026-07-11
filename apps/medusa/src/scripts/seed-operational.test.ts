import { describe, expect, it } from "vitest"

import {
  reconcileExclusiveLinks,
  reconcileFotomaxOperationalData,
  type FotomaxOperationalOperations,
} from "./seed-operational"
import {
  retailInventoryPerBranch,
  retailInventorySkus,
  stagingBranches,
  supportedPrintSkus,
} from "./seed-data"

function operationalOperations(
  overrides: Partial<FotomaxOperationalOperations>,
): FotomaxOperationalOperations {
  const unexpected = (name: string) => {
    throw new Error(`Unexpected operational call: ${name}`)
  }

  return {
    async listSalesChannels() {
      return [{ id: "sc_staging", name: "Fotomax Hong Kong Staging" }]
    },
    async listStockLocations() {
      return []
    },
    async createStockLocations() {
      return unexpected("createStockLocations")
    },
    async updateStockLocation() {},
    async linkSalesChannelToStockLocation() {
      return unexpected("linkSalesChannelToStockLocation")
    },
    async listFulfillmentSets() {
      return []
    },
    async createLocationFulfillmentSet() {
      return unexpected("createLocationFulfillmentSet")
    },
    async updateFulfillmentSet() {},
    async listFulfillmentSetLocationLinks() {
      return []
    },
    async dismissFulfillmentSetFromStockLocation() {
      return unexpected("dismissFulfillmentSetFromStockLocation")
    },
    async linkFulfillmentSetToStockLocation() {
      return unexpected("linkFulfillmentSetToStockLocation")
    },
    async updateServiceZone() {},
    async createServiceZone() {
      return unexpected("createServiceZone")
    },
    async listShippingProfiles() {
      return []
    },
    async createShippingProfile() {
      return unexpected("createShippingProfile")
    },
    async updateShippingProfile() {},
    async listShippingOptions() {
      return []
    },
    async createShippingOption() {
      return unexpected("createShippingOption")
    },
    async updateShippingOption() {},
    async listFulfillmentProviders() {
      return [{ id: "manual_manual" }]
    },
    async listProductVariants() {
      return []
    },
    async listInventoryItems() {
      return []
    },
    async createInventoryItems() {
      return unexpected("createInventoryItems")
    },
    async linkVariantToInventoryItem() {
      return unexpected("linkVariantToInventoryItem")
    },
    async listInventoryLevels() {
      return []
    },
    async createInventoryLevels() {
      return unexpected("createInventoryLevels")
    },
    async updateInventoryLevels() {},
    async listBranchCapabilities() {
      return []
    },
    async createBranchCapabilities() {
      return unexpected("createBranchCapabilities")
    },
    async updateBranchCapability() {},
    async listBranchCapabilityLinks() {
      return []
    },
    async dismissStockLocationBranchCapability() {
      return unexpected("dismissStockLocationBranchCapability")
    },
    async linkStockLocationToBranchCapability() {
      return unexpected("linkStockLocationToBranchCapability")
    },
    async listRegions() {
      return [
        {
          id: "reg_hk",
          name: "Hong Kong",
          payment_providers: [{ id: "pp_existing" }],
        },
      ]
    },
    async listPaymentProviders() {
      return [{ id: "pp_system_default" }]
    },
    async updateRegionPaymentProviders() {},
    ...overrides,
  }
}

describe("Fotomax operational seed reconciliation", () => {
  it("creates staging fulfillment, retail inventory, capabilities, and the HK payment association", async () => {
    const createdLocations: Parameters<
      FotomaxOperationalOperations["createStockLocations"]
    >[0] = []
    const createdSets: Parameters<
      FotomaxOperationalOperations["createLocationFulfillmentSet"]
    >[] = []
    const createdZones: Parameters<
      FotomaxOperationalOperations["createServiceZone"]
    >[0][] = []
    const createdOptions: Parameters<
      FotomaxOperationalOperations["createShippingOption"]
    >[0][] = []
    const createdItems: Parameters<
      FotomaxOperationalOperations["createInventoryItems"]
    >[0] = []
    const createdLevels: Parameters<
      FotomaxOperationalOperations["createInventoryLevels"]
    >[0] = []
    const createdCapabilities: Parameters<
      FotomaxOperationalOperations["createBranchCapabilities"]
    >[0] = []
    const salesChannelLinks: Array<[string, string]> = []
    const variantLinks: Array<[string, string]> = []
    const capabilityLinks: Array<[string, string]> = []
    const paymentUpdates: string[][] = []

    const operations = operationalOperations({
      async createStockLocations(locations) {
        createdLocations.push(...locations)
        return locations.map((location, index) => ({
          ...location,
          id: `sloc_${index + 1}`,
          sales_channels: [],
          fulfillment_sets: [],
        }))
      },
      async linkSalesChannelToStockLocation(locationId, salesChannelId) {
        salesChannelLinks.push([locationId, salesChannelId])
      },
      async createLocationFulfillmentSet(locationId, data) {
        createdSets.push([locationId, data])
        return {
          id: `fuset_${createdSets.length}`,
          ...data,
          service_zones: [],
        }
      },
      async createServiceZone(data) {
        createdZones.push(data)
        return { id: `serzo_${createdZones.length}`, ...data }
      },
      async createShippingProfile(data) {
        return { id: "sp_fotomax", ...data }
      },
      async createShippingOption(data) {
        createdOptions.push(data)
        return {
          id: `so_${createdOptions.length}`,
          ...data,
          metadata: {},
        }
      },
      async listProductVariants(skus) {
        return skus.map((sku, index) => ({
          id: `variant_${index + 1}`,
          sku,
          inventory_items: [],
        }))
      },
      async createInventoryItems(items) {
        createdItems.push(...items)
        return items.map((item) => ({
          ...item,
          id: `iitem_${item.sku}`,
        }))
      },
      async linkVariantToInventoryItem(variantId, inventoryItemId) {
        variantLinks.push([variantId, inventoryItemId])
      },
      async createInventoryLevels(levels) {
        createdLevels.push(...levels)
      },
      async createBranchCapabilities(capabilities) {
        createdCapabilities.push(...capabilities)
        return capabilities.map((capability) => ({
          ...capability,
          id: `brcap_${capability.handle}`,
        }))
      },
      async linkStockLocationToBranchCapability(
        locationId,
        branchCapabilityId,
      ) {
        capabilityLinks.push([locationId, branchCapabilityId])
      },
      async updateRegionPaymentProviders(_regionId, providerIds) {
        paymentUpdates.push([...providerIds])
      },
    })

    await reconcileFotomaxOperationalData(operations)

    expect(createdLocations).toHaveLength(3)
    expect(createdLocations).toEqual(
      stagingBranches.map((branch) =>
        expect.objectContaining({
          metadata: { branch_handle: branch.handle },
          address: {
            address_1: "Staging Test Location - No Customer Visits",
            city: branch.district.en,
            country_code: "hk",
          },
        }),
      ),
    )
    expect(salesChannelLinks).toHaveLength(3)
    expect(createdSets).toHaveLength(4)
    expect(createdZones).toHaveLength(4)
    expect(
      createdZones.every((zone) =>
        zone.geo_zones.some(
          (geoZone) =>
            geoZone.type === "country" && geoZone.country_code === "hk",
        ),
      ),
    ).toBe(true)

    expect(createdOptions).toHaveLength(4)
    expect(
      createdOptions.find(
        (option) => option.name === "Fotomax Hong Kong Delivery",
      )?.prices,
    ).toEqual([{ currency_code: "hkd", amount: 40 }])
    for (const branch of stagingBranches) {
      const pickup = createdOptions.find(
        (option) => option.name === `Fotomax Pickup ${branch.handle}`,
      )
      expect(pickup?.prices).toEqual([{ currency_code: "hkd", amount: 0 }])
      expect(pickup?.metadata).toEqual({
        fulfillment_kind: "pickup",
        branch_handle: branch.handle,
      })
    }

    expect(createdItems.map((item) => item.sku)).toEqual(retailInventorySkus)
    expect(createdLevels).toHaveLength(
      retailInventorySkus.length * stagingBranches.length,
    )
    expect(
      createdLevels.every(
        (level) => level.stocked_quantity === retailInventoryPerBranch,
      ),
    ).toBe(true)
    expect(
      createdLevels.every((level) =>
        retailInventorySkus.some((sku) =>
          level.inventory_item_id.endsWith(sku),
        ),
      ),
    ).toBe(true)
    expect(variantLinks).toHaveLength(retailInventorySkus.length)

    expect(createdCapabilities).toHaveLength(3)
    expect(capabilityLinks).toHaveLength(3)
    expect(paymentUpdates).toEqual([
      ["pp_existing", "pp_system_default"],
    ])
  })

  it("creates or links nothing for an already reconciled second state", async () => {
    const locations = stagingBranches.map((branch, index) => ({
      id: `sloc_${index + 1}`,
      name: `Fotomax Staging ${branch.handle}`,
      metadata: { branch_handle: branch.handle },
      address: {
        address_1: "Staging Test Location - No Customer Visits",
        city: branch.district.en,
        country_code: "hk",
      },
      sales_channels: [{ id: "sc_staging" }],
      fulfillment_sets: [
        { id: `fuset_pickup_${branch.handle}` },
        ...(index === 0 ? [{ id: "fuset_delivery" }] : []),
      ],
    }))
    const pickupSets = stagingBranches.map((branch) => ({
      id: `fuset_pickup_${branch.handle}`,
      name: `Fotomax Pickup ${branch.handle}`,
      type: "pickup",
      service_zones: [
        {
          id: `serzo_pickup_${branch.handle}`,
          name: `Fotomax Pickup HK ${branch.handle}`,
          fulfillment_set_id: `fuset_pickup_${branch.handle}`,
          geo_zones: [
            {
              id: `geozone_pickup_${branch.handle}`,
              type: "country",
              country_code: "hk",
            },
          ],
        },
      ],
    }))
    const deliverySet = {
      id: "fuset_delivery",
      name: "Fotomax Hong Kong Delivery",
      type: "shipping",
      service_zones: [
        {
          id: "serzo_delivery",
          name: "Fotomax Hong Kong Delivery Zone",
          fulfillment_set_id: "fuset_delivery",
          geo_zones: [
            {
              id: "geozone_delivery",
              type: "country",
              country_code: "hk",
            },
          ],
        },
      ],
    }
    const inventoryItems = retailInventorySkus.map((sku) => ({
      id: `iitem_${sku}`,
      sku,
    }))
    const createCalls: string[] = []
    const linkCalls: string[] = []
    const serviceZoneUpdates: Array<
      Parameters<FotomaxOperationalOperations["updateServiceZone"]>
    > = []
    const paymentUpdates: string[][] = []

    const operations = operationalOperations({
      async listStockLocations() {
        return locations
      },
      async createStockLocations() {
        createCalls.push("stock-location")
        return []
      },
      async linkSalesChannelToStockLocation() {
        linkCalls.push("sales-channel")
      },
      async listFulfillmentSets() {
        return [...pickupSets, deliverySet]
      },
      async listFulfillmentSetLocationLinks() {
        return [
          ...pickupSets.map((set, index) => ({
            id: "locfs_pickup_" + index,
            stock_location_id: locations[index].id,
            fulfillment_set_id: set.id,
          })),
          {
            id: "locfs_delivery",
            stock_location_id: locations[0].id,
            fulfillment_set_id: deliverySet.id,
          },
        ]
      },
      async createLocationFulfillmentSet() {
        createCalls.push("fulfillment-set")
        return deliverySet
      },
      async linkFulfillmentSetToStockLocation() {
        linkCalls.push("fulfillment-set")
      },
      async updateServiceZone(...args) {
        serviceZoneUpdates.push(args)
      },
      async createServiceZone() {
        createCalls.push("service-zone")
        return deliverySet.service_zones[0]
      },
      async listShippingProfiles() {
        return [{ id: "sp_fotomax", name: "Fotomax Standard", type: "default" }]
      },
      async createShippingProfile() {
        createCalls.push("shipping-profile")
        return { id: "sp_new", name: "unexpected", type: "default" }
      },
      async listShippingOptions() {
        return [
          {
            id: "so_delivery",
            name: "Fotomax Hong Kong Delivery",
            service_zone_id: "serzo_delivery",
            shipping_profile_id: "sp_fotomax",
            provider_id: "manual_manual",
            price_type: "flat",
            prices: [{ currency_code: "hkd", amount: 40 }],
            type: { label: "HK Delivery", code: "fotomax-hk-delivery" },
            metadata: {},
          },
          ...stagingBranches.map((branch) => ({
            id: `so_pickup_${branch.handle}`,
            name: `Fotomax Pickup ${branch.handle}`,
            service_zone_id: `serzo_pickup_${branch.handle}`,
            shipping_profile_id: "sp_fotomax",
            provider_id: "manual_manual",
            price_type: "flat" as const,
            prices: [{ currency_code: "hkd", amount: 0 }],
            type: {
              label: branch.name.en,
              code: `fotomax-pickup-${branch.handle}`,
            },
            metadata: {
              fulfillment_kind: "pickup",
              branch_handle: branch.handle,
            },
          })),
        ]
      },
      async createShippingOption() {
        createCalls.push("shipping-option")
        return {
          id: "so_new",
          name: "unexpected",
          service_zone_id: "",
          shipping_profile_id: "",
          provider_id: "",
          price_type: "flat",
          prices: [],
          type: { label: "", code: "" },
          metadata: {},
        }
      },
      async listProductVariants(skus) {
        return skus.map((sku, index) => ({
          id: `variant_${index + 1}`,
          sku,
          inventory_items: inventoryItems
            .filter((item) => item.sku === sku)
            .map((inventory) => ({ inventory })),
        }))
      },
      async listInventoryItems() {
        return inventoryItems
      },
      async createInventoryItems() {
        createCalls.push("inventory-item")
        return []
      },
      async linkVariantToInventoryItem() {
        linkCalls.push("variant-inventory")
      },
      async listInventoryLevels() {
        return inventoryItems.flatMap((item) =>
          locations.map((location, index) => ({
            id: `iilev_${item.sku}_${index + 1}`,
            inventory_item_id: item.id,
            location_id: location.id,
            stocked_quantity: retailInventoryPerBranch,
          })),
        )
      },
      async createInventoryLevels() {
        createCalls.push("inventory-level")
      },
      async listBranchCapabilities() {
        return stagingBranches.map((branch) => ({
          id: `brcap_${branch.handle}`,
          handle: branch.handle,
          name_en: branch.name.en,
          name_zh_hk: branch.name["zh-HK"],
          district_en: branch.district.en,
          district_zh_hk: branch.district["zh-HK"],
          pickup_enabled: branch.pickupEnabled,
          test_only: branch.testOnly,
          lead_time_business_days: branch.leadTimeBusinessDays,
          supported_print_skus: [...supportedPrintSkus],
        }))
      },
      async createBranchCapabilities() {
        createCalls.push("branch-capability")
        return []
      },
      async listBranchCapabilityLinks() {
        return stagingBranches.map((branch, index) => ({
          id: `link_${branch.handle}`,
          stock_location_id: locations[index].id,
          branch_capability_id: `brcap_${branch.handle}`,
        }))
      },
      async linkStockLocationToBranchCapability() {
        linkCalls.push("branch-capability")
      },
      async updateRegionPaymentProviders(_regionId, providerIds) {
        paymentUpdates.push([...providerIds])
      },
    })

    await reconcileFotomaxOperationalData(operations)

    expect(createCalls).toEqual([])
    expect(linkCalls).toEqual([])
    expect(serviceZoneUpdates).toEqual([])
    expect(paymentUpdates).toEqual([
      ["pp_existing", "pp_system_default"],
    ])
  })

  it("repairs swapped pickup and misplaced delivery links", async () => {
    const dismissed: string[] = []
    const created: string[] = []

    await reconcileExclusiveLinks({
      desired: [
        { leftId: "sloc_central", rightId: "fuset_central" },
        { leftId: "sloc_mong_kok", rightId: "fuset_mong_kok" },
        { leftId: "sloc_central", rightId: "fuset_delivery" },
      ],
      existing: [
        { leftId: "sloc_mong_kok", rightId: "fuset_central" },
        { leftId: "sloc_central", rightId: "fuset_mong_kok" },
        { leftId: "sloc_sha_tin", rightId: "fuset_delivery" },
      ],
      leftExclusive: false,
      rightExclusive: true,
      async dismiss(link) {
        dismissed.push(link.leftId + ":" + link.rightId)
      },
      async create(link) {
        created.push(link.leftId + ":" + link.rightId)
      },
    })

    expect(dismissed).toEqual([
      "sloc_mong_kok:fuset_central",
      "sloc_central:fuset_mong_kok",
      "sloc_sha_tin:fuset_delivery",
    ])
    expect(created).toEqual([
      "sloc_central:fuset_central",
      "sloc_mong_kok:fuset_mong_kok",
      "sloc_central:fuset_delivery",
    ])
  })

  it("repairs cross-wired one-to-one branch capability links", async () => {
    const dismissed: string[] = []
    const created: string[] = []

    await reconcileExclusiveLinks({
      desired: [
        { leftId: "sloc_central", rightId: "brcap_central" },
        { leftId: "sloc_mong_kok", rightId: "brcap_mong_kok" },
        { leftId: "sloc_sha_tin", rightId: "brcap_sha_tin" },
      ],
      existing: [
        { leftId: "sloc_central", rightId: "brcap_mong_kok" },
        { leftId: "sloc_mong_kok", rightId: "brcap_central" },
        { leftId: "sloc_sha_tin", rightId: "brcap_sha_tin" },
      ],
      leftExclusive: true,
      rightExclusive: true,
      async dismiss(link) {
        dismissed.push(link.leftId + ":" + link.rightId)
      },
      async create(link) {
        created.push(link.leftId + ":" + link.rightId)
      },
    })

    expect(dismissed).toEqual([
      "sloc_central:brcap_mong_kok",
      "sloc_mong_kok:brcap_central",
    ])
    expect(created).toEqual([
      "sloc_central:brcap_central",
      "sloc_mong_kok:brcap_mong_kok",
    ])
  })
})
