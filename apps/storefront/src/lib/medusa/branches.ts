import "server-only"
import type Medusa from "@medusajs/js-sdk"
import type { Locale } from "./contracts"

export type BranchReasonCode = "retail_out_of_stock" | "print_not_supported" | null

export interface BranchView {
  id: string
  handle: string
  name: string
  district: string
  leadTimeBusinessDays: number
  compatible: boolean
  reasonCode: BranchReasonCode
  shippingOptionId: string
  stagingLabel: string
}

export interface BranchStoreClient {
  fetch(path: string): Promise<unknown>
}

interface RawBranch {
  id: string
  handle: string
  name: { en: string; "zh-HK": string }
  district: { en: string; "zh-HK": string }
  leadTimeBusinessDays: number
  compatible: boolean
  reasonCode: BranchReasonCode
  shippingOptionId: string
}

function invalidResponse(): never {
  throw new Error("Invalid Medusa branch response")
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidResponse()
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalidResponse()
  }
  return value
}

function bilingual(value: unknown): { en: string; "zh-HK": string } {
  const source = record(value)
  return {
    en: requiredString(source.en),
    "zh-HK": requiredString(source["zh-HK"]),
  }
}

function rawBranch(value: unknown): RawBranch {
  const source = record(value)
  const reasonCode = source.reasonCode
  if (
    reasonCode !== null
    && reasonCode !== "retail_out_of_stock"
    && reasonCode !== "print_not_supported"
  ) {
    return invalidResponse()
  }
  if (
    (source.compatible === true && reasonCode !== null)
    || (source.compatible === false && reasonCode === null)
  ) {
    return invalidResponse()
  }
  if (
    typeof source.compatible !== "boolean"
    || typeof source.leadTimeBusinessDays !== "number"
    || !Number.isInteger(source.leadTimeBusinessDays)
    || source.leadTimeBusinessDays < 0
  ) {
    return invalidResponse()
  }

  return {
    id: requiredString(source.id),
    handle: requiredString(source.handle),
    name: bilingual(source.name),
    district: bilingual(source.district),
    leadTimeBusinessDays: source.leadTimeBusinessDays,
    compatible: source.compatible,
    reasonCode,
    shippingOptionId: requiredString(source.shippingOptionId),
  }
}

export function createBranchStoreClient(sdk: Medusa): BranchStoreClient {
  return {
    async fetch(path) {
      return sdk.client.fetch(path)
    },
  }
}

export async function getBranchAvailability(
  cartId: string,
  locale: Locale,
  client: BranchStoreClient,
): Promise<BranchView[]> {
  if (!cartId.trim()) {
    throw new Error("A cart id is required for branch availability")
  }

  const payload = record(await client.fetch(
    "/store/branches?cart_id=" + encodeURIComponent(cartId),
  ))
  if (!Array.isArray(payload.branches)) {
    return invalidResponse()
  }

  return payload.branches.map((value) => {
    const branch = rawBranch(value)
    return {
      id: branch.id,
      handle: branch.handle,
      name: branch.name[locale],
      district: branch.district[locale],
      leadTimeBusinessDays: branch.leadTimeBusinessDays,
      compatible: branch.compatible,
      reasonCode: branch.reasonCode,
      shippingOptionId: branch.shippingOptionId,
      stagingLabel: locale === "zh-HK" ? "測試取貨資料" : "Staging test data",
    }
  })
}
