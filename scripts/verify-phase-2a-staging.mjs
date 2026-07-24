import { randomBytes, randomUUID } from "node:crypto"
import sharp from "sharp"

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

function crc32c(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0)
    }
  }
  const output = Buffer.alloc(4)
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return output.toString("base64")
}

async function waitForPhotoAsset(jobId, assetId, photoHeaders) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const body = await request(medusaUrl, `/store/photo-jobs/${jobId}`, { headers: photoHeaders })
    const asset = body.photo_job?.assets?.find((candidate) => candidate.id === assetId)
    if (asset?.status === "ready") return asset
    if (["failed", "blocked"].includes(asset?.status)) {
      throw new Error(`Synthetic photo was ${asset.status}: ${asset.failure_code ?? "unknown"}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Synthetic photo did not become ready: ${assetId}`)
}
const evidence = {
  checkedAt: new Date().toISOString(),
  storefrontUrl,
  medusaUrl,
  orderEmail: `phase-2b-staging-${Date.now()}@fotomax.test`,
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
const guestToken = randomBytes(32).toString("base64url")
const photoHeaders = { "x-fotomax-guest-token": guestToken }
const photoJob = (await request(medusaUrl, "/store/photo-jobs", {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({ locale: "en" }),
})).photo_job
const image = await sharp({
  create: { width: 1800, height: 1200, channels: 3, background: { r: 31, g: 121, b: 109 } },
}).jpeg({ quality: 86 }).toBuffer()
const checksumCRC32C = crc32c(image)
const upload = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/uploads`, {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({
    filename: "phase-2b-synthetic.jpg",
    reportedMime: "image/jpeg",
    bytes: image.length,
    sourceIdempotencyKey: randomUUID(),
    signatureBase64: image.subarray(0, 64).toString("base64"),
  }),
})).upload
const part = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/uploads/${upload.sessionId}/parts`, {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({ partNumber: 1, checksumCRC32C }),
})).part
const put = await fetch(part.url, { method: "PUT", headers: part.requiredHeaders, body: image })
const etag = put.headers.get("etag")
if (!put.ok || !etag) throw new Error(`Synthetic photo PUT returned ${put.status}`)
await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/uploads/${upload.sessionId}/complete`, {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({ parts: [{ partNumber: 1, etag, checksumCRC32C }] }),
})
const photoAsset = await waitForPhotoAsset(photoJob.id, upload.assetId, photoHeaders)
const currentPhotoJob = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}`, { headers: photoHeaders })).photo_job
const photoVersion = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/versions`, {
  method: "POST",
  headers: { ...photoHeaders, "idempotency-key": randomUUID() },
  body: JSON.stringify({
    expectedRevision: currentPhotoJob.revision,
    defaults: { finish: "glossy", border: "none", cropMode: "fill", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 1 },
    overrides: [],
    warningAcknowledgements: [],
  }),
})).version
const photoQuote = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/quote`, {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({ versionId: photoVersion.id, fulfillment: { type: "delivery" } }),
})).quote
const attachedCart = (await request(medusaUrl, `/store/photo-jobs/${photoJob.id}/cart`, {
  method: "POST",
  headers: photoHeaders,
  body: JSON.stringify({ cartId: cart.id }),
})).cart
const attachedPhotoLines = attachedCart?.items?.filter(
  (line) => line.metadata?.kind === "photo_print",
) ?? []
if (!attachedPhotoLines.some(
  (line) => line.metadata?.photo_job_version_id === photoVersion.id
    && line.metadata?.photo_manifest_digest === photoQuote.manifestDigest,
)) {
  throw new Error("Attached cart did not contain the quoted photo version")
}
if (!attachedCart?.items?.some((line) => line.metadata?.kind !== "photo_print")) {
  throw new Error("Attached cart did not retain the retail line")
}
evidence.photoJobId = photoJob.id
evidence.photoAssetId = photoAsset.id
evidence.photoVersionId = photoVersion.id
evidence.photoSubtotal = photoQuote.subtotal
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
const orderPhotoLines = completion.order.items?.filter(
  (line) => line.metadata?.kind === "photo_print",
) ?? []
if (!orderPhotoLines.some(
  (line) => line.metadata?.photo_job_version_id === photoVersion.id
    && line.metadata?.photo_manifest_digest === photoQuote.manifestDigest,
)) {
  throw new Error("Completed order did not preserve the photo version link")
}
const orderedPhotoJob = (await request(
  medusaUrl,
  `/store/photo-jobs/${photoJob.id}`,
  { headers: photoHeaders },
)).photo_job
if (
  orderedPhotoJob.status !== "ordered"
  || orderedPhotoJob.active_version?.id !== photoVersion.id
) {
  throw new Error("Photo job did not freeze against the completed order")
}

evidence.orderId = completion.order.id
evidence.displayId = completion.order.display_id
evidence.total = completion.order.total
console.log(JSON.stringify(evidence, null, 2))
