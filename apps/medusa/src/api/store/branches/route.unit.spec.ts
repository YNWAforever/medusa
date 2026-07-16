import { MedusaError } from "@medusajs/framework/utils"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../../links/stock-location-branch-capability", () => ({
  default: { entryPoint: "stock_location_branch_capability" },
}))
import {
  buildBranchInventoryLevel,
  evaluateStoreBranches,
  handleStoreBranchesGet,
  type BranchCompatibilityOperations,
} from "./route"

describe("branch inventory query normalization", () => {
  it("derives available quantity from stored stock and reservations", () => {
    expect(
      buildBranchInventoryLevel({
        inventory_item_id: "iitem_1",
        location_id: "sloc_1",
        stocked_quantity: 25,
        reserved_quantity: 3,
      }),
    ).toEqual({
      inventory_item_id: "iitem_1",
      location_id: "sloc_1",
      available_quantity: 22,
    })
  })
})

const branches = [
  {
    id: "brcap_central",
    handle: "central",
    name_en: "Central",
    name_zh_hk: "中環",
    district_en: "Central and Western",
    district_zh_hk: "中西區",
    pickup_enabled: true,
    test_only: true,
    lead_time_business_days: 1,
  },
  {
    id: "brcap_mong-kok",
    handle: "mong-kok",
    name_en: "Mong Kok",
    name_zh_hk: "旺角",
    district_en: "Yau Tsim Mong",
    district_zh_hk: "油尖旺區",
    pickup_enabled: true,
    test_only: true,
    lead_time_business_days: 2,
  },
  {
    id: "brcap_sha-tin",
    handle: "sha-tin",
    name_en: "Sha Tin",
    name_zh_hk: "沙田",
    district_en: "Sha Tin",
    district_zh_hk: "沙田區",
    pickup_enabled: true,
    test_only: true,
    lead_time_business_days: 3,
  },
]

function operations(
  overrides: Partial<BranchCompatibilityOperations> = {},
): BranchCompatibilityOperations {
  return {
    async getCart() {
      return {
        id: "cart_123",
        sales_channel_id: "sc_staging",
        items: [{ variant_id: "variant_frame", quantity: 2 }],
      }
    },
    async listVariants() {
      return [
        {
          id: "variant_frame",
          manage_inventory: true,
          inventory_items: [
            {
              required_quantity: 1,
              inventory: { id: "iitem_frame" },
            },
          ],
        },
      ]
    },
    async listBranchCapabilities() {
      return branches
    },
    async listBranchLinks() {
      return branches.map((branch) => ({
        stock_location_id: `sloc_${branch.handle}`,
        branch_capability_id: branch.id,
      }))
    },
    async listInventoryLevels() {
      return branches.map((branch) => ({
        inventory_item_id: "iitem_frame",
        location_id: `sloc_${branch.handle}`,
        available_quantity: 10,
      }))
    },
    async listPickupShippingOptions() {
      return branches.map((branch) => ({
        id: `so_${branch.handle}`,
        name: `Fotomax Pickup ${branch.handle}`,
        metadata: {
          fulfillment_kind: "pickup",
          branch_handle: branch.handle,
        },
      }))
    },
    ...overrides,
  }
}

async function expectMedusaError(
  action: () => Promise<unknown>,
  type: string,
) {
  await expect(action()).rejects.toMatchObject({ type })
}

describe("GET /store/branches", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or blank cart_id (%s)",
    async (cartId) => {
      const createOperations = vi.fn(() => operations())

      await expectMedusaError(
        () =>
          handleStoreBranchesGet(
            {
              query: cartId === undefined ? {} : { cart_id: cartId },
              scope: {},
              publishable_key_context: {
                key: "pk_test",
                sales_channel_ids: ["sc_staging"],
              },
            },
            { json: vi.fn() },
            createOperations,
          ),
        MedusaError.Types.INVALID_DATA,
      )
      expect(createOperations).not.toHaveBeenCalled()
    },
  )

  it("defensively rejects a missing publishable-key context", async () => {
    await expectMedusaError(
      () =>
        handleStoreBranchesGet(
          { query: { cart_id: "cart_123" }, scope: {} },
          { json: vi.fn() },
          () => operations(),
        ),
      MedusaError.Types.NOT_ALLOWED,
    )
  })
})

