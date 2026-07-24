import { describe, expect, it, vi } from "vitest"
import { attachPhotoJobToCart } from "../../../../../workflows/attach-photo-job-to-cart"
import { detachPhotoJobFromCart } from "../../../../../workflows/detach-photo-job-from-cart"
import {
  freezeOrderPhotoVersions,
  validateCartPhotoVersions,
} from "../../../../../workflows/hooks/complete-cart-photo-validation"
import { cancelOrderedPhotoJobs } from "../../../../../subscribers/order-cancelled-photo"

const now = new Date("2026-07-19T12:00:00.000Z")
const future = new Date("2026-07-19T12:15:00.000Z")
const job = (overrides = {}) => ({
  id: "job_1",
  status: "ready",
  customer_id: "cus_1",
  active_version_id: "version_1",
  revision: 4,
  ...overrides,
})
const version = (overrides = {}) => ({
  id: "version_1",
  job_id: "job_1",
  status: "quoted",
  currency_code: "hkd",
  subtotal: 1400,
  quote_expires_at: future,
  manifest_digest: "digest_1",
  cart_id: null,
  order_id: null,
  ...overrides,
})
const items = [
  { id: "item_1", variant_id: "variant_glossy", quantity: 2, unit_price_snapshot: 200 },
  { id: "item_2", variant_id: "variant_glossy", quantity: 3, unit_price_snapshot: 200 },
  { id: "item_3", variant_id: "variant_matte", quantity: 1, unit_price_snapshot: 400 },
]
const cart = (overrides = {}) => ({
  id: "cart_1",
  customer_id: "cus_1",
  currency_code: "hkd",
  items: [],
  ...overrides,
})
const variant = (id: string) => ({
  id,
  published: true,
  commerceMode: "photo_print",
  currencyCode: "hkd",
  amount: id === "variant_matte" ? 400 : 200,
})

function attachDependencies(overrides: Record<string, unknown> = {}) {
  const links: string[] = []
  const dependencies = {
    withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
    retrieveJob: vi.fn(async () => job()),
    retrieveVersion: vi.fn(async () => version()),
    listItems: vi.fn(async () => items),
    retrieveCart: vi.fn(async () => cart()),
    resolveVariant: vi.fn(async (id: string) => variant(id)),
    assertCapability: vi.fn(async () => undefined),
    listLinkedLineIds: vi.fn(async () => [...links]),
    addLine: vi.fn(async (_cartId: string, input: Record<string, unknown>) => {
      const id = "line_" + (links.length + 1)
      links.push(id)
      return { id, ...input }
    }),
    createLineLinks: vi.fn(async () => undefined),
    updateVersion: vi.fn(async () => undefined),
    updateJob: vi.fn(async () => undefined),
    ...overrides,
  }
  return dependencies
}

describe("photo cart attachment", () => {
  it("aggregates quantities by variant under both required locks", async () => {
    const dependencies = attachDependencies()
    await attachPhotoJobToCart({ jobId: "job_1", cartId: "cart_1", now }, dependencies as never)

    expect(dependencies.withLocks).toHaveBeenCalledWith(
      ["photo-cart:cart_1", "photo-version:version_1"],
      expect.any(Function),
    )
    expect(dependencies.addLine).toHaveBeenCalledTimes(2)
    expect(dependencies.addLine).toHaveBeenCalledWith("cart_1", expect.objectContaining({
      variant_id: "variant_glossy",
      quantity: 5,
      metadata: expect.objectContaining({
        kind: "photo_print",
        photo_job_id: "job_1",
        photo_job_version_id: "version_1",
        photo_item_count: 6,
        photo_manifest_digest: "digest_1",
      }),
    }))
    expect(dependencies.updateVersion).toHaveBeenCalledWith("version_1", expect.objectContaining({
      cart_id: "cart_1",
    }))
    expect(dependencies.updateJob).toHaveBeenCalledWith("job_1", expect.objectContaining({
      status: "cart_attached",
    }))
  })

  it("is idempotent when explicit line links already exist", async () => {
    const dependencies = attachDependencies({
      listLinkedLineIds: vi.fn(async () => ["line_existing"]),
    })
    await attachPhotoJobToCart({ jobId: "job_1", cartId: "cart_1", now }, dependencies as never)
    expect(dependencies.addLine).not.toHaveBeenCalled()
    expect(dependencies.createLineLinks).not.toHaveBeenCalled()
  })

  it.each([
    ["cart owner mismatch", { retrieveCart: vi.fn(async () => cart({ customer_id: "cus_2" })) }, "photo_cart_owner_mismatch"],
    ["expired quote", { retrieveVersion: vi.fn(async () => version({ quote_expires_at: now })) }, "photo_quote_expired"],
    ["changed price", { resolveVariant: vi.fn(async (id: string) => ({ ...variant(id), amount: 999 })) }, "photo_quote_changed"],
    ["removed variant", { resolveVariant: vi.fn(async (id: string) => ({ ...variant(id), published: false })) }, "photo_variant_unavailable"],
    ["branch incompatibility", { assertCapability: vi.fn(async () => { throw new Error("photo_capability_unavailable") }) }, "photo_capability_unavailable"],
  ] as const)("rejects %s", async (_label, overrides, code) => {
    await expect(attachPhotoJobToCart(
      { jobId: "job_1", cartId: "cart_1", now },
      attachDependencies(overrides) as never,
    )).rejects.toThrow(code)
  })
})

