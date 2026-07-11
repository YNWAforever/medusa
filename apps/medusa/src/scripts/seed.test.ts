import { describe, expect, expectTypeOf, it } from "vitest"
import type {
  CreateCollectionsWorkflowInput,
  CreateProductsWorkflowInput,
} from "@medusajs/core-flows"
import type { WorkflowTypes } from "@medusajs/framework/types"

import {
  buildFotomaxProductInputs,
  buildFotomaxSeedPayload,
  runFotomaxSeedWorkflows,
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
})
