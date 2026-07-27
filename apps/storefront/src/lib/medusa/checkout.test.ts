import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import type { BranchView } from "./branches"
import {
  CheckoutError,
  createCheckoutAdapter,
  parseContactInput,
  parseFulfillmentInput,
  projectContact,
  projectShippingOptions,
} from "./checkout"

const branches: BranchView[] = [
  {
    id: "branch_central",
    handle: "central-staging",
    name: "Central Staging Pickup",
    district: "Central",
    leadTimeBusinessDays: 1,
    compatible: true,
    reasonCode: null,
    shippingOptionId: "so_central",
    stagingLabel: "Staging test data",
  },
  {
    id: "branch_mong-kok",
    handle: "mong-kok-staging",
    name: "Mong Kok Staging Pickup",
    district: "Mong Kok",
    leadTimeBusinessDays: 2,
    compatible: false,
    reasonCode: "retail_out_of_stock",
    shippingOptionId: "so_mong-kok",
    stagingLabel: "Staging test data",
  },
]

const rawOptions = [
  {
    id: "so_delivery",
    name: "Fotomax Hong Kong Delivery",
    amount: 40,
    data: { fulfillment_kind: "delivery" },
    metadata: { fulfillment_kind: "delivery" },
    type: { label: "Hong Kong Delivery", description: "Flat-rate delivery", code: "fotomax-hk-delivery" },
    insufficient_inventory: false,
    service_zone: { fulfillment_set: { location: { address: { address_1: "Test warehouse", city: "Central", country_code: "hk" } } } },
  },
  {
    id: "so_central",
    name: "Fotomax Pickup central-staging",
    amount: 0,
    data: { fulfillment_kind: "pickup", branch_handle: "central-staging" },
    metadata: { fulfillment_kind: "pickup", branch_handle: "central-staging" },
    type: { label: "Central Staging Pickup", description: "Pickup", code: "fotomax-pickup-central-staging" },
    insufficient_inventory: false,
    service_zone: { fulfillment_set: { location: { address: { address_1: "Test Central Location", city: "Central", country_code: "hk" } } } },
  },
  {
    id: "so_mong-kok",
    name: "Fotomax Pickup mong-kok-staging",
    amount: 0,
    data: { fulfillment_kind: "pickup", branch_handle: "mong-kok-staging" },
    metadata: { fulfillment_kind: "pickup", branch_handle: "mong-kok-staging" },
    type: { label: "Mong Kok Staging Pickup", description: "Pickup", code: "fotomax-pickup-mong-kok-staging" },
    insufficient_inventory: false,
    service_zone: { fulfillment_set: { location: { address: { address_1: "Test Mong Kok Location", city: "Mong Kok", country_code: "hk" } } } },
  },
]

const emptyCart = { id: "cart_123", currency_code: "hkd", items: [], subtotal: 0, shipping_total: 0, tax_total: 0, total: 0 }

describe("projectContact", () => {
  const metadata = {
    fotomax_checkout_first_name: "Ada",
    fotomax_checkout_last_name: "Lovelace",
    fotomax_checkout_phone: "+85261234567",
    fotomax_delivery_address: {
      address_1: "1 Queen's Road",
      address_2: "Flat A",
      city: "Central",
      postal_code: "999077",
      country_code: "hk",
    },
  }

  it("rehydrates the form from the saved delivery address", () => {
    expect(projectContact(metadata, "ada@example.com")).toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+85261234567",
      address: {
        address1: "1 Queen's Road",
        address2: "Flat A",
        city: "Central",
        postalCode: "999077",
        countryCode: "hk",
      },
    })
  })

  it("survives a pickup selection, which overwrites the cart address", () => {
    // shipping_address now holds the branch, but metadata still has the copy.
    expect(projectContact(metadata, "ada@example.com").address).toMatchObject({
      address1: "1 Queen's Road",
    })
  })

  it.each([undefined, null, {}, { fotomax_delivery_address: null }, "nope"])(
    "reports no saved address for metadata %s",
    (source) => {
      expect(projectContact(source, null)).toEqual({
        email: null,
        firstName: null,
        lastName: null,
        phone: null,
        address: null,
      })
    },
  )

  it("ignores a stored address missing its required parts", () => {
    expect(
      projectContact({ fotomax_delivery_address: { address_1: "1 Queen's Road" } }, null).address,
    ).toBeNull()
  })

  it("falls back to the stored address for a name the contact keys lack", () => {
    expect(
      projectContact(
        { fotomax_delivery_address: { ...metadata.fotomax_delivery_address, first_name: "Grace" } },
        null,
      ),
    ).toMatchObject({ firstName: "Grace" })
  })
})

