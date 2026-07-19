export type PhotoCartJob = {
  id: string
  status: string
  customer_id?: string | null
  active_version_id?: string | null
  revision?: number
}
export type PhotoCartVersion = {
  id: string
  job_id: string
  status: string
  currency_code: string
  subtotal?: number | null
  quote_expires_at?: Date | string | null
  manifest_digest?: string | null
  cart_id?: string | null
  cart_attached_at?: Date | string | null
  order_id?: string | null
}
export type PhotoCartItem = {
  id: string
  variant_id: string
  quantity: number
  unit_price_snapshot?: number | null
}
export type PhotoCart = {
  id: string
  customer_id?: string | null
  currency_code?: string | null
  items?: Array<Record<string, unknown>>
}
export type PhotoVariantPrice = {
  id: string
  published: boolean
  commerceMode: string
  currencyCode: string
  amount: number
}
export type PhotoCartLineInput = {
  variant_id: string
  quantity: number
  metadata: {
    kind: "photo_print"
    photo_job_id: string
    photo_job_version_id: string
    photo_item_count: number
    photo_manifest_digest: string
  }
}

export interface AttachPhotoJobDependencies {
  withLocks<T>(keys: string[], action: () => Promise<T>): Promise<T>
  retrieveJob(id: string): Promise<PhotoCartJob>
  retrieveVersion(id: string): Promise<PhotoCartVersion>
  listItems(versionId: string): Promise<PhotoCartItem[]>
  retrieveCart(id: string): Promise<PhotoCart>
  resolveVariant(id: string): Promise<PhotoVariantPrice | null>
  assertCapability(cart: PhotoCart, items: PhotoCartItem[]): Promise<void>
  listLinkedLineIds(versionId: string): Promise<string[]>
  addLine(cartId: string, input: PhotoCartLineInput): Promise<{ id: string }>
  createLineLinks(versionId: string, lineIds: string[]): Promise<void>
  updateVersion(id: string, patch: Record<string, unknown>): Promise<void>
  updateJob(id: string, patch: Record<string, unknown>): Promise<void>
}

export type AttachPhotoJobInput = { jobId: string; cartId: string; now?: Date }

function requiredVersion(job: PhotoCartJob): string {
  if (!job.active_version_id) throw new Error("photo_version_unavailable")
  return job.active_version_id
}
function validQuote(version: PhotoCartVersion, now: Date): void {
  if (version.status !== "quoted") throw new Error("photo_quote_required")
  if (!version.quote_expires_at || new Date(version.quote_expires_at).getTime() <= now.getTime()) {
    throw new Error("photo_quote_expired")
  }
  if (!version.manifest_digest) throw new Error("photo_manifest_conflict")
  if (version.order_id) throw new Error("photo_order_conflict")
}
function matchingOwner(job: PhotoCartJob, cart: PhotoCart): boolean {
  return (job.customer_id ?? null) === (cart.customer_id ?? null)
}

export async function attachPhotoJobToCart(
  input: AttachPhotoJobInput,
  dependencies: AttachPhotoJobDependencies,
): Promise<PhotoCart> {
  const job = await dependencies.retrieveJob(input.jobId)
  const versionId = requiredVersion(job)
  return dependencies.withLocks(
    ["photo-cart:" + input.cartId, "photo-version:" + versionId],
    async () => {
      const now = input.now ?? new Date()
      const [freshJob, version, cart] = await Promise.all([
        dependencies.retrieveJob(input.jobId),
        dependencies.retrieveVersion(versionId),
        dependencies.retrieveCart(input.cartId),
      ])
      if (version.job_id !== freshJob.id || freshJob.active_version_id !== version.id) {
        throw new Error("photo_version_unavailable")
      }
      if (!matchingOwner(freshJob, cart)) throw new Error("photo_cart_owner_mismatch")
      if (cart.currency_code?.toLowerCase() !== version.currency_code.toLowerCase()) {
        throw new Error("photo_cart_currency_mismatch")
      }
      validQuote(version, now)
      if (version.cart_id && version.cart_id !== cart.id) throw new Error("photo_cart_conflict")

      const existing = await dependencies.listLinkedLineIds(version.id)
      if (existing.length) return dependencies.retrieveCart(cart.id)

      const printItems = await dependencies.listItems(version.id)
      if (!printItems.length) throw new Error("photo_items_unavailable")
      await dependencies.assertCapability(cart, printItems)

      const groups = new Map<string, number>()
      for (const item of printItems) {
        const live = await dependencies.resolveVariant(item.variant_id)
        if (!live || !live.published || live.commerceMode !== "photo_print") {
          throw new Error("photo_variant_unavailable")
        }
        if (
          live.currencyCode.toLowerCase() !== version.currency_code.toLowerCase()
          || live.amount !== item.unit_price_snapshot
        ) {
          throw new Error("photo_quote_changed")
        }
        groups.set(item.variant_id, (groups.get(item.variant_id) ?? 0) + item.quantity)
      }

      const photoCount = printItems.reduce((total, item) => total + item.quantity, 0)
      const lineIds: string[] = []
      for (const [variantId, quantity] of groups) {
        const line = await dependencies.addLine(cart.id, {
          variant_id: variantId,
          quantity,
          metadata: {
            kind: "photo_print",
            photo_job_id: freshJob.id,
            photo_job_version_id: version.id,
            photo_item_count: photoCount,
            photo_manifest_digest: version.manifest_digest!,
          },
        })
        lineIds.push(line.id)
      }
      await dependencies.createLineLinks(version.id, lineIds)
      await dependencies.updateVersion(version.id, {
        cart_id: cart.id,
        cart_attached_at: now,
      })
      await dependencies.updateJob(freshJob.id, {
        status: "cart_attached",
        revision: (freshJob.revision ?? 0) + 1,
        last_activity_at: now,
      })
      return dependencies.retrieveCart(cart.id)
    },
  )
}