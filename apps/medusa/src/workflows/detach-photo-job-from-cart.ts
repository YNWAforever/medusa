import type { PhotoCart, PhotoCartJob, PhotoCartVersion } from "./attach-photo-job-to-cart"

export interface DetachPhotoJobDependencies {
  withLocks<T>(keys: string[], action: () => Promise<T>): Promise<T>
  retrieveJob(id: string): Promise<PhotoCartJob>
  retrieveVersion(id: string): Promise<PhotoCartVersion>
  retrieveCart(id: string): Promise<PhotoCart>
  listLinkedLineIds(versionId: string): Promise<string[]>
  deleteLine(cartId: string, lineId: string): Promise<void>
  deleteLineLinks(versionId: string, lineIds: string[]): Promise<void>
  updateVersion(id: string, patch: Record<string, unknown>): Promise<void>
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>
}

export async function detachPhotoJobFromCart(
  input: { jobId: string; cartId: string; now?: Date },
  dependencies: DetachPhotoJobDependencies,
): Promise<PhotoCart> {
  const job = await dependencies.retrieveJob(input.jobId)
  if (!job.active_version_id) throw new Error("photo_version_unavailable")
  const versionId = job.active_version_id
  return dependencies.withLocks(
    ["photo-cart:" + input.cartId, "photo-version:" + versionId],
    async () => {
      const now = input.now ?? new Date()
      const [freshJob, version] = await Promise.all([
        dependencies.retrieveJob(input.jobId),
        dependencies.retrieveVersion(versionId),
      ])
      if (version.job_id !== freshJob.id || (version.cart_id && version.cart_id !== input.cartId)) {
        throw new Error("photo_cart_conflict")
      }
      const lineIds = await dependencies.listLinkedLineIds(version.id)
      for (const lineId of lineIds) await dependencies.deleteLine(input.cartId, lineId)
      if (lineIds.length) await dependencies.deleteLineLinks(version.id, lineIds)
      await dependencies.updateVersion(version.id, { cart_id: null, cart_attached_at: null })
      await dependencies.updateJob(freshJob.id, {
        status: "ready",
        revision: (freshJob.revision ?? 0) + 1,
        last_activity_at: now,
      })
      return dependencies.retrieveCart(input.cartId)
    },
  )
}