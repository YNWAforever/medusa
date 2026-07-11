import type {
  MedusaRequest,
  MedusaResponse,
  PublishableKeyContext,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import stockLocationBranchCapabilityLink from "../../../links/stock-location-branch-capability"
import { BRANCH_CAPABILITY_MODULE } from "../../../modules/branch-capability"
import BranchCapabilityModuleService from "../../../modules/branch-capability/service"

export interface StoreBranchOption {
  id: string
  handle: string
  name: { en: string; "zh-HK": string }
  district: { en: string; "zh-HK": string }
  leadTimeBusinessDays: number
  compatible: boolean
  reasonCode: "retail_out_of_stock" | "print_not_supported" | null
  shippingOptionId: string
}

export interface BranchCart {
  id: string
  sales_channel_id: string | null
  items: Array<{ variant_id: string | null; quantity: number }>
}

export interface BranchVariant {
  id: string
  manage_inventory: boolean
  inventory_items: Array<{
    required_quantity?: number | null
    inventory: { id: string } | null
  }>
}

export interface BranchCapabilityRecord {
  id: string
  handle: string
  name_en: string
  name_zh_hk: string
  district_en: string
  district_zh_hk: string
  pickup_enabled: boolean
  test_only: boolean
  lead_time_business_days: number
}

export interface BranchCapabilityLink {
  stock_location_id: string
  branch_capability_id: string
}

export interface BranchInventoryLevel {
  inventory_item_id: string
  location_id: string
  available_quantity: number
}

export function buildBranchInventoryLevel(level: {
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
  reserved_quantity: number
}): BranchInventoryLevel {
  return {
    inventory_item_id: level.inventory_item_id,
    location_id: level.location_id,
    available_quantity: level.stocked_quantity - level.reserved_quantity,
  }
}

export interface BranchPickupShippingOption {
  id: string
  name: string
  metadata: Record<string, unknown> | null
}

export interface BranchCompatibilityOperations {
  getCart(
    cartId: string,
    allowedSalesChannelIds: string[],
  ): Promise<BranchCart | null>
  listVariants(variantIds: string[]): Promise<BranchVariant[]>
  listBranchCapabilities(): Promise<BranchCapabilityRecord[]>
  listBranchLinks(): Promise<BranchCapabilityLink[]>
  listInventoryLevels(
    inventoryItemIds: string[],
    locationIds: string[],
  ): Promise<BranchInventoryLevel[]>
  listPickupShippingOptions(
    branchHandles: string[],
  ): Promise<BranchPickupShippingOption[]>
}

type BranchesResponseBody = { branches: StoreBranchOption[] }

interface StoreBranchesHandlerRequest<Scope> {
  query: { cart_id?: unknown }
  scope: Scope
  publishable_key_context?: PublishableKeyContext
}

interface StoreBranchesHandlerResponse {
  json(body: BranchesResponseBody): unknown
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function pickupOptionMatchesBranch(
  option: BranchPickupShippingOption,
  handle: string,
): boolean {
  if (!option.metadata) {
    return false
  }

  const keys = Object.keys(option.metadata).sort()
  return keys.length === 2 &&
    keys[0] === "branch_handle" &&
    keys[1] === "fulfillment_kind" &&
    option.metadata.fulfillment_kind === "pickup" &&
    option.metadata.branch_handle === handle
}

function branchHasInventory(
  cart: BranchCart,
  variantsById: Map<string, BranchVariant>,
  locationId: string,
  levelsByItemAndLocation: Map<string, BranchInventoryLevel>,
): boolean {
  return cart.items.every((line) => {
    if (!line.variant_id) {
      return false
    }

    const variant = variantsById.get(line.variant_id)
    if (!variant) {
      return false
    }
    if (!variant.manage_inventory) {
      return true
    }
    if (variant.inventory_items.length === 0) {
      return false
    }

    return variant.inventory_items.every((inventoryLink) => {
      const inventoryItemId = inventoryLink.inventory?.id
      if (!inventoryItemId) {
        return false
      }

      const level = levelsByItemAndLocation.get(
        `${inventoryItemId}:${locationId}`,
      )
      const requiredQuantity = inventoryLink.required_quantity ?? 1
      return level !== undefined &&
        level.available_quantity >= line.quantity * requiredQuantity
    })
  })
}

export async function evaluateStoreBranches(
  operations: BranchCompatibilityOperations,
  cartId: string,
  allowedSalesChannelIds: string[],
): Promise<BranchesResponseBody> {
  const cart = await operations.getCart(cartId, allowedSalesChannelIds)
  if (!cart) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart ${cartId} was not found`,
    )
  }

  const variantIds = unique(
    cart.items.flatMap((line) => line.variant_id ? [line.variant_id] : []),
  )
  const [variants, capabilities, links] = await Promise.all([
    operations.listVariants(variantIds),
    operations.listBranchCapabilities(),
    operations.listBranchLinks(),
  ])
  const linksByCapabilityId = new Map(
    links.map((link) => [link.branch_capability_id, link]),
  )
  const linkedBranches = capabilities
    .filter((branch) => branch.pickup_enabled && branch.test_only)
    .flatMap((branch) => {
      const link = linksByCapabilityId.get(branch.id)
      return link ? [{ branch, locationId: link.stock_location_id }] : []
    })
    .sort((left, right) => left.branch.handle.localeCompare(right.branch.handle))

  const inventoryItemIds = unique(
    variants.flatMap((variant) =>
      variant.manage_inventory
        ? variant.inventory_items.flatMap((link) =>
          link.inventory ? [link.inventory.id] : [],
        )
        : [],
    ),
  )
  const locationIds = unique(linkedBranches.map(({ locationId }) => locationId))
  const branchHandles = linkedBranches.map(({ branch }) => branch.handle)
  const [levels, shippingOptions] = await Promise.all([
    inventoryItemIds.length > 0 && locationIds.length > 0
      ? operations.listInventoryLevels(inventoryItemIds, locationIds)
      : Promise.resolve([]),
    operations.listPickupShippingOptions(branchHandles),
  ])

  const shippingOptionByHandle = new Map<string, BranchPickupShippingOption>()
  for (const handle of branchHandles) {
    const matches = shippingOptions.filter((option) =>
      pickupOptionMatchesBranch(option, handle),
    )
    if (matches.length !== 1) {
      throw new Error(
        `Pickup shipping option invariant failed for branch ${handle}: expected 1, found ${matches.length}`,
      )
    }
    shippingOptionByHandle.set(handle, matches[0])
  }

  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const levelsByItemAndLocation = new Map(
    levels.map((level) => [
      `${level.inventory_item_id}:${level.location_id}`,
      level,
    ]),
  )

  return {
    branches: linkedBranches.map(({ branch, locationId }) => {
      const compatible = branchHasInventory(
        cart,
        variantsById,
        locationId,
        levelsByItemAndLocation,
      )
      const shippingOption = shippingOptionByHandle.get(branch.handle)
      if (!shippingOption) {
        throw new Error(
          `Pickup shipping option invariant failed for branch ${branch.handle}`,
        )
      }

      return {
        id: branch.id,
        handle: branch.handle,
        name: { en: branch.name_en, "zh-HK": branch.name_zh_hk },
        district: {
          en: branch.district_en,
          "zh-HK": branch.district_zh_hk,
        },
        leadTimeBusinessDays: branch.lead_time_business_days,
        compatible,
        reasonCode: compatible ? null : "retail_out_of_stock",
        shippingOptionId: shippingOption.id,
      }
    }),
  }
}

export function createMedusaBranchCompatibilityOperations(
  scope: MedusaRequest["scope"],
): BranchCompatibilityOperations {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const branchCapabilityService = scope.resolve<BranchCapabilityModuleService>(
    BRANCH_CAPABILITY_MODULE,
  )

  return {
    async getCart(cartId, allowedSalesChannelIds) {
      if (allowedSalesChannelIds.length === 0) {
        return null
      }
      const result = await query.graph({
        entity: "cart",
        fields: [
          "id",
          "sales_channel_id",
          "items.variant_id",
          "items.quantity",
        ],
        filters: {
          id: cartId,
          sales_channel_id: allowedSalesChannelIds,
        },
      })
      return result.data[0] ?? null
    },
    async listVariants(variantIds) {
      if (variantIds.length === 0) {
        return []
      }
      const result = await query.graph({
        entity: "product_variant",
        fields: [
          "id",
          "manage_inventory",
          "inventory_items.required_quantity",
          "inventory_items.inventory.id",
        ],
        filters: { id: variantIds },
      })
      return result.data
    },
    async listBranchCapabilities() {
      const records = await branchCapabilityService.listBranchCapabilities({
        pickup_enabled: true,
        test_only: true,
      })
      return records.map((branch) => ({
        id: branch.id,
        handle: branch.handle,
        name_en: branch.name_en,
        name_zh_hk: branch.name_zh_hk,
        district_en: branch.district_en,
        district_zh_hk: branch.district_zh_hk,
        pickup_enabled: branch.pickup_enabled,
        test_only: branch.test_only,
        lead_time_business_days: branch.lead_time_business_days,
      }))
    },
    async listBranchLinks() {
      const result = await query.graph({
        entity: stockLocationBranchCapabilityLink.entryPoint,
        fields: ["stock_location_id", "branch_capability_id"],
        filters: {},
      })
      return result.data
    },
    async listInventoryLevels(inventoryItemIds, locationIds) {
      const result = await query.graph({
        entity: "inventory_level",
        fields: [
          "inventory_item_id",
          "location_id",
          "stocked_quantity",
          "reserved_quantity",
        ],
        filters: {
          inventory_item_id: inventoryItemIds,
          location_id: locationIds,
        },
      })
      return result.data.map(buildBranchInventoryLevel)
    },
    async listPickupShippingOptions(branchHandles) {
      if (branchHandles.length === 0) {
        return []
      }
      const result = await query.graph({
        entity: "shipping_option",
        fields: ["id", "name", "metadata"],
        filters: {
          name: branchHandles.map((handle) => `Fotomax Pickup ${handle}`),
        },
      })
      return result.data
    },
  }
}

export async function handleStoreBranchesGet<Scope>(
  req: StoreBranchesHandlerRequest<Scope>,
  res: StoreBranchesHandlerResponse,
  createOperations: (scope: Scope) => BranchCompatibilityOperations,
): Promise<void> {
  const cartId = req.query.cart_id
  if (typeof cartId !== "string" || cartId.trim().length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "cart_id is required",
    )
  }
  if (!req.publishable_key_context) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A valid publishable key context is required",
    )
  }

  const result = await evaluateStoreBranches(
    createOperations(req.scope),
    cartId,
    req.publishable_key_context.sales_channel_ids,
  )
  res.json(result)
}

interface StoreBranchesRequest extends MedusaRequest {
  publishable_key_context?: PublishableKeyContext
}

export async function GET(
  req: StoreBranchesRequest,
  res: MedusaResponse<BranchesResponseBody>,
): Promise<void> {
  await handleStoreBranchesGet(
    req,
    res,
    createMedusaBranchCompatibilityOperations,
  )
}
