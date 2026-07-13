import path from "node:path"

import { beforeAll, describe, expect, it } from "@jest/globals"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  medusaIntegrationTestRunner,
  type MedusaSuiteOptions,
} from "@medusajs/test-utils"

import seedFotomax from "../../src/scripts/seed"

const appRoot = path.resolve(__dirname, "../..")
const stagingKeyTitle = "Fotomax Storefront Staging"
const systemPaymentProvider = "pp_system_default"

const env = {
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  DB_HOST: process.env.DB_HOST ?? "localhost",
  DB_PORT: process.env.DB_PORT ?? "5432",
  DB_USERNAME: process.env.DB_USERNAME ?? "fotomax",
  DB_PASSWORD: process.env.DB_PASSWORD ?? "fotomax_local_only",
  MEDUSA_WORKER_MODE: "shared",
  STORE_CORS: "http://localhost:3000,http://localhost:3100",
  ADMIN_CORS: "http://localhost:9000,http://localhost:3000",
  AUTH_CORS: "http://localhost:9000,http://localhost:3000",
  JWT_SECRET: process.env.JWT_SECRET ?? "fotomax-local-jwt-secret",
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? "fotomax-local-cookie-secret",
}

type QueryRecord = Record<string, unknown>

function asRecord(value: unknown): QueryRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as QueryRecord
    : {}
}

async function applySeededPublishableKey(
  options: MedusaSuiteOptions,
): Promise<void> {
  const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY)
  const response = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token"],
    filters: { title: stagingKeyTitle },
  })
  const key = asRecord(response.data?.[0])
  const token = typeof key.token === "string" ? key.token : null
  if (!token) throw new Error("Seed did not expose the storefront publishable key")
  options.api.defaults.headers.common["x-publishable-api-key"] = token
}

async function findRetailVariant(options: MedusaSuiteOptions) {
  const response = await options.api.get("/store/products", {
    params: {
      handle: "instax-mini-film-pack",
      fields: "id,handle,*variants",
    },
  })
  const product = asRecord(response.data.products?.[0])
  const variants = Array.isArray(product.variants) ? product.variants : []
  const variant = variants
    .map(asRecord)
    .find((candidate) => candidate.manage_inventory === true)
  if (!variant?.id) throw new Error("Seed did not expose a retail inventory variant")
  return variant
}

async function queryReservations(options: MedusaSuiteOptions, lineItemId: string) {
  const query = options.getContainer().resolve(ContainerRegistrationKeys.QUERY)
  const response = await query.graph({
    entity: "reservation",
    fields: ["id", "line_item_id", "quantity", "inventory_item_id"],
    filters: { line_item_id: lineItemId },
  })
  return response.data.filter((record: unknown) => asRecord(record).line_item_id === lineItemId)
}

medusaIntegrationTestRunner({
  moduleName: "fotomax-retail-checkout",
  cwd: appRoot,
  env,
  testSuite: (options) => {
    describe("Fotomax retail checkout", () => {
      beforeAll(async () => {
        const container = options.getContainer()
        if (!container) throw new Error("Medusa integration app did not initialize; check PostgreSQL and Redis")
        await seedFotomax({ container } as ExecArgs)
        await seedFotomax({ container } as ExecArgs)
        await applySeededPublishableKey(options)
      })

      it("places a pickup order, exposes it to Admin, and releases inventory on cancellation", async () => {
        const regionResponse = await options.api.get("/store/regions")
        const region = regionResponse.data.regions.find(
          (candidate: QueryRecord) => candidate.currency_code === "hkd",
        )
        expect(region?.id).toBeTruthy()

        const variant = await findRetailVariant(options)
        const branchResponse = await options.api.get("/store/branches")
        const branch = branchResponse.data.branches.find(
          (candidate: QueryRecord) => candidate.testOnly === true && candidate.pickupEnabled === true,
        )
        expect(branch?.shippingOptionId).toBeTruthy()

        const cartResponse = await options.api.post("/store/carts", {
          region_id: region.id,
        })
        const cart = asRecord(cartResponse.data.cart)
        const cartId = String(cart.id)
        const lineResponse = await options.api.post(`/store/carts/${cartId}/line-items`, {
          variant_id: variant.id,
          quantity: 1,
        })
        const line = asRecord(lineResponse.data.cart?.items?.[0])
        const lineItemId = String(line.id)

        await options.api.post(`/store/carts/${cartId}`, {
          email: `phase-2a-${Date.now()}@fotomax.test`,
          shipping_address: {
            first_name: "Fotomax",
            last_name: "Integration",
            address_1: "Test pickup address",
            city: "Hong Kong",
            postal_code: "000000",
            country_code: "hk",
          },
        })
        const shippingResponse = await options.api.get("/store/shipping-options", {
          params: { cart_id: cartId, fields: "id,name,amount,data,metadata,type,insufficient_inventory,service_zone.*" },
        })
        const pickupOption = shippingResponse.data.shipping_options.find(
          (candidate: QueryRecord) => candidate.id === branch.shippingOptionId,
        )
        expect(pickupOption?.id).toBeTruthy()
        await options.api.post(`/store/carts/${cartId}/shipping-methods`, {
          option_id: pickupOption.id,
        })

        const refreshedCart = (await options.api.get(`/store/carts/${cartId}`)).data.cart
        const paymentCollectionResponse = await options.api.post("/store/payment-collections", {
          cart_id: cartId,
        })
        const paymentCollection = paymentCollectionResponse.data.payment_collection
        const paymentSessionResponse = await options.api.post(
          `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
          { provider_id: systemPaymentProvider },
        )
        expect(paymentSessionResponse.data.payment_collection.payment_sessions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ provider_id: systemPaymentProvider }),
          ]),
        )

        const reservationsBeforeCompletion = await queryReservations(options, lineItemId)
        expect(reservationsBeforeCompletion.length).toBeGreaterThan(0)

        const completion = await options.api.post(`/store/carts/${cartId}/complete`)
        expect(completion.data.type).toBe("order")
        const order = asRecord(completion.data.order)
        expect(order.id).toBeTruthy()

        const adminOrder = await options.api.get(`/admin/orders/${order.id}`)
        expect(adminOrder.data.order.id).toBe(order.id)

        const reservationsAfterCompletion = await queryReservations(options, lineItemId)
        expect(reservationsAfterCompletion.length).toBeGreaterThan(0)
        await options.api.post(`/admin/orders/${order.id}/cancel`)

        const reservationsAfterCancellation = await queryReservations(options, lineItemId)
        expect(reservationsAfterCancellation.length).toBeLessThanOrEqual(
          reservationsBeforeCompletion.length,
        )
        expect(refreshedCart.id).toBe(cartId)
      })
    })
  },
})
