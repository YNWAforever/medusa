import { waitForHealthyBackend } from "./staging-health.mjs"

const storefrontUrl = process.env.STAGING_STOREFRONT_URL?.replace(/\/$/, "")
const medusaUrl = process.env.STAGING_MEDUSA_URL?.replace(/\/$/, "")
const publishableKey = process.env.STAGING_MEDUSA_PUBLISHABLE_KEY ?? process.env.MEDUSA_PUBLISHABLE_KEY

if (!storefrontUrl || !medusaUrl) {
  throw new Error("STAGING_STOREFRONT_URL and STAGING_MEDUSA_URL are required")
}
if (!publishableKey) {
  throw new Error("STAGING_MEDUSA_PUBLISHABLE_KEY or MEDUSA_PUBLISHABLE_KEY is required")
}

const headers = {
  accept: "application/json",
  "content-type": "application/json",
  "x-publishable-api-key": publishableKey,
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  })
  const text = await response.text()
  let body = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Preserve HTML or plain text in the error below.
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`)
  }
  return body
}

const evidence = {
  checkedAt: new Date().toISOString(),
  storefrontUrl,
  medusaUrl,
  orderEmail: `phase-2a-staging-${Date.now()}@fotomax.test`,
}

const health = await waitForHealthyBackend(medusaUrl)
console.log(`Medusa healthy after ${health.attempt} attempt(s)`)
for (const locale of ["en", "zh-HK"]) {
  const response = await fetch(`${storefrontUrl}/${locale}`)
  if (!response.ok) throw new Error(`GET /${locale} returned ${response.status}`)
  evidence[`storefront_${locale}`] = response.status
}

const regions = await request(medusaUrl, "/store/regions")
const region = regions.regions?.find((candidate) => candidate.currency_code?.toLowerCase() === "hkd")
if (!region?.id) throw new Error("No HKD region was returned")

const products = await request(
  medusaUrl,
  "/store/products?handle=instax-mini-film-pack&fields=id,handle,*variants",
)
const product = products.products?.[0]
const variant = product?.variants?.find((candidate) => candidate.manage_inventory === true)
if (!variant?.id) throw new Error("No retail inventory variant was returned")

const cart = (await request(medusaUrl, "/store/carts", {
  method: "POST",
  body: JSON.stringify({ region_id: region.id }),
})).cart
await request(medusaUrl, `/store/carts/${cart.id}/line-items`, {
  method: "POST",
  body: JSON.stringify({ variant_id: variant.id, quantity: 1 }),
})
await request(medusaUrl, `/store/carts/${cart.id}`, {
  method: "POST",
  body: JSON.stringify({
    email: evidence.orderEmail,
    shipping_address: {
      first_name: "Fotomax",
      last_name: "Staging",
      address_1: "Staging verification address",
      city: "Hong Kong",
      postal_code: "000000",
      country_code: "hk",
    },
  }),
})

const shipping = await request(medusaUrl, `/store/shipping-options?cart_id=${encodeURIComponent(cart.id)}`)
const delivery = shipping.shipping_options?.find((option) => option.data?.fulfillment_kind === "delivery")
if (!delivery?.id) throw new Error("No delivery shipping option was returned")
await request(medusaUrl, `/store/carts/${cart.id}/shipping-methods`, {
  method: "POST",
  body: JSON.stringify({ option_id: delivery.id }),
})

const paymentCollection = (await request(medusaUrl, "/store/payment-collections", {
  method: "POST",
  body: JSON.stringify({ cart_id: cart.id }),
})).payment_collection
const payment = await request(
  medusaUrl,
  `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
  { method: "POST", body: JSON.stringify({ provider_id: "pp_system_default" }) },
)
if (!payment.payment_collection?.payment_sessions?.some((session) => session.provider_id === "pp_system_default")) {
  throw new Error("System payment session was not created")
}

const completion = await request(medusaUrl, `/store/carts/${cart.id}/complete`, { method: "POST" })
if (completion.type !== "order" || !completion.order?.id) {
  throw new Error(`Retail order did not complete: ${JSON.stringify(completion)}`)
}

evidence.orderId = completion.order.id
evidence.displayId = completion.order.display_id
evidence.total = completion.order.total
console.log(JSON.stringify(evidence, null, 2))