describe("photo cart detach", () => {
  it("removes every linked line and reopens the job", async () => {
    const dependencies = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      retrieveJob: vi.fn(async () => job({ status: "cart_attached" })),
      retrieveVersion: vi.fn(async () => version({ cart_id: "cart_1" })),
      retrieveCart: vi.fn(async () => cart()),
      listLinkedLineIds: vi.fn(async () => ["line_1", "line_2"]),
      deleteLine: vi.fn(async (_cartId: string, _lineId: string) => undefined),
      deleteLineLinks: vi.fn(async () => undefined),
      updateVersion: vi.fn(async () => undefined),
      updateJob: vi.fn(async () => undefined),
    }
    await detachPhotoJobFromCart({ jobId: "job_1", cartId: "cart_1" }, dependencies as never)
    expect(dependencies.deleteLine.mock.calls.map((call) => call[1])).toEqual(["line_1", "line_2"])
    expect(dependencies.updateVersion).toHaveBeenCalledWith("version_1", {
      cart_id: null,
      cart_attached_at: null,
    })
    expect(dependencies.updateJob).toHaveBeenCalledWith("job_1", expect.objectContaining({ status: "ready" }))
  })
})

describe("checkout validation and order freeze", () => {
  const photoLine = {
    id: "line_1",
    metadata: {
      kind: "photo_print",
      photo_job_id: "job_1",
      photo_job_version_id: "version_1",
      photo_manifest_digest: "digest_1",
    },
  }

  it("validates mixed retail/photo carts without changing totals", async () => {
    const dependencies = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      retrieveVersion: vi.fn(async () => version({ cart_id: "cart_1" })),
      assertCapability: vi.fn(async () => undefined),
      revalidateVersion: vi.fn(async () => undefined),
    }
    await expect(validateCartPhotoVersions({
      cart: cart({ items: [{ id: "retail_1", metadata: { kind: "retail" } }, photoLine] }),
      now,
    }, dependencies as never)).resolves.toBeUndefined()
  })

  it.each([
    ["wrong cart", version({ cart_id: "cart_other" }), "photo_cart_conflict"],
    ["expired", version({ cart_id: "cart_1", quote_expires_at: now }), "photo_quote_expired"],
    ["digest drift", version({ cart_id: "cart_1", manifest_digest: "different" }), "photo_manifest_conflict"],
    ["already ordered", version({ cart_id: "cart_1", order_id: "order_other" }), "photo_order_conflict"],
  ] as const)("rejects %s before order creation", async (_label, storedVersion, code) => {
    const dependencies = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      retrieveVersion: vi.fn(async () => storedVersion),
      assertCapability: vi.fn(async () => undefined),
      revalidateVersion: vi.fn(async () => undefined),
    }
    await expect(validateCartPhotoVersions({
      cart: cart({ items: [photoLine] }),
      now,
    }, dependencies as never)).rejects.toThrow(code)
  })

  it("freezes order/version atomically and reconciles links on retry", async () => {
    let stored = version({ cart_id: "cart_1" })
    const dependencies: any = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action(dependencies)),
      retrieveVersion: vi.fn(async () => stored),
      retrieveJob: vi.fn(async () => job({ status: stored.order_id ? "ordered" : "cart_attached" })),
      createOrderLink: vi.fn(async () => undefined),
      createOrderLineLinks: vi.fn(async () => undefined),
      updateVersion: vi.fn(async (_id: string, patch: Record<string, unknown>) => { stored = { ...stored, ...patch } }),
      updateJob: vi.fn(async () => undefined),
    }
    const order = { id: "order_1", cart_id: "cart_1", items: [{ id: "order_line_1", metadata: photoLine.metadata }] }
    await freezeOrderPhotoVersions({ order, now }, dependencies as never)
    await freezeOrderPhotoVersions({ order, now }, dependencies as never)

    expect(dependencies.transaction).toHaveBeenCalledOnce()
    expect(dependencies.createOrderLink).toHaveBeenCalledTimes(2)
    expect(dependencies.createOrderLineLinks).toHaveBeenCalledTimes(2)
    expect(dependencies.updateVersion).toHaveBeenCalledWith("version_1", expect.objectContaining({
      order_id: "order_1",
      order_frozen_at: now,
    }))
    expect(dependencies.updateJob).toHaveBeenCalledWith("job_1", expect.objectContaining({ status: "ordered", production_status: "accepted" }))
  })
  it("repairs order links on replay under the shared job lock", async () => {
    const stored = version({ cart_id: "cart_1", order_id: "order_1" })
    const dependencies: any = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action(dependencies)),
      retrieveVersion: vi.fn(async () => stored),
      retrieveJob: vi.fn(async () => job({ status: "ordered" })),
      createOrderLink: vi.fn(async () => undefined),
      createOrderLineLinks: vi.fn(async () => undefined),
      updateVersion: vi.fn(async () => undefined),
      updateJob: vi.fn(async () => undefined),
    }
    const order = { id: "order_1", cart_id: "cart_1", items: [{ id: "order_line_1", metadata: photoLine.metadata }] }
    await freezeOrderPhotoVersions({ order, now }, dependencies as never)

    expect(dependencies.withLocks).toHaveBeenCalledWith(
      ["photo-job:job_1", "photo-version:version_1"],
      expect.any(Function),
    )
    expect(dependencies.transaction).not.toHaveBeenCalled()
    expect(dependencies.createOrderLink).toHaveBeenCalledOnce()
    expect(dependencies.createOrderLineLinks).toHaveBeenCalledOnce()
    expect(dependencies.updateVersion).not.toHaveBeenCalled()
  })
  it("compensates a failed link write so checkout retry can freeze again", async () => {
    let storedVersion = version({ cart_id: "cart_1" })
    let storedJob = job({ status: "cart_attached", production_status: null })
    const dependencies: any = {
      withLocks: vi.fn(async (_keys: string[], action: () => Promise<unknown>) => action()),
      transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) => action(dependencies)),
      retrieveVersion: vi.fn(async () => storedVersion),
      retrieveJob: vi.fn(async () => storedJob),
      createOrderLink: vi.fn(async () => undefined),
      createOrderLineLinks: vi.fn()
        .mockRejectedValueOnce(new Error("link_write_failed"))
        .mockResolvedValue(undefined),
      updateVersion: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        storedVersion = { ...storedVersion, ...patch }
      }),
      updateJob: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        storedJob = { ...storedJob, ...patch }
      }),
    }
    const order = { id: "order_1", cart_id: "cart_1", items: [{ id: "order_line_1", metadata: photoLine.metadata }] }

    await expect(freezeOrderPhotoVersions({ order, now }, dependencies as never))
      .rejects.toThrow("link_write_failed")
    expect(storedVersion.order_id).toBeNull()
    expect(storedJob.status).toBe("cart_attached")

    await expect(freezeOrderPhotoVersions({ order, now }, dependencies as never))
      .resolves.toBeUndefined()
    expect(storedVersion.order_id).toBe("order_1")
    expect(storedJob.status).toBe("ordered")
  })
})

describe("ordered photo cancellation", () => {
  it("cancels linked jobs after core cancellation and keeps media for the explicit retention window", async () => {
    const dependencies = {
      listVersionsForOrder: vi.fn(async () => [version({ order_id: "order_1" })]),
      retrieveJob: vi.fn(async () => job({ status: "ordered" })),
      updateJob: vi.fn(async () => undefined),
    }
    await cancelOrderedPhotoJobs({ orderId: "order_1", cancelledAt: now }, dependencies as never)
    expect(dependencies.updateJob).toHaveBeenCalledWith("job_1", expect.objectContaining({
      status: "cancelled",
      production_status: "cancelled",
      cancelled_at: now,
      retention_class: "cancelled_order_30d",
    }))
  })
})