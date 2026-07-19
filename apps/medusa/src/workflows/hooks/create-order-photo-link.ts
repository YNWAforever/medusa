import { createOrderWorkflow } from "@medusajs/core-flows"

import { createPhotoCartRuntime } from "../photo-cart-runtime"
import { freezeOrderPhotoVersions } from "./complete-cart-photo-validation"

createOrderWorkflow.hooks.orderCreated(async ({ order }, { container }) => {
  await freezeOrderPhotoVersions(
    { order: order as { id: string; cart_id?: string | null; items?: Array<{ id?: string; metadata?: Record<string, unknown> | null }> } },
    createPhotoCartRuntime(container).freeze,
  )
})
