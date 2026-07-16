import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getBranchAvailability, type BranchStoreClient } from "./branches"

const rawBranches = [{
  id: "branch_central", handle: "central-staging",
  name: { en: "Central Staging Pickup", "zh-HK": "中環測試取貨點" },
  district: { en: "Central", "zh-HK": "中環" },
  leadTimeBusinessDays: 2, compatible: true, reasonCode: null, shippingOptionId: "so_central",
}]

function client(payload: unknown = { branches: rawBranches }): BranchStoreClient {
  return { fetch: vi.fn(async () => payload) }
}

describe("storefront branch availability adapter", () => {
  it("is server-only and fetches the cart-scoped Medusa Store route", async () => {
    const source = await readFile(fileURLToPath(new URL("./branches.ts", import.meta.url)), "utf8")
    const supplied = client()
    await expect(getBranchAvailability("cart_123", "en", supplied)).resolves.toEqual([{
      id: "branch_central", handle: "central-staging", name: "Central Staging Pickup",
      district: "Central", leadTimeBusinessDays: 2, compatible: true, reasonCode: null,
      shippingOptionId: "so_central", stagingLabel: "Staging test data",
    }])
    expect(source).toMatch(/^import "server-only"/)
    expect(supplied.fetch).toHaveBeenCalledWith("/store/branches?cart_id=cart_123")
  })

  it("projects exact zh-HK staging branch wording at the BFF boundary", async () => {
    await expect(getBranchAvailability("cart_123", "zh-HK", client())).resolves.toEqual([
      expect.objectContaining({ name: "中環測試取貨點", district: "中環", stagingLabel: "測試取貨資料" }),
    ])
  })

  it.each([
    [{ branches: null }],
    [{ branches: [{ ...rawBranches[0], compatible: "yes" }] }],
    [{ branches: [{ ...rawBranches[0], name: { en: "Only English" } }] }],
    [{ branches: [{ ...rawBranches[0], compatible: true, reasonCode: "retail_out_of_stock" }] }],
    [{ branches: [{ ...rawBranches[0], compatible: false, reasonCode: null }] }],
  ])("rejects malformed branch payloads %#", async (payload) => {
    await expect(getBranchAvailability("cart_123", "en", client(payload))).rejects.toThrow("Invalid Medusa branch response")
  })
})
