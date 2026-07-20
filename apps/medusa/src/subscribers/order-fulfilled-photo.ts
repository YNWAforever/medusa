import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production"
import { calculateMediaExpiry } from "../modules/photo-production/retention"

export async function fulfillOrderedPhotoJobs(
  input: { orderId: string; fulfilledAt?: Date },
  dependencies: { service: any },
): Promise<void> {
  const fulfilledAt = input.fulfilledAt ?? new Date()
  const versions = await dependencies.service.listPhotoJobVersions({ order_id: input.orderId })
  for (const version of versions) {
    const job = await dependencies.service.retrievePhotoJob(version.job_id)
    if (job.status === "fulfilled") continue
    if (job.status !== "ordered") throw new Error("photo_state_transition_invalid")
    const mediaExpiresAt = calculateMediaExpiry({ ...job, status: "fulfilled", fulfilled_at: fulfilledAt })
    await dependencies.service.updatePhotoJobs({
      selector: { id: job.id, status: "ordered" },
      data: {
        status: "fulfilled",
        production_status: "fulfilled",
        fulfilled_at: fulfilledAt,
        media_expires_at: mediaExpiresAt,
        last_activity_at: fulfilledAt,
        revision: (job.revision ?? 0) + 1,
      },
    })
  }
}

export default async function orderFulfilledPhotoHandler({ event, container }: SubscriberArgs<{ id: string }>): Promise<void> {
  await fulfillOrderedPhotoJobs(
    { orderId: event.data.id },
    { service: container.resolve(PHOTO_PRODUCTION_MODULE) },
  )
}

export const config: SubscriberConfig = { event: "order.completed" }
