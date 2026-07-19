import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"

export interface CancelledPhotoOrderDependencies {
  listVersionsForOrder(orderId: string): Promise<Array<{ job_id: string }>>
  retrieveJob(id: string): Promise<{ id: string; status: string; revision?: number }>
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>
}

export async function cancelOrderedPhotoJobs(
  input: { orderId: string; cancelledAt?: Date },
  dependencies: CancelledPhotoOrderDependencies,
): Promise<void> {
  const cancelledAt = input.cancelledAt ?? new Date()
  const versions = await dependencies.listVersionsForOrder(input.orderId)
  for (const version of versions) {
    const job = await dependencies.retrieveJob(version.job_id)
    if (job.status === "cancelled") continue
    if (job.status !== "ordered") throw new Error("photo_state_transition_invalid")
    await dependencies.updateJob(job.id, {
      status: "cancelled",
      revision: (job.revision ?? 0) + 1,
      cancelled_at: cancelledAt,
      last_activity_at: cancelledAt,
      retention_class: "cancelled_order_30d",
    })
  }
}
export default async function orderCancelledPhotoHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const service: any = container.resolve(PHOTO_PRODUCTION_MODULE)
  await cancelOrderedPhotoJobs(
    { orderId: event.data.id },
    {
      listVersionsForOrder: (orderId) => service.listPhotoJobVersions({ order_id: orderId }),
      retrieveJob: (id) => service.retrievePhotoJob(id),
      updateJob: async (id, patch) => {
        await service.updatePhotoJobs({ selector: { id }, data: patch })
      },
    },
  )
}

export const config: SubscriberConfig = { event: "order.canceled" }