describe("checkout adapter", () => {
  it("projects delivery and bilingual pickup options with compatibility reasons", () => {
    const options = projectShippingOptions(rawOptions, branches, "zh-HK")
    expect(options).toMatchObject([
      { id: "so_delivery", kind: "delivery", compatible: true, price: { amount: 4000 } },
      { id: "so_central", kind: "pickup", branchHandle: "central-staging", compatible: true, label: "Central Staging Pickup" },
      { id: "so_mong-kok", compatible: false, reasonCode: "retail_out_of_stock" },
    ])
    expect(options[0]?.label).toBe("香港送貨")
  })

  it("rejects invalid email and accepts delivery input for address validation at selection", () => {
    expect(() => parseContactInput({ email: "bad", firstName: "Ada", lastName: "Lovelace", phone: "55555555", address: null })).toThrowError(CheckoutError)
    expect(() => parseFulfillmentInput({ kind: "delivery", shippingOptionId: "so_delivery", branchHandle: null })).not.toThrow()
  })

  it("expands the saved cart address before validating delivery", async () => {
    let requestedFields = ""
    const cart = {
      ...emptyCart,
      shipping_address: {
        address_1: "Test address",
        city: "Hong Kong",
        country_code: "hk",
      },
    }
    const sdk = {
      store: {
        cart: {
          retrieve: async (_id: string, query: { fields?: string }) => {
            requestedFields = query.fields ?? ""
            return { cart }
          },
          update: async () => ({ cart }),
          addShippingMethod: async () => ({ cart }),
          complete: async () => ({ type: "cart", cart: {}, error: {} }),
        },
        fulfillment: {
          listCartOptions: async () => ({ shipping_options: rawOptions }),
        },
        payment: {
          listPaymentProviders: async () => ({ payment_providers: [] }),
          initiatePaymentSession: async () => ({ payment_collection: {} }),
        },
      },
    }
    const options = projectShippingOptions(rawOptions, branches, "en")

    await createCheckoutAdapter(sdk).setFulfillment(
      "cart_123",
      parseFulfillmentInput({
        kind: "delivery",
        shippingOptionId: "so_delivery",
        branchHandle: null,
      }),
      options,
    )

    expect(requestedFields).toContain("*shipping_address")
  })
  it("replaces a previous shipping method and preserves the cart while blocking incompatible pickup", async () => {
    const calls: string[] = []
    const sdk = {
      store: {
        cart: {
          retrieve: async () => ({ cart: emptyCart }),
          update: async (_id: string, body: Record<string, unknown>) => { calls.push("update:" + String(body.shipping_address ? "address" : "contact")); return { cart: emptyCart } },
          addShippingMethod: async () => { calls.push("add"); return { cart: emptyCart } },
          complete: async () => ({ type: "cart", cart: {}, error: { type: "invalid_data", name: "InvalidData", message: "stale total" } }),
        },
        fulfillment: { listCartOptions: async () => ({ shipping_options: rawOptions }) },
        payment: { listPaymentProviders: async () => ({ payment_providers: [{ id: "pp_system_default" }] }), initiatePaymentSession: async () => ({ payment_collection: { id: "pay_col", payment_sessions: [{ id: "pay_ses", provider_id: "pp_system_default", status: "pending" }] } }) },
      },
    }
    const adapter = createCheckoutAdapter(sdk)
    const options = projectShippingOptions(rawOptions, branches, "en")
    await expect(adapter.setFulfillment("cart_123", parseFulfillmentInput({ kind: "pickup", shippingOptionId: "so_mong-kok", branchHandle: "mong-kok-staging" }), options)).rejects.toMatchObject({ code: "incompatible_branch" })
    await adapter.setFulfillment("cart_123", parseFulfillmentInput({ kind: "pickup", shippingOptionId: "so_central", branchHandle: "central-staging" }), options)
    expect(calls).toEqual(["update:address", "add"])
  })

  it("survives delivery to pickup and back without losing the shopper's address", async () => {
    const customerAddress = {
      first_name: "Ada",
      last_name: "Lovelace",
      address_1: "1 Queen's Road",
      address_2: "Flat A",
      city: "Central",
      postal_code: "999077",
      country_code: "hk",
      phone: "+85261234567",
    }
    const cart: Record<string, unknown> = {
      ...emptyCart,
      shipping_address: { ...customerAddress },
      metadata: {
        fotomax_checkout_first_name: "Ada",
        fotomax_checkout_last_name: "Lovelace",
        fotomax_checkout_phone: "+85261234567",
        fotomax_delivery_address: { ...customerAddress },
      },
    }
    const writes: Array<Record<string, unknown>> = []
    const sdk = {
      store: {
        cart: {
          retrieve: async () => ({ cart }),
          update: async (_id: string, body: Record<string, unknown>) => {
            if (body.shipping_address) {
              writes.push(body.shipping_address as Record<string, unknown>)
              cart.shipping_address = body.shipping_address
            }
            return { cart }
          },
          addShippingMethod: async () => ({ cart }),
          complete: async () => ({ type: "order", order: {} }),
        },
        fulfillment: { listCartOptions: async () => ({ shipping_options: rawOptions }) },
        payment: {
          listPaymentProviders: async () => ({ payment_providers: [{ id: "pp_system_default" }] }),
          initiatePaymentSession: async () => ({ payment_collection: {} }),
        },
      },
    }
    const adapter = createCheckoutAdapter(sdk)
    const options = projectShippingOptions(rawOptions, branches, "en")

    await adapter.setFulfillment(
      "cart_123",
      parseFulfillmentInput({ kind: "pickup", shippingOptionId: "so_central", branchHandle: "central-staging" }),
      options,
    )

    // Branch staff still get a name and phone to hand the order over.
    expect(writes[0]).toMatchObject({
      address_1: "Test Central Location",
      first_name: "Ada",
      last_name: "Lovelace",
      phone: "+85261234567",
    })

    await adapter.setFulfillment(
      "cart_123",
      parseFulfillmentInput({ kind: "delivery", shippingOptionId: "so_delivery", branchHandle: null }),
      options,
    )

    // Switching back restores the shopper's own address rather than shipping the
    // parcel to the Fotomax store.
    expect(writes[1]).toMatchObject({ address_1: "1 Queen's Road", city: "Central" })
    expect(cart.shipping_address).toMatchObject({ address_1: "1 Queen's Road" })
  })

  it("refuses to complete a delivery order still addressed to the pickup branch", async () => {
    const cart = {
      ...emptyCart,
      items: [{ id: "line_1", variant_id: "variant_1", title: "Print", quantity: 1, unit_price: 10, subtotal: 10, variant: { product: { metadata: { commerce_mode: "retail" } } } }],
      subtotal: 10,
      total: 10,
      shipping_methods: [{ shipping_option_id: "so_delivery" }],
      shipping_address: { address_1: "Test Central Location", city: "Central", country_code: "hk" },
      metadata: {
        fotomax_delivery_address: { address_1: "1 Queen's Road", city: "Central", country_code: "hk" },
      },
    }
    const sdk = {
      store: {
        cart: {
          retrieve: async () => ({ cart }),
          update: async () => ({ cart }),
          addShippingMethod: async () => ({ cart }),
          complete: async () => ({ type: "order", order: {} }),
        },
        fulfillment: { listCartOptions: async () => ({ shipping_options: rawOptions }) },
        payment: {
          listPaymentProviders: async () => ({ payment_providers: [{ id: "pp_system_default" }] }),
          initiatePaymentSession: async () => ({ payment_collection: {} }),
        },
      },
    }

    await expect(
      createCheckoutAdapter(sdk).validate("cart_123", "en", branches),
    ).rejects.toMatchObject({ code: "missing_delivery_address" })
  })

  it("maps a cart completion conflict to a stale checkout blocker", async () => {
    const sdk = {
      store: {
        cart: { retrieve: async () => ({ cart: emptyCart }), update: async () => ({ cart: emptyCart }), addShippingMethod: async () => ({ cart: emptyCart }), complete: async () => ({ type: "cart", cart: {}, error: { type: "invalid_data", name: "InvalidData", message: "stale total" } }) },
        fulfillment: { listCartOptions: async () => ({ shipping_options: [] }) },
        payment: { listPaymentProviders: async () => ({ payment_providers: [{ id: "pp_system_default" }] }), initiatePaymentSession: async () => ({ payment_collection: {} }) },
      },
    }
    await expect(createCheckoutAdapter(sdk).complete("cart_123", "delivery", "customer@example.com")).rejects.toMatchObject({ code: "stale_checkout_total" })
  })
})
