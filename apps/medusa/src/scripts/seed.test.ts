import { describe, expect, expectTypeOf, it } from "vitest"
import type {
  CreateCollectionsWorkflowInput,
  CreateProductsWorkflowInput,
} from "@medusajs/core-flows"
import type { WorkflowTypes } from "@medusajs/framework/types"

import {
  buildFotomaxProductInputs,
  buildFotomaxSeedPayload,
  reconcileFotomaxReferenceData,
  runFotomaxSeedWorkflows,
  type FotomaxReconcileOperations,
  type FotomaxSeedOperations,
} from "./seed"

function collectionIds() {
  return new Map([
    ["photo-print", "pcol_photo_print"],
    ["photobook", "pcol_photobook"],
    ["personalized-gifts", "pcol_personalized_gifts"],
    ["instax-film", "pcol_instax_film"],
    ["lifestyle", "pcol_lifestyle"],
    ["promotions", "pcol_promotions"],
  ])
}

describe("Fotomax Medusa seed workflows", () => {
  it("builds inputs assignable to the installed Medusa v2 workflow DTOs", () => {
    const payload = buildFotomaxSeedPayload()
    const productInputs = buildFotomaxProductInputs(collectionIds())

    expectTypeOf(payload.regions).toMatchTypeOf<
      WorkflowTypes.RegionWorkflow.CreateRegionsWorkflowInput["regions"]
    >()
    expectTypeOf(payload.collections).toMatchTypeOf<
      CreateCollectionsWorkflowInput["collections"]
    >()
    expectTypeOf(productInputs).toMatchTypeOf<
      CreateProductsWorkflowInput["products"]
    >()
  })

  it("maps shared options into priced variants and workflow collection IDs", () => {
    const photoPrint = buildFotomaxProductInputs(collectionIds()).find(
      (product) => product.handle === "classic-4r-photo-print",
    )

    expect(photoPrint).not.toHaveProperty("collection_handle")
    expect(photoPrint).toMatchObject({
      collection_id: "pcol_photo_print",
      options: [
        {
          title: "Paper finish",
          values: ["Glossy", "Matte"],
        },
      ],
      variants: [
        {
          title: "Glossy",
          options: { "Paper finish": "Glossy" },
          prices: [{ currency_code: "hkd", amount: 2.8 }],
        },
        {
          title: "Matte",
          options: { "Paper finish": "Matte" },
          prices: [{ currency_code: "hkd", amount: 2.8 }],
        },
      ],
    })
    expect(photoPrint?.variants).toHaveLength(2)
  })

  it("uses commerce modes to publish only supported catalog items", () => {
    const productInputs = buildFotomaxProductInputs(collectionIds())

    expect(Object.fromEntries(productInputs.map((product) => [product.handle, product.status]))).toEqual({
      "classic-4r-photo-print": "published",
      "premium-layflat-photobook": "draft",
      "photo-mug-gift": "draft",
      "instax-mini-film-pack": "published",
      "desktop-acrylic-photo-block": "draft",
    })
    expect(productInputs.map((product) => product.metadata)).toEqual([
      expect.objectContaining({ commerce_mode: "photo_print" }),
      expect.objectContaining({ commerce_mode: "deferred" }),
      expect.objectContaining({ commerce_mode: "deferred" }),
      expect.objectContaining({ commerce_mode: "retail" }),
      expect.objectContaining({ commerce_mode: "deferred" }),
    ])
  })

  it("enables inventory management only for retail variants", () => {
    const productInputs = buildFotomaxProductInputs(collectionIds())

    expect(
      Object.fromEntries(
        productInputs.map((product) => [
          product.handle,
          product.variants?.map((variant) => variant.manage_inventory),
        ]),
      ),
    ).toEqual({
      "classic-4r-photo-print": [false, false],
      "premium-layflat-photobook": [false, false],
      "photo-mug-gift": [false, false],
      "instax-mini-film-pack": [true, true],
      "desktop-acrylic-photo-block": [false, false],
    })
  })

  it("keeps every shared price in Medusa major units for every generated variant", () => {
    const productInputs = buildFotomaxProductInputs(collectionIds())

    expect(
      productInputs.map((product) =>
        product.variants?.map((variant) => variant.prices?.[0]?.amount),
      ),
    ).toEqual([
      [2.8, 2.8],
      [198, 198],
      [88, 88],
      [78, 78],
      [128, 128],
    ])
  })

  it("runs regions and collections before products and joins collections by handle", async () => {
    const calls: string[] = []
    let productInput: CreateProductsWorkflowInput | undefined
    const payload = buildFotomaxSeedPayload()
    const operations: FotomaxSeedOperations = {
      async createRegions(input) {
        calls.push("regions")
        expect(input).toEqual({ regions: payload.regions })
        return [{ id: "reg_hk" }]
      },
      async createCollections(input) {
        calls.push("collections")
        expect(input).toEqual({ collections: payload.collections })
        return [...payload.collections].reverse().map((collection) => ({
          id: `pcol_${collection.handle?.replaceAll("-", "_")}`,
          handle: collection.handle!,
        }))
      },
      async createProducts(input) {
        calls.push("products")
        productInput = input
        return input.products.map((product, index) => ({
          id: `prod_${index}`,
          handle: product.handle,
        }))
      },
    }

    const result = await runFotomaxSeedWorkflows(operations)

    expect(calls).toEqual(["regions", "collections", "products"])
    expect(
      productInput?.products.find(
        (product) => product.handle === "classic-4r-photo-print",
      )?.collection_id,
    ).toBe("pcol_photo_print")
    expect(result).toEqual({ regions: 1, collections: 6, products: 5 })
  })

  it("fails before product creation when a collection workflow result is missing", async () => {
    let productsCalled = false
    const operations: FotomaxSeedOperations = {
      async createRegions() {
        return [{ id: "reg_hk" }]
      },
      async createCollections() {
        return [{ id: "pcol_photo_print", handle: "photo-print" }]
      },
      async createProducts() {
        productsCalled = true
        return []
      },
    }

    await expect(runFotomaxSeedWorkflows(operations)).rejects.toThrow(
      "Missing Medusa collection ID for photobook",
    )
    expect(productsCalled).toBe(false)
  })
  it("reconciles queried production records through typed create, update, and link operations", async () => {
    const calls = {
      regionQueries: [] as string[][],
      collectionQueries: [] as string[][],
      productQueries: [] as string[][],
      variantQueries: [] as string[][],
      salesChannelQueries: [] as string[][],
      apiKeyQueries: [] as string[][],
      createRegions: [] as unknown[],
      updateRegions: [] as unknown[],
      createCollections: [] as unknown[],
      updateCollections: [] as unknown[],
      createProducts: [] as unknown[],
      updateProducts: [] as unknown[],
      createSalesChannels: [] as unknown[],
      updateSalesChannels: [] as unknown[],
      createApiKeys: [] as unknown[],
      updateApiKeys: [] as unknown[],
      productLinks: [] as unknown[],
      apiKeyLinks: [] as unknown[],
    }

    const operations: FotomaxReconcileOperations = {
      async listRegions(names) {
        calls.regionQueries.push([...names])
        return [{ id: "reg_hk", name: "Hong Kong" }]
      },
      async createRegions(input) {
        calls.createRegions.push(input)
        return []
      },
      async updateRegions(input) {
        calls.updateRegions.push(input)
        return []
      },
      async listCollections(handles) {
        calls.collectionQueries.push([...handles])
        return [{ id: "pcol_photo_print", handle: "photo-print" }]
      },
      async createCollections(input) {
        calls.createCollections.push(input)
        return input.collections.map((collection) => ({
          id: `pcol_${collection.handle?.replaceAll("-", "_")}`,
          handle: collection.handle!,
        }))
      },
      async updateCollections(input) {
        calls.updateCollections.push(input)
        return []
      },
      async listProducts(handles) {
        calls.productQueries.push([...handles])
        return [
          {
            id: "prod_photo",
            handle: "classic-4r-photo-print",
            variants: [],
            sales_channels: [],
          },
        ]
      },
      async listVariants(skus) {
        calls.variantQueries.push([...skus])
        return [
          {
            id: "variant_glossy",
            sku: "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
          },
        ]
      },
      async createProducts(input) {
        calls.createProducts.push(input)
        return input.products.map((product, index) => ({
          id:
            product.handle === "instax-mini-film-pack"
              ? "prod_instax"
              : `prod_created_${index}`,
          handle: product.handle!,
          sales_channels: [],
        }))
      },
      async updateProducts(input) {
        calls.updateProducts.push(input)
        return []
      },
      async listSalesChannels(names) {
        calls.salesChannelQueries.push([...names])
        return []
      },
      async createSalesChannels(input) {
        calls.createSalesChannels.push(input)
        return [{ id: "sc_staging", name: input.salesChannelsData[0].name }]
      },
      async updateSalesChannels(input) {
        calls.updateSalesChannels.push(input)
        return []
      },
      async listApiKeys(titles) {
        calls.apiKeyQueries.push([...titles])
        return []
      },
      async createApiKeys(input) {
        calls.createApiKeys.push(input)
        return [
          {
            id: "apk_staging",
            title: input.api_keys[0].title,
            sales_channels: [],
          },
        ]
      },
      async updateApiKeys(input) {
        calls.updateApiKeys.push(input)
        return []
      },
      async linkProductsToSalesChannel(input) {
        calls.productLinks.push(input)
      },
      async linkSalesChannelsToApiKey(input) {
        calls.apiKeyLinks.push(input)
      },
    }

    await reconcileFotomaxReferenceData(operations)

    expect(calls.regionQueries).toEqual([["Hong Kong"]])
    expect(calls.collectionQueries[0]).toHaveLength(6)
    expect(calls.productQueries[0]).toHaveLength(5)
    expect(calls.variantQueries[0]).toHaveLength(10)
    expect(calls.variantQueries[0]).toContain(
      "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
    )
    expect(calls.salesChannelQueries).toEqual([
      ["Fotomax Hong Kong Staging"],
    ])
    expect(calls.apiKeyQueries).toEqual([["Fotomax Storefront Staging"]])

    expect(calls.createRegions).toEqual([])
    expect(calls.updateRegions).toEqual([
      {
        selector: { id: "reg_hk" },
        update: {
          name: "Hong Kong",
          currency_code: "hkd",
          countries: ["hk"],
        },
      },
    ])
    expect(calls.createCollections).toHaveLength(1)
    expect(calls.updateCollections).toHaveLength(1)
    expect(calls.createProducts).toHaveLength(1)
    expect(calls.updateProducts).toHaveLength(1)

    const updateInput = calls.updateProducts[0] as {
      products: Array<{
        id: string
        handle: string
        variants: Array<{ id?: string; sku?: string }>
      }>
    }
    const updatedPhoto = updateInput.products[0]
    expect(updatedPhoto).toMatchObject({
      id: "prod_photo",
      handle: "classic-4r-photo-print",
    })
    expect(
      updatedPhoto.variants.find(
        (variant) => variant.sku === "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
      ),
    ).toMatchObject({ id: "variant_glossy" })
    expect(
      updatedPhoto.variants.find(
        (variant) => variant.sku === "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-2",
      ),
    ).not.toHaveProperty("id")

    expect(calls.createSalesChannels).toEqual([
      {
        salesChannelsData: [{ name: "Fotomax Hong Kong Staging" }],
      },
    ])
    expect(calls.productLinks).toEqual([
      {
        id: "sc_staging",
        add: expect.arrayContaining(["prod_photo", "prod_instax"]),
        remove: [],
      },
    ])
    expect(
      (calls.productLinks[0] as { add: string[] }).add,
    ).toHaveLength(2)

    expect(calls.createApiKeys).toEqual([
      {
        api_keys: [
          {
            title: "Fotomax Storefront Staging",
            type: "publishable",
            created_by: "fotomax-seed",
          },
        ],
      },
    ])
    expect(calls.apiKeyLinks).toEqual([
      {
        id: "apk_staging",
        add: ["sc_staging"],
        remove: [],
      },
    ])
  })
})
