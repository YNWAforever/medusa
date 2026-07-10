import { describe, expect, it } from "vitest"
import type { ExecArgs } from "@medusajs/framework/types"

import seedFotomax, { buildFotomaxSeedPayload } from "./seed"

describe("Fotomax Medusa seed payload", () => {
  it("maps the bilingual catalog into Hong Kong commerce data", () => {
    const payload = buildFotomaxSeedPayload()
    const photoPrint = payload.products.find(
      (product) => product.handle === "classic-4r-photo-print",
    )

    expect(payload.region).toEqual({
      name: "Hong Kong",
      currency_code: "hkd",
      countries: ["hk"],
    })
    expect(payload.collections).toHaveLength(6)
    expect(payload.products).toHaveLength(5)
    expect(payload.service_entries).toHaveLength(3)
    expect(photoPrint?.variants[0].prices[0]).toEqual({
      currency_code: "hkd",
      amount: 2.8,
    })
    expect(photoPrint?.metadata.title_zh_hk).toBe("經典 4R 相片沖印")
  })

  it("keeps English and Traditional Chinese metadata adjacent", () => {
    const payload = buildFotomaxSeedPayload()
    const collection = payload.collections.find(
      (entry) => entry.handle === "personalized-gifts",
    )
    const product = payload.products.find(
      (entry) => entry.handle === "photo-mug-gift",
    )
    const service = payload.service_entries.find(
      (entry) => entry.handle === "store-pickup",
    )

    expect(collection).toMatchObject({
      title: "Personalized Gifts",
      metadata: {
        title_zh_hk: "個人化禮品",
        summary_en: "Mugs, puzzles, frames, and personal keepsakes.",
        summary_zh_hk: "杯、拼圖、座枱相架及客製心意。",
      },
    })
    expect(product).toMatchObject({
      title: "Personalized Photo Mug",
      description: "Print a favorite image on an everyday ceramic mug.",
      metadata: {
        title_zh_hk: "個人化相片杯",
        description_zh_hk: "把喜愛相片印在日常使用的陶瓷杯上。",
        badge_en: "Gift pick",
        badge_zh_hk: "送禮精選",
      },
    })
    expect(service).toMatchObject({
      title: "Store Pickup & Collection",
      title_zh_hk: "門市取貨及分店服務",
      status: "next-phase",
    })
  })

  it("converts every shared integer price from cents to major units once", () => {
    const payload = buildFotomaxSeedPayload()

    expect(
      payload.products.map((product) => product.variants[0].prices[0].amount),
    ).toEqual([2.8, 198, 88, 78, 128])
  })

  it("logs prepared record counts through the Medusa container logger", async () => {
    const messages: string[] = []
    const container = {
      resolve: () => ({
        info: (message: string) => messages.push(message),
      }),
    } as unknown as ExecArgs["container"]

    await seedFotomax({ container, args: [] })

    expect(messages).toEqual([
      "Prepared 6 collections for Fotomax",
      "Prepared 5 products for Fotomax",
      "Prepared 3 service entries for Fotomax",
    ])
  })
})
