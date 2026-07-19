import {
  addToCartWorkflow,
  createLinksWorkflow,
  dismissLinksWorkflow,
} from "@medusajs/core-flows"
import type { LinkDefinition } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import type {
  AttachPhotoJobDependencies,
  PhotoCart,
  PhotoCartItem,
  PhotoCartLineInput,
  PhotoCartVersion,
} from "./attach-photo-job-to-cart"
import type { DetachPhotoJobDependencies } from "./detach-photo-job-from-cart"
import type {
  FreezeOrderPhotoDependencies,
  ValidatePhotoCartDependencies,
} from "./hooks/complete-cart-photo-validation"

type Scope = { resolve<T = unknown>(name: string): T }

const first = <T>(value: T | T[]): T => Array.isArray(value) ? value[0] : value

function lineLink(versionId: string, lineId: string): LinkDefinition {
  return {
    [PHOTO_PRODUCTION_MODULE]: { photo_job_version_id: versionId },
    [Modules.CART]: { line_item_id: lineId },
  }
}

function orderLink(versionId: string, orderId: string): LinkDefinition {
  return {
    [PHOTO_PRODUCTION_MODULE]: { photo_job_version_id: versionId },
    [Modules.ORDER]: { order_id: orderId },
  }
}

function orderLineLink(versionId: string, lineId: string): LinkDefinition {
  return {
    [PHOTO_PRODUCTION_MODULE]: { photo_job_version_id: versionId },
    [Modules.ORDER]: { order_line_item_id: lineId },
  }
}

export function createPhotoCartRuntime(scope: Scope) {
  const service: any = scope.resolve(PHOTO_PRODUCTION_MODULE)
  const query: any = scope.resolve(ContainerRegistrationKeys.QUERY)
  const locking: any = scope.resolve(Modules.LOCKING)
  const cartService: any = scope.resolve(Modules.CART)

  const retrieveCart = async (id: string): Promise<PhotoCart> => {
    const result = await query.graph({
      entity: "cart",
      fields: [
        "id", "customer_id", "currency_code", "metadata", "items.id",
        "items.variant_id", "items.quantity", "items.metadata",
      ],
      filters: { id },
    })
    const cart = result.data?.[0]
    if (!cart) throw new Error("photo_cart_not_found")
    return cart
  }

  const retrieveVersion = (id: string): Promise<PhotoCartVersion> =>
    service.retrievePhotoJobVersion(id)

  const listItems = (versionId: string): Promise<PhotoCartItem[]> =>
    service.listPrintItems({ version_id: versionId })

  const listLinkedLineIds = async (versionId: string): Promise<string[]> => {
    const result = await query.graph({
      entity: "photo_job_version",
      fields: ["line_items.id"],
      filters: { id: versionId },
    })
    return (result.data?.[0]?.line_items ?? [])
      .flatMap((line: { id?: string }) => line.id ? [line.id] : [])
  }

  const updateVersion = async (id: string, patch: Record<string, unknown>) => {
    await service.updatePhotoJobVersions({ selector: { id }, data: patch })
  }
  const updateJob = async (id: string, patch: Record<string, unknown>) => {
    await service.updatePhotoJobs({ selector: { id }, data: patch })
  }
  const withLocks = <T>(keys: string[], action: () => Promise<T>) =>
    locking.execute(keys, action)

  const resolveVariant = async (id: string) => {
    const result = await query.graph({
      entity: "product_variant",
      fields: ["id", "calculated_price.*", "product.status", "product.metadata"],
      filters: { id },
      context: { currency_code: "hkd" },
    })
    const variant = result.data?.[0]
    if (!variant) return null
    return {
      id: variant.id,
      published: variant.product?.status === "published",
      commerceMode: variant.product?.metadata?.commerce_mode ?? "",
      currencyCode: variant.calculated_price?.currency_code ?? "hkd",
      amount: variant.calculated_price?.calculated_amount,
    }
  }

  const assertCapability = async (cart: PhotoCart) => {
    if ((cart as any).metadata?.fulfillment_type === "pickup") {
      throw new Error("photo_capability_unavailable")
    }
  }

  const attach: AttachPhotoJobDependencies = {
    withLocks,
    retrieveJob: (id) => service.retrievePhotoJob(id),
    retrieveVersion,
    listItems,
    retrieveCart,
    resolveVariant,
    assertCapability,
    listLinkedLineIds,
    addLine: async (cartId: string, input: PhotoCartLineInput) => {
      const before = new Set((await retrieveCart(cartId)).items?.flatMap((item) =>
        typeof item.id === "string" ? [item.id] : [],
      ))
      await addToCartWorkflow(scope as any).run({ input: { cart_id: cartId, items: [input] } })
      const created = (await retrieveCart(cartId)).items?.find((item) =>
        !before.has(String(item.id))
        && item.variant_id === input.variant_id
        && (item.metadata as any)?.photo_job_version_id === input.metadata.photo_job_version_id,
      )
      if (!created?.id || typeof created.id !== "string") throw new Error("photo_cart_line_missing")
      return { id: created.id }
    },
    createLineLinks: async (versionId, lineIds) => {
      const existing = new Set(await listLinkedLineIds(versionId))
      const missing = lineIds.filter((id) => !existing.has(id))
      if (missing.length) {
        await createLinksWorkflow(scope as any).run({ input: missing.map((id) => lineLink(versionId, id)) })
      }
    },
    updateVersion,
    updateJob,
  }

  const detach: DetachPhotoJobDependencies = {
    withLocks,
    retrieveJob: attach.retrieveJob,
    retrieveVersion,
    retrieveCart,
    listLinkedLineIds,
    deleteLine: async (_cartId, lineId) => { await cartService.deleteLineItems(lineId) },
    deleteLineLinks: async (versionId, lineIds) => {
      await dismissLinksWorkflow(scope as any).run({ input: lineIds.map((id) => lineLink(versionId, id)) })
    },
    updateVersion,
    updateJob,
  }

  const validate: ValidatePhotoCartDependencies = {
    withLocks,
    retrieveVersion,
    assertCapability,
    revalidateVersion: async (version) => {
      const items = await listItems(version.id)
      for (const item of items) {
        const live = await resolveVariant(item.variant_id)
        if (!live || !live.published || live.commerceMode !== "photo_print") {
          throw new Error("photo_variant_unavailable")
        }
        if (live.currencyCode.toLowerCase() !== version.currency_code.toLowerCase()
          || live.amount !== item.unit_price_snapshot) {
          throw new Error("photo_quote_changed")
        }
      }
    },
  }

  const freeze: FreezeOrderPhotoDependencies = {
    withLocks,
    retrieveVersion,
    createOrderLink: async (versionId, orderId) => {
      const result = await query.graph({ entity: "photo_job_version", fields: ["order.id"], filters: { id: versionId } })
      if (result.data?.[0]?.order?.id !== orderId) {
        await createLinksWorkflow(scope as any).run({ input: [orderLink(versionId, orderId)] })
      }
    },
    createOrderLineLinks: async (versionId, lineIds) => {
      const result = await query.graph({ entity: "photo_job_version", fields: ["order_line_items.id"], filters: { id: versionId } })
      const existing = new Set((result.data?.[0]?.order_line_items ?? []).map((line: { id: string }) => line.id))
      const missing = lineIds.filter((id) => !existing.has(id))
      if (missing.length) {
        await createLinksWorkflow(scope as any).run({ input: missing.map((id) => orderLineLink(versionId, id)) })
      }
    },
    updateVersion,
    updateJob,
  }

  return { attach, detach, validate, freeze, retrieveCart, service }
}
