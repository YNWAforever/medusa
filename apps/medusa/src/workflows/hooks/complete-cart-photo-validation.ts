import { completeCartWorkflow } from "@medusajs/core-flows"
import { MedusaError } from "@medusajs/framework/utils"
import type { PhotoCart, PhotoCartVersion } from "../attach-photo-job-to-cart"
import { createPhotoCartRuntime } from "../photo-cart-runtime"

type Line = { id?: string; metadata?: Record<string, unknown> | null }
type Order = { id: string; cart_id?: string | null; items?: Line[] }

function versionIds(lines: Line[]): string[] {
  return [...new Set(lines.flatMap((line) =>
    line.metadata?.kind === "photo_print"
    && typeof line.metadata.photo_job_version_id === "string"
      ? [line.metadata.photo_job_version_id]
      : [],
  ))]
}
function digestFor(lines: Line[], versionId: string): string | null {
  const line = lines.find((candidate) => candidate.metadata?.photo_job_version_id === versionId)
  return typeof line?.metadata?.photo_manifest_digest === "string"
    ? line.metadata.photo_manifest_digest
    : null
}

export interface ValidatePhotoCartDependencies {
  withLocks<T>(keys: string[], action: () => Promise<T>): Promise<T>
  retrieveVersion(id: string): Promise<PhotoCartVersion>
  assertCapability(cart: PhotoCart, version: PhotoCartVersion): Promise<void>
  revalidateVersion(version: PhotoCartVersion): Promise<void>
}

export async function validateCartPhotoVersions(
  input: { cart: PhotoCart; now?: Date },
  dependencies: ValidatePhotoCartDependencies,
): Promise<void> {
  const lines = (input.cart.items ?? []) as Line[]
  const ids = versionIds(lines)
  if (!ids.length) return
  await dependencies.withLocks(
    ["photo-cart:" + input.cart.id, ...ids.map((id) => "photo-version:" + id)],
    async () => {
      const now = input.now ?? new Date()
      for (const id of ids) {
        const version = await dependencies.retrieveVersion(id)
        if (version.cart_id !== input.cart.id || version.status !== "quoted") {
          throw new Error("photo_cart_conflict")
        }
        if (!version.quote_expires_at || new Date(version.quote_expires_at).getTime() <= now.getTime()) {
          throw new Error("photo_quote_expired")
        }
        if (!version.manifest_digest || version.manifest_digest !== digestFor(lines, id)) {
          throw new Error("photo_manifest_conflict")
        }
        if (version.order_id) throw new Error("photo_order_conflict")
        await dependencies.revalidateVersion(version)
        await dependencies.assertCapability(input.cart, version)
      }
    },
  )
}

export interface FreezeOrderPhotoDependencies {
  withLocks<T>(keys: string[], action: () => Promise<T>): Promise<T>
  transaction<T>(action: (operations: {
    updateVersion(id: string, patch: Record<string, unknown>): Promise<void>
    updateJob(id: string, patch: Record<string, unknown>): Promise<void>
  }) => Promise<T>): Promise<T>
  retrieveVersion(id: string): Promise<PhotoCartVersion>
  retrieveJob(id: string): Promise<{
    id: string
    status: string
    production_status?: string | null
    last_activity_at?: Date | string | null
  }>
  createOrderLink(versionId: string, orderId: string): Promise<void>
  createOrderLineLinks(versionId: string, lineIds: string[]): Promise<void>
  updateVersion(id: string, patch: Record<string, unknown>): Promise<void>
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>
}

export async function freezeOrderPhotoVersions(
  input: { order: Order; now?: Date },
  dependencies: FreezeOrderPhotoDependencies,
): Promise<void> {
  const ids = versionIds(input.order.items ?? [])
  if (!ids.length) return
  const initialVersions = await Promise.all(ids.map((id) => dependencies.retrieveVersion(id)))
  const lockKeys = [...new Set([
    ...initialVersions.map((version) => "photo-job:" + version.job_id),
    ...ids.map((id) => "photo-version:" + id),
  ])].sort()
  await dependencies.withLocks(lockKeys, async () => {
    const versions = await Promise.all(ids.map((id) => dependencies.retrieveVersion(id)))
    const jobs = new Map<string, Awaited<ReturnType<typeof dependencies.retrieveJob>>>()
    for (const version of versions) {
      if (version.order_id && version.order_id !== input.order.id) {
        throw new Error("photo_order_conflict")
      }
      if (input.order.cart_id && version.cart_id !== input.order.cart_id) {
        throw new Error("photo_cart_conflict")
      }
      const job = await dependencies.retrieveJob(version.job_id)
      jobs.set(version.job_id, job)
      if (version.order_id !== input.order.id && job.status !== "cart_attached") {
        throw new Error("photo_order_conflict")
      }
    }
    const pending = versions.filter((version) => version.order_id !== input.order.id)
    if (pending.length) {
      const now = input.now ?? new Date()
      await dependencies.transaction(async (operations) => {
        for (const version of pending) {
          await operations.updateVersion(version.id, { order_id: input.order.id, order_frozen_at: now })
          await operations.updateJob(version.job_id, {
            status: "ordered",
            production_status: "accepted",
            last_activity_at: now,
          })
        }
      })
    }
    try {
      for (const version of versions) {
        const lineIds = (input.order.items ?? [])
          .filter((line) => line.metadata?.photo_job_version_id === version.id)
          .flatMap((line) => line.id ? [line.id] : [])
        await dependencies.createOrderLink(version.id, input.order.id)
        await dependencies.createOrderLineLinks(version.id, lineIds)
      }
    } catch (error) {
      if (pending.length) {
        await dependencies.transaction(async (operations) => {
          for (const version of pending) {
            await operations.updateVersion(version.id, {
              order_id: version.order_id ?? null,
              order_frozen_at: null,
            })
          }
          for (const [jobId, job] of jobs) {
            await operations.updateJob(jobId, {
              status: job.status,
              production_status: job.production_status ?? null,
              last_activity_at: job.last_activity_at ?? null,
            })
          }
        })
      }
      throw error
    }
  })
}
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  try {
    await validateCartPhotoVersions(
      { cart: cart as PhotoCart },
      createPhotoCartRuntime(container).validate,
    )
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("photo_")) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
    }
    throw error
  }
})
