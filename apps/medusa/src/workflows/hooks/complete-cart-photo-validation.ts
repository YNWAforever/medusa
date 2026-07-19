import { completeCartWorkflow } from "@medusajs/core-flows"
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
  retrieveVersion(id: string): Promise<PhotoCartVersion>
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
  for (const id of ids) {
    await dependencies.withLocks(["photo-version:" + id], async () => {
      const version = await dependencies.retrieveVersion(id)
      if (version.order_id === input.order.id) return
      if (version.order_id) throw new Error("photo_order_conflict")
      if (input.order.cart_id && version.cart_id !== input.order.cart_id) {
        throw new Error("photo_cart_conflict")
      }
      const lineIds = (input.order.items ?? [])
        .filter((line) => line.metadata?.photo_job_version_id === id)
        .flatMap((line) => line.id ? [line.id] : [])
      await dependencies.createOrderLink(id, input.order.id)
      await dependencies.createOrderLineLinks(id, lineIds)
      const now = input.now ?? new Date()
      await dependencies.updateVersion(id, { order_id: input.order.id, order_frozen_at: now })
      await dependencies.updateJob(version.job_id, {
        status: "ordered",
        last_activity_at: now,
      })
    })
  }
}
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  await validateCartPhotoVersions(
    { cart: cart as PhotoCart },
    createPhotoCartRuntime(container).validate,
  )
})
