import { completeCartWorkflow } from "@medusajs/core-flows"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { createPhotoCartRuntime } from "../photo-cart-runtime"
import { freezeOrderPhotoVersions } from "./complete-cart-photo-validation"

;(completeCartWorkflow.hooks as any).orderCreated(async (
  { order_id, cart_id }: { order_id: string; cart_id: string },
  { container }: { container: any },
) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await query.graph({
    entity: "order",
    fields: ["id", "items.id", "items.metadata"],
    filters: { id: order_id },
  })
  const order = result.data?.[0]
  if (!order) throw new Error("photo_order_not_found")
  await freezeOrderPhotoVersions(
    { order: { ...order, cart_id } },
    createPhotoCartRuntime(container).freeze,
  )
})