describe("evaluateStoreBranches", () => {
  it("treats a missing cart or sales-channel mismatch as not found", async () => {
    const getCart = vi.fn(async () => null)

    await expectMedusaError(
      () =>
        evaluateStoreBranches(
          operations({ getCart }),
          "cart_123",
          ["sc_allowed"],
        ),
      MedusaError.Types.NOT_FOUND,
    )
    expect(getCart).toHaveBeenCalledWith("cart_123", ["sc_allowed"])
  })

  it("projects all bilingual branches with their pickup shipping options", async () => {
    const result = await evaluateStoreBranches(
      operations(),
      "cart_123",
      ["sc_staging"],
    )

    expect(result).toEqual({
      branches: [
        {
          id: "brcap_central",
          handle: "central",
          name: { en: "Central", "zh-HK": "中環" },
          district: {
            en: "Central and Western",
            "zh-HK": "中西區",
          },
          leadTimeBusinessDays: 1,
          compatible: true,
          reasonCode: null,
          shippingOptionId: "so_central",
        },
        {
          id: "brcap_mong-kok",
          handle: "mong-kok",
          name: { en: "Mong Kok", "zh-HK": "旺角" },
          district: { en: "Yau Tsim Mong", "zh-HK": "油尖旺區" },
          leadTimeBusinessDays: 2,
          compatible: true,
          reasonCode: null,
          shippingOptionId: "so_mong-kok",
        },
        {
          id: "brcap_sha-tin",
          handle: "sha-tin",
          name: { en: "Sha Tin", "zh-HK": "沙田" },
          district: { en: "Sha Tin", "zh-HK": "沙田區" },
          leadTimeBusinessDays: 3,
          compatible: true,
          reasonCode: null,
          shippingOptionId: "so_sha-tin",
        },
      ],
    })
  })

  it("marks only the branch below the required available quantity out of stock", async () => {
    const result = await evaluateStoreBranches(
      operations({
        async listInventoryLevels() {
          return branches.map((branch) => ({
            inventory_item_id: "iitem_frame",
            location_id: `sloc_${branch.handle}`,
            available_quantity: branch.handle === "mong-kok" ? 1 : 2,
          }))
        },
      }),
      "cart_123",
      ["sc_staging"],
    )

    expect(result.branches.map(({ handle, compatible, reasonCode }) => ({
      handle,
      compatible,
      reasonCode,
    }))).toEqual([
      { handle: "central", compatible: true, reasonCode: null },
      {
        handle: "mong-kok",
        compatible: false,
        reasonCode: "retail_out_of_stock",
      },
      { handle: "sha-tin", compatible: true, reasonCode: null },
    ])
  })

  it("does not block unmanaged photo-print lines or emit print_not_supported", async () => {
    const result = await evaluateStoreBranches(
      operations({
        async getCart() {
          return {
            id: "cart_123",
            sales_channel_id: "sc_staging",
            items: [{ variant_id: "variant_photo", quantity: 100 }],
          }
        },
        async listVariants() {
          return [{
            id: "variant_photo",
            manage_inventory: false,
            inventory_items: [],
          }]
        },
        async listInventoryLevels() {
          return []
        },
      }),
      "cart_123",
      ["sc_staging"],
    )

    expect(result.branches.every((branch) => branch.compatible)).toBe(true)
    expect(result.branches.every((branch) => branch.reasonCode === null)).toBe(true)
  })

  it.each([
    ["variant", async () => []],
    [
      "inventory link",
      async () => [{
        id: "variant_frame",
        manage_inventory: true,
        inventory_items: [],
      }],
    ],
  ])("marks a missing managed %s incompatible", async (_case, listVariants) => {
    const result = await evaluateStoreBranches(
      operations({ listVariants }),
      "cart_123",
      ["sc_staging"],
    )

    expect(result.branches.every((branch) => !branch.compatible)).toBe(true)
    expect(
      result.branches.every(
        (branch) => branch.reasonCode === "retail_out_of_stock",
      ),
    ).toBe(true)
  })

  it("marks only a branch with a missing managed inventory level incompatible", async () => {
    const result = await evaluateStoreBranches(
      operations({
        async listInventoryLevels() {
          return branches
            .filter((branch) => branch.handle !== "sha-tin")
            .map((branch) => ({
              inventory_item_id: "iitem_frame",
              location_id: `sloc_${branch.handle}`,
              available_quantity: 10,
            }))
        },
      }),
      "cart_123",
      ["sc_staging"],
    )

    expect(result.branches.find((branch) => branch.handle === "sha-tin"))
      .toMatchObject({
        compatible: false,
        reasonCode: "retail_out_of_stock",
      })
  })

  it.each(["missing", "duplicate"])(
    "throws on a %s pickup shipping option invariant",
    async (caseName) => {
      const options = operations()
      const baseOptions = await options.listPickupShippingOptions(
        branches.map((branch) => branch.handle),
      )
      const pickupOptions = caseName === "missing"
        ? baseOptions.slice(1)
        : [...baseOptions, baseOptions[0]]

      await expect(
        evaluateStoreBranches(
          operations({
            async listPickupShippingOptions() {
              return pickupOptions
            },
          }),
          "cart_123",
          ["sc_staging"],
        ),
      ).rejects.toThrow(/shipping option invariant/i)
    },
  )
})
