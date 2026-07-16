# Fotomax Phase 2A Transaction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public fixture-backed commerce runtime with live Medusa catalog, inventory, cart, customer, fulfillment, simulated payment, and order flows for fixed-SKU retail purchases.

**Architecture:** Keep Next.js as a same-origin backend-for-frontend. Server Components read catalog data through a server-only Medusa SDK client; browser mutations call Next.js Route Handlers that forward to Medusa. Cart IDs and customer JWTs live in secure HttpOnly cookies. Medusa remains authoritative for commerce state and runs locally in shared mode, then in separate server and worker modes in staging.

**Tech Stack:** npm workspaces, Node.js 20+, Next.js 16 App Router, React 19, TypeScript, Medusa 2.17.2, Medusa JS SDK 2.17.2, PostgreSQL 16, Redis 7.4, Vitest, Jest with `@medusajs/test-utils`, Playwright, Docker Compose, Vercel, Medusa Cloud.

## Global Constraints

- This plan implements only Phase 2A from `docs/superpowers/specs/2026-07-11-fotomax-phase-2-transaction-photo-commerce-design.md`.
- Public and staging runtime code must never import the Phase 1 catalog fixtures as a fallback. Shared fixtures remain seed and test inputs only.
- Medusa owns products, variants, prices, inventory, carts, customers, shipping, payment sessions, and orders.
- The browser must never receive the Medusa customer JWT, cart cookie, database credentials, or secret API keys.
- Customer-facing routes and errors must support both `en` and `zh-HK`.
- Checkout stays guest-first. Creating or signing into an account is optional.
- One completed order uses either Hong Kong delivery or one pickup branch. Split fulfillment is outside Phase 2.
- The only enabled payment provider is Medusa's system provider. No external charge, capture, or webhook is added.
- Initial branches and inventory are visibly marked staging test data and must not be represented as real store availability.
- Provisioning Medusa Cloud or any paid service, creating cloud resources, or rotating secrets requires a fresh explicit user approval during execution.
- Keep the existing Vercel storefront. The preferred approved staging topology is Vercel for Next.js and Medusa Cloud for Medusa API/Admin/worker plus managed PostgreSQL and Redis.
- Run a focused test after every behavior change and commit at the end of every task.

## Plan Dependencies

- Starts from commit `70b5855` or a descendant containing the approved Phase 2 design.
- Produces the `CatalogProduct`, `CartView`, `CustomerView`, and `CheckoutState` contracts consumed unchanged by Phase 2B and Phase 2C.
- Phase 2B must not begin until Task 10 passes locally.

---

## File Structure

- `compose.yaml`: local PostgreSQL and Redis services with health checks and named volumes.
- `apps/medusa/.env.example`: non-secret local Medusa runtime contract.
- `apps/storefront/.env.example`: server-only Medusa and storefront-session runtime contract.
- `apps/medusa/src/infrastructure-modules.ts`: conditional Redis infrastructure-module configuration.
- `apps/medusa/src/modules/branch-capability/*`: test branch and print-capability records linked to stock locations.
- `apps/medusa/src/scripts/seed-data.ts`: exact staging branch, capability, shipping, and inventory inputs.
- `apps/medusa/src/scripts/seed.ts`: idempotent reconciliation of region, catalog, sales channel, locations, fulfillment, API key, and inventory.
- `apps/medusa/src/api/store/branches/route.ts`: public branch compatibility endpoint.
- `apps/storefront/src/lib/medusa/contracts.ts`: stable storefront DTOs shared by all Phase 2 slices.
- `apps/storefront/src/lib/medusa/client.ts`: server-only JS SDK factory.
- `apps/storefront/src/lib/medusa/session.ts`: HttpOnly cookie names and options.
- `apps/storefront/src/lib/medusa/catalog.ts`: live catalog queries and bilingual projection.
- `apps/storefront/src/lib/medusa/cart.ts`: cart creation, retrieval, and line mutations.
- `apps/storefront/src/lib/medusa/auth.ts`: registration, login, customer, and order-history operations.
- `apps/storefront/src/lib/medusa/checkout.ts`: fulfillment, payment, completion, and confirmation projection.
- `apps/storefront/app/api/cart/*`: same-origin cart Route Handlers.
- `apps/storefront/app/api/auth/*`: same-origin account Route Handlers.
- `apps/storefront/app/api/checkout/*`: same-origin checkout Route Handlers.
- `apps/storefront/app/[locale]/account/*`: localized login, registration, and order-history pages.
- `apps/storefront/app/[locale]/checkout/*`: localized checkout and confirmation pages.
- `apps/medusa/integration-tests/http/retail-checkout.spec.ts`: real Medusa commerce integration path.
- `apps/storefront/e2e/retail-checkout.spec.ts`: desktop/mobile bilingual browser journey.
- `scripts/verify-phase-2a-staging.mjs`: deployment-specific staging checks.
- `docs/deployment/fotomax-phase-2-staging.md`: environment, migration, seed, deploy, rollback, and evidence runbook.
- `docs/verification/fotomax-phase-2a.md`: local and live evidence ledger.

---

### Task 1: Add Production-Shaped Local Runtime Configuration

**Files:**
- Modify: `package.json`
- Create: `compose.yaml`
- Modify: `apps/medusa/package.json`
- Create: `apps/medusa/.env.example`
- Create: `apps/storefront/.env.example`
- Modify: `apps/medusa/src/runtime-env.ts`
- Modify: `apps/medusa/src/runtime-env.test.ts`
- Create: `apps/medusa/src/infrastructure-modules.ts`
- Create: `apps/medusa/src/infrastructure-modules.test.ts`
- Modify: `apps/medusa/medusa-config.ts`

**Interfaces:**
- Consumes: existing `loadRuntimeEnv` and Medusa configuration.
- Produces: `RuntimeEnv.workerMode`, `RuntimeEnv.disableAdmin`, `RuntimeEnv.redisUrl`, and `buildInfrastructureModules(env)`; healthy local PostgreSQL/Redis endpoints.

- [ ] **Step 1: Write failing runtime and infrastructure tests**

Add assertions for these exact rules:

```ts
expect(loadRuntimeEnv({ NODE_ENV: "development" })).toMatchObject({
  workerMode: "shared",
  disableAdmin: false,
  redisUrl: "redis://localhost:6379",
  isMedusaCloud: false,
})

expect(loadRuntimeEnv({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://db/fotomax",
  STORE_CORS: "https://staging.example.com",
  ADMIN_CORS: "https://api.example.com",
  AUTH_CORS: "https://staging.example.com",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
  REDIS_URL: "redis://cache:6379",
  MEDUSA_WORKER_MODE: "worker",
  DISABLE_MEDUSA_ADMIN: "true",
})).toMatchObject({ workerMode: "worker", disableAdmin: true })
```

In `infrastructure-modules.test.ts`, assert that a normal Redis deployment gets event bus, caching, locking, and workflow-engine modules, while an environment containing `MEDUSA_CLOUD_ENVIRONMENT_TYPE=long-lived` gets an empty list so Medusa Cloud can inject its own providers.

- [ ] **Step 2: Run the focused tests and confirm red**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/runtime-env.test.ts src/infrastructure-modules.test.ts`

Expected: FAIL because the new fields and infrastructure-module builder do not exist.

- [ ] **Step 3: Add direct Medusa infrastructure dependencies**

Add these exact production dependencies to `apps/medusa/package.json`, pinned to the backend version:

```json
{
  "@medusajs/caching-redis": "2.17.2",
  "@medusajs/event-bus-redis": "2.17.2",
  "@medusajs/locking-redis": "2.17.2",
  "@medusajs/workflow-engine-redis": "2.17.2"
}
```

Replace the existing `^2.17.2` ranges for `@medusajs/admin-sdk`, `@medusajs/cli`, `@medusajs/core-flows`, `@medusajs/framework`, and `@medusajs/medusa` with exact `2.17.2` versions in the same edit. Redis infrastructure packages, core workflows, framework types, Admin SDK, and JS SDK must stay on one Medusa release.

Run: `npm.cmd install`

Expected: PASS and update `package-lock.json` without changing the Medusa version.

- [ ] **Step 4: Implement runtime parsing and conditional Redis modules**

Use the following public shape in `runtime-env.ts`:

```ts
export type MedusaWorkerMode = "shared" | "server" | "worker"

export interface RuntimeEnv {
  databaseUrl: string
  redisUrl?: string
  workerMode: MedusaWorkerMode
  disableAdmin: boolean
  isMedusaCloud: boolean
  storeCors: string
  adminCors: string
  authCors: string
  jwtSecret: string
  cookieSecret: string
}
```

Reject any `MEDUSA_WORKER_MODE` outside the three declared values. In `buildInfrastructureModules`, return `[]` on Medusa Cloud; otherwise require `redisUrl` outside development and return the four Redis module definitions using `redisUrl`.

Wire `projectConfig.workerMode`, `admin.disable`, and `modules` into `medusa-config.ts`. Keep `MEDUSA_FF_CACHING=true` in both env examples.

- [ ] **Step 5: Add local services and root scripts**

Create PostgreSQL `16-alpine` on port `5432` and Redis `7.4-alpine` on port `6379`. Give each a health check and named volume. Add root scripts:

```json
{
  "infra:up": "docker compose up -d --wait postgres redis",
  "infra:down": "docker compose down",
  "db:migrate": "npm run db:migrate --workspace @fotomax/medusa",
  "setup:local": "npm run infra:up && npm run db:migrate && npm run seed:medusa"
}
```

Add the backend scripts that the root commands and later plans consume:

```json
{
  "db:generate": "node ./medusa-cli.cjs db:generate",
  "db:migrate": "node ./medusa-cli.cjs db:migrate",
  "predeploy": "node ./medusa-cli.cjs db:migrate"
}
```

Use database `fotomax`, user `fotomax`, and password `fotomax_local_only` only in local Compose and `.env.example`.

- [ ] **Step 6: Verify runtime configuration**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/runtime-env.test.ts src/infrastructure-modules.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck --workspace @fotomax/medusa`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json package-lock.json compose.yaml apps/medusa apps/storefront/.env.example
git commit -m "chore: add Medusa transaction runtime"
```

---

### Task 2: Classify and Reconcile the Live Medusa Catalog

**Files:**
- Modify: `packages/shared/src/catalog.ts`
- Modify: `packages/shared/src/catalog.test.ts`
- Modify: `apps/medusa/src/scripts/seed.ts`
- Modify: `apps/medusa/src/scripts/seed.test.ts`
- Modify: `apps/medusa/src/scripts/seed-loader.test.ts`
- Create: `apps/medusa/src/scripts/reconcile.ts`
- Create: `apps/medusa/src/scripts/reconcile.test.ts`

**Interfaces:**
- Consumes: Phase 1 bilingual category/product fixtures as seed input only.
- Produces: repeatable Medusa region, collection, product, variant, sales-channel, and publishable-key records keyed by stable handles/SKUs.

- [ ] **Step 1: Write failing classification tests**

Extend `Product` with this exact field:

```ts
export type CommerceMode = "retail" | "photo_print" | "deferred"

export interface Product {
  // existing fields remain unchanged
  commerceMode: CommerceMode
}
```

Assert this exact release classification:

```ts
expect(Object.fromEntries(products.map((product) => [product.handle, product.commerceMode]))).toEqual({
  "classic-4r-photo-print": "photo_print",
  "premium-layflat-photobook": "deferred",
  "photo-mug-gift": "deferred",
  "instax-mini-film-pack": "retail",
  "desktop-acrylic-photo-block": "deferred",
})
```

Add reconciliation tests showing that an existing handle/SKU is updated, a missing one is created, and a second run plans zero creates.

- [ ] **Step 2: Confirm red**

Run: `npm.cmd run test --workspace @fotomax/shared -- src/catalog.test.ts`

Expected: FAIL because `commerceMode` is absent.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/scripts/reconcile.test.ts`

Expected: FAIL because `reconcile.ts` is absent.

- [ ] **Step 3: Implement deterministic reconciliation**

Add a pure helper with this contract:

```ts
export interface ReconcilePlan<TCreate, TUpdate> {
  create: TCreate[]
  update: TUpdate[]
}

export function reconcileByKey<TDesired, TExisting, TCreate, TUpdate>(args: {
  desired: readonly TDesired[]
  existing: readonly TExisting[]
  desiredKey: (value: TDesired) => string
  existingKey: (value: TExisting) => string
  toCreate: (value: TDesired) => TCreate
  toUpdate: (desired: TDesired, existing: TExisting) => TUpdate
}): ReconcilePlan<TCreate, TUpdate>
```

Refactor `seed.ts` to query by region name, collection handle, product handle, variant SKU, sales-channel name, and publishable-key title before calling create/update workflows. The second invocation must update matching reference records instead of duplicating them.

Use metadata keys `title_zh_hk`, `description_zh_hk`, `badge_en`, `badge_zh_hk`, and `commerce_mode`. Publish only `retail` and `photo_print`; mark `deferred` products as draft.

Create one sales channel named `Fotomax Hong Kong Staging` and one publishable key titled `Fotomax Storefront Staging`, then link them idempotently.

- [ ] **Step 4: Verify seed payload and reconciliation**

Run: `npm.cmd run test --workspace @fotomax/shared -- src/catalog.test.ts`

Expected: PASS.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/scripts/seed.test.ts src/scripts/seed-loader.test.ts src/scripts/reconcile.test.ts`

Expected: PASS, including price conversion to HKD major units and stable SKU checks.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/shared apps/medusa/src/scripts package-lock.json
git commit -m "feat: reconcile live Fotomax catalog"
```

---

### Task 3: Seed Branches, Pickup, Delivery, and Test Inventory

**Files:**
- Create: `apps/medusa/src/modules/branch-capability/models/branch-capability.ts`
- Create: `apps/medusa/src/modules/branch-capability/service.ts`
- Create: `apps/medusa/src/modules/branch-capability/index.ts`
- Create: `apps/medusa/src/modules/branch-capability/migrations/Migration20260711000100.ts`
- Create: `apps/medusa/src/links/stock-location-branch-capability.ts`
- Create: `apps/medusa/src/scripts/seed-data.ts`
- Create: `apps/medusa/src/scripts/seed-data.test.ts`
- Modify: `apps/medusa/src/scripts/seed.ts`
- Create: `apps/medusa/src/api/store/branches/route.ts`
- Create: `apps/medusa/src/api/store/branches/route.unit.spec.ts`

**Interfaces:**
- Consumes: the staging sales channel and product variants from Task 2.
- Produces: three test stock locations, retail inventory levels, delivery/pickup shipping options, and `GET /store/branches?cart_id=cart_123`.

- [ ] **Step 1: Lock the exact test branch dataset**

Create `seed-data.test.ts` first and assert three unique handles, `testOnly: true`, positive lead times, and inventory only for `retail` SKUs. Then create this exact data in `seed-data.ts`:

```ts
export const stagingBranches = [
  {
    handle: "central-staging",
    name: { en: "Central Staging Pickup", "zh-HK": "中環測試取貨點" },
    district: { en: "Central", "zh-HK": "中環" },
    leadTimeBusinessDays: 2,
    testOnly: true,
  },
  {
    handle: "mong-kok-staging",
    name: { en: "Mong Kok Staging Pickup", "zh-HK": "旺角測試取貨點" },
    district: { en: "Mong Kok", "zh-HK": "旺角" },
    leadTimeBusinessDays: 2,
    testOnly: true,
  },
  {
    handle: "sha-tin-staging",
    name: { en: "Sha Tin Staging Pickup", "zh-HK": "沙田測試取貨點" },
    district: { en: "Sha Tin", "zh-HK": "沙田" },
    leadTimeBusinessDays: 3,
    testOnly: true,
  },
] as const

export const retailInventoryPerBranch = 25
export const supportedPrintSkus = [
  "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-1",
  "FOTOMAX-CLASSIC-4R-PHOTO-PRINT-2",
] as const
```

Map each branch to `address: { address1: "Staging Test Location - No Customer Visits", city: branch.district.en, countryCode: "hk" }` before writing the stock location and cart address. This is the exact test pickup address and must never be replaced with a real-looking street address.

- [ ] **Step 2: Confirm red and implement the branch-capability module**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/scripts/seed-data.test.ts`

Expected: FAIL because `seed-data.ts` is absent.

Define `BranchCapability` with unique `handle`, localized names/districts, `pickup_enabled`, `test_only`, `lead_time_business_days`, and JSON `supported_print_skus`. Link it to Medusa Stock Location with `defineLink`.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/scripts/seed-data.test.ts`

Expected: PASS.

- [ ] **Step 3: Reconcile fulfillment and inventory**

Extend `seed.ts` in this order:

1. Reconcile three stock locations and link each to `Fotomax Hong Kong Staging`.
2. Reconcile one fulfillment set per location with a pickup service zone for Hong Kong.
3. Reconcile one delivery fulfillment set and a flat `HKD 40` Hong Kong delivery option.
4. Reconcile one `HKD 0` pickup shipping option per branch with metadata `{ fulfillment_kind: "pickup", branch_handle }`.
5. Set `manage_inventory: true` only on retail variants.
6. Reconcile inventory items and levels of `25` at every branch for every retail variant.
7. Reconcile branch-capability records and their stock-location links.
8. Associate Medusa's system payment provider with the Hong Kong region.

Do not create inventory levels for `photo_print` or `deferred` variants.

- [ ] **Step 4: Add branch compatibility projection**

Implement `GET /store/branches?cart_id=cart_123` returning:

```ts
export interface StoreBranchOption {
  id: string
  handle: string
  name: { en: string; "zh-HK": string }
  district: { en: string; "zh-HK": string }
  leadTimeBusinessDays: number
  compatible: boolean
  reasonCode: "retail_out_of_stock" | "print_not_supported" | null
  shippingOptionId: string
}
```

For Phase 2A, compatibility checks every managed retail line against the branch inventory level. Keep `print_not_supported` in the contract for Phase 2B. Require the publishable key, validate `cart_id`, and return `404` for a missing cart.

- [ ] **Step 5: Run seed twice against local infrastructure**

Run: `npm.cmd run infra:up`

Expected: PostgreSQL and Redis report healthy.

Run: `npm.cmd run db:migrate && npm.cmd run seed:medusa && npm.cmd run seed:medusa`

Expected: both seed runs succeed; the second run creates no duplicate branch, product, location, shipping-option, API-key, inventory-item, or inventory-level records.

- [ ] **Step 6: Verify and commit Task 3**

Run: `npm.cmd run test --workspace @fotomax/medusa`

Expected: PASS.

```bash
git add apps/medusa
git commit -m "feat: seed staging fulfillment and inventory"
```

---

### Task 4: Establish the Storefront Medusa SDK and Stable DTOs

**Files:**
- Modify: `apps/storefront/package.json`
- Create: `apps/storefront/src/lib/medusa/contracts.ts`
- Create: `apps/storefront/src/lib/medusa/env.ts`
- Create: `apps/storefront/src/lib/medusa/env.test.ts`
- Create: `apps/storefront/src/lib/medusa/client.ts`
- Create: `apps/storefront/src/lib/medusa/projectors.ts`
- Create: `apps/storefront/src/lib/medusa/projectors.test.ts`
- Create: `apps/storefront/src/lib/medusa/catalog.ts`
- Create: `apps/storefront/src/lib/medusa/catalog.test.ts`

**Interfaces:**
- Consumes: Medusa Store API and publishable key from Tasks 2-3.
- Produces: the canonical Phase 2 storefront DTO contract and server-only live catalog access.

- [ ] **Step 1: Add the direct JS SDK dependency**

Add `"@medusajs/js-sdk": "2.17.2"` to `apps/storefront/package.json`, run `npm.cmd install`, and confirm `npm.cmd ls @medusajs/js-sdk` resolves one 2.17.2 version.

- [ ] **Step 2: Define the canonical contracts before implementation**

Create these public shapes in `contracts.ts`; later plans may only add fields, not rename or reinterpret existing ones:

```ts
export type Locale = "en" | "zh-HK"
export type MoneyView = { amount: number; currencyCode: "hkd" }
export type CommerceMode = "retail" | "photo_print" | "deferred"

export interface CatalogVariant {
  id: string
  title: string
  sku: string
  options: Array<{ name: string; value: string }>
  price: MoneyView
  inventory: { managed: boolean; available: boolean; quantity: number | null }
}

export interface CatalogProduct {
  id: string
  handle: string
  title: string
  description: string
  thumbnail: string | null
  collectionHandle: string | null
  badge: string | null
  commerceMode: CommerceMode
  variants: CatalogVariant[]
}

export interface CatalogCategory {
  id: string
  handle: string
  title: string
  summary: string
  products: CatalogProduct[]
}

export interface CartLineView {
  id: string
  kind: "retail" | "photo_print"
  variantId: string
  title: string
  thumbnail: string | null
  quantity: number
  unitPrice: MoneyView
  subtotal: MoneyView
  photoJobVersionId: string | null
  photoCount: number | null
}

export interface CartView {
  id: string | null
  currencyCode: "hkd"
  items: CartLineView[]
  itemCount: number
  subtotal: MoneyView
  shippingTotal: MoneyView
  taxTotal: MoneyView
  total: MoneyView
  email: string | null
}

export interface CustomerView {
  id: string
  email: string
  firstName: string
  lastName: string
}

export type FulfillmentChoice =
  | { kind: "delivery"; shippingOptionId: string }
  | { kind: "pickup"; shippingOptionId: string; branchHandle: string }

export interface CheckoutState {
  cart: CartView
  customer: CustomerView | null
  fulfillment: FulfillmentChoice | null
  stage: "contact" | "fulfillment" | "review" | "payment" | "complete"
  blockers: Array<{ code: string; message: string; recoveryHref: string }>
}
```

`MoneyView.amount` is always a non-negative integer in HKD cents. Project Medusa's HKD major-unit amounts into cents once at the DTO boundary; UI, cart grouping, confirmation cookies, and later photo quotes must not mix units.

- [ ] **Step 3: Write failing env and projection tests**

Test that `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`, and `STOREFRONT_SESSION_SECRET` are mandatory for a production build. Feed realistic Medusa collection/product responses into projector tests and assert English and Traditional Chinese projection, HKD minor-unit normalization, stock status, and rejection of unknown `commerce_mode`.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa`

Expected: FAIL because env, client, projector, and catalog modules are not implemented.

- [ ] **Step 4: Implement a server-only SDK factory**

Use `import "server-only"` and instantiate the SDK per request:

```ts
const sdk = new Medusa({
  baseUrl: env.backendUrl,
  publishableKey: env.publishableKey,
  auth: { type: "jwt", jwtTokenStorageMethod: "memory" },
})

if (token) await sdk.client.setToken(token)
```

Expose `createStoreSdk(token?: string)` and no browser bundle export. `catalog.ts` must call `sdk.store.collection.list` and `sdk.store.product.list`, request explicit fields, paginate until complete, and project by locale. Do not catch a network error and return fixtures.

- [ ] **Step 5: Verify and commit Task 4**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa`

Expected: PASS.

Run: `npm.cmd run typecheck --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront package-lock.json
git commit -m "feat: add typed Medusa storefront client"
```

---

### Task 5: Move Every Catalog Route to Live Medusa Data

**Files:**
- Modify: `apps/storefront/src/lib/catalog-view.ts`
- Modify: `apps/storefront/src/lib/catalog-view.test.ts`
- Create: `apps/storefront/src/content/services.ts`
- Modify: `apps/storefront/app/[locale]/page.tsx`
- Modify: `apps/storefront/app/[locale]/categories/[handle]/page.tsx`
- Modify: `apps/storefront/app/[locale]/products/[handle]/page.tsx`
- Modify: `apps/storefront/app/[locale]/services/[handle]/page.tsx`
- Modify: `apps/storefront/src/components/home-page.tsx`
- Modify: `apps/storefront/src/components/category-page.tsx`
- Modify: `apps/storefront/src/components/category-product-grid.tsx`
- Modify: `apps/storefront/src/components/product-card.tsx`
- Modify: `apps/storefront/src/components/product-detail.tsx`
- Modify: `apps/storefront/src/components/catalog-pages.test.tsx`
- Modify: `apps/storefront/src/components/home-page.test.tsx`
- Modify: `apps/storefront/src/app-routing.test.ts`

**Interfaces:**
- Consumes: `CatalogCategory` and `CatalogProduct` from Task 4.
- Produces: SSR catalog routes with no runtime dependency on `@fotomax/shared` catalog fixtures.

- [ ] **Step 1: Make route tests reject fixture runtime imports**

Add an architectural test that scans runtime files under `app/` and `src/` and fails when they import `products`, `categories`, or `serviceEntries` from `@fotomax/shared`. Allow `Locale` and i18n helpers until those are deliberately migrated.

Update component tests to pass explicit `CatalogProduct` and `CatalogCategory` DTOs rather than calling shared fixture selectors.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/app-routing.test.ts src/components/catalog-pages.test.tsx`

Expected: FAIL because current routes and components still consume fixture-backed views.

- [ ] **Step 2: Convert routes and components**

Make page components async and call the live access layer. Preserve existing localized URLs and `notFound()` behavior. Remove fixture-derived `generateStaticParams`; live catalog pages use dynamic SSR with a 60-second catalog revalidation tag.

Move non-commerce service page copy into `src/content/services.ts` so public runtime does not import `serviceEntries`. Deferred products remain hidden because Medusa returns only published products.

`HomePage`, `CategoryPage`, `ProductCard`, and `ProductDetail` must consume DTO props. Keep the current imagery, responsive structure, and accessibility behavior while replacing data ownership.

- [ ] **Step 3: Verify both locales against local Medusa**

Run: `npm.cmd run test --workspace @fotomax/storefront`

Expected: PASS.

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS with `MEDUSA_BACKEND_URL=http://localhost:9000`, the seeded publishable key, and no fixture fallback.

- [ ] **Step 4: Commit Task 5**

```bash
git add apps/storefront
git commit -m "feat: serve live Medusa catalog"
```

---

### Task 6: Replace Browser-Local Cart State with a Medusa Cart BFF

**Files:**
- Create: `apps/storefront/src/lib/medusa/session.ts`
- Create: `apps/storefront/src/lib/medusa/session.test.ts`
- Create: `apps/storefront/src/lib/medusa/cart.ts`
- Create: `apps/storefront/src/lib/medusa/cart.test.ts`
- Create: `apps/storefront/app/api/cart/route.ts`
- Create: `apps/storefront/app/api/cart/items/route.ts`
- Create: `apps/storefront/app/api/cart/items/[lineId]/route.ts`
- Create: `apps/storefront/src/app-api-cart.test.ts`
- Modify: `apps/storefront/src/components/cart-provider.tsx`
- Modify: `apps/storefront/src/components/cart-drawer.tsx`
- Modify: `apps/storefront/src/components/cart-components.test.tsx`
- Modify: `apps/storefront/src/lib/cart-state.ts`
- Modify: `apps/storefront/src/lib/cart-state.test.ts`
- Modify: `apps/storefront/app/[locale]/cart/page.tsx`

**Interfaces:**
- Consumes: Medusa cart SDK methods and `CartView` from Task 4.
- Produces: `GET /api/cart`, `POST /api/cart/items`, and `PATCH|DELETE /api/cart/items/:lineId`; HttpOnly `fm_cart_id` cookie.

- [ ] **Step 1: Specify cookie and API behavior in failing tests**

The cookie helper must return:

```ts
export const CART_COOKIE = "fm_cart_id"

export const cartCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}
```

Route tests must cover lazy cart creation, stale cart-cookie recovery, add/increment/update/remove, malformed quantities, Medusa `409` mapping, and never returning a `set-cookie` value in JSON.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/session.test.ts src/lib/medusa/cart.test.ts src/app-api-cart.test.ts`

Expected: FAIL because the BFF does not exist.

- [ ] **Step 2: Implement server cart operations**

`GET /api/cart` returns an empty `CartView` when there is no cookie. `POST /api/cart/items` accepts only:

```ts
type AddCartItemInput = { variantId: string; quantity: number }
```

Create a Medusa cart with the seeded Hong Kong region on the first mutation, set `fm_cart_id`, then call `sdk.store.cart.createLineItem`. Updates require integer quantities from 1 to 99. Deletes call `deleteLineItem`. A Medusa `404` clears the stale cookie and returns a localized recoverable error code `cart_expired`.

Project all responses to `CartView`; never return raw Medusa records.

- [ ] **Step 3: Make `CartProvider` asynchronous and persistent**

Replace React-only product state with `CartView`, `isLoading`, `mutationError`, `refresh`, `addVariant`, `updateLine`, and `removeLine`. Use same-origin `fetch` with credentials and optimistic busy states, but use the server response as the final source of truth.

Preserve drawer focus restoration, Escape close, quantity announcements, empty state, and mobile layout. Keep `cart-state.ts` only for pure projection/grouping helpers used by tests; remove fixture `Product` from its public types.

- [ ] **Step 4: Verify and commit Task 6**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/cart-state.test.ts src/components/cart-components.test.tsx src/app-api-cart.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront
git commit -m "feat: persist carts through Medusa"
```

---

### Task 7: Add Retail Variant Selection and Pickup Availability

**Files:**
- Create: `apps/storefront/src/components/product-purchase-panel.tsx`
- Create: `apps/storefront/src/components/product-purchase-panel.test.tsx`
- Modify: `apps/storefront/src/components/add-to-cart-button.tsx`
- Modify: `apps/storefront/src/components/product-detail.tsx`
- Create: `apps/storefront/src/lib/medusa/branches.ts`
- Create: `apps/storefront/src/lib/medusa/branches.test.ts`
- Create: `apps/storefront/app/api/branches/route.ts`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: live product variants, persistent cart, and Medusa `GET /store/branches`.
- Produces: a selected retail variant can be added once; branch availability is informative before checkout.

- [ ] **Step 1: Write interaction tests**

Cover option selection, unavailable variants, loading state, one add request per activation, localized failure recovery, and keyboard operation. Assert that `photo_print` renders a localized editor-entry action gated by `NEXT_PUBLIC_PHOTO_PRINT_ENABLED`; with the flag absent it renders an honest unavailable state and does not add a raw print variant.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/components/product-purchase-panel.test.tsx src/lib/medusa/branches.test.ts`

Expected: FAIL because the purchase panel and branch adapter do not exist.

- [ ] **Step 2: Implement the retail purchase panel**

Use native radio groups or selects for variant options, show one HKD price and availability state, and call `addVariant(selectedVariant.id, 1)`. Do not render a rounded text control when a native selector or familiar icon control is clearer.

Proxy `/api/branches?cartId=cart_123` to the custom Medusa Store route and project locale at the BFF. Do not expose test inventory as real-world stock; label every branch with localized staging wording from Task 3.

- [ ] **Step 3: Verify and commit Task 7**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/components/product-purchase-panel.test.tsx src/components/catalog-pages.test.tsx`

Expected: PASS.

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront
git commit -m "feat: add live retail purchase controls"
```

---

### Task 8: Add Optional Customer Accounts and Order History

**Files:**
- Create: `apps/storefront/src/lib/medusa/auth.ts`
- Create: `apps/storefront/src/lib/medusa/auth.test.ts`
- Create: `apps/storefront/app/api/auth/register/route.ts`
- Create: `apps/storefront/app/api/auth/login/route.ts`
- Create: `apps/storefront/app/api/auth/logout/route.ts`
- Create: `apps/storefront/app/api/account/route.ts`
- Create: `apps/storefront/app/api/account/orders/route.ts`
- Create: `apps/storefront/src/app-api-auth.test.ts`
- Create: `apps/storefront/src/components/account-form.tsx`
- Create: `apps/storefront/src/components/account-form.test.tsx`
- Create: `apps/storefront/app/[locale]/account/login/page.tsx`
- Create: `apps/storefront/app/[locale]/account/register/page.tsx`
- Create: `apps/storefront/app/[locale]/account/orders/page.tsx`
- Modify: `apps/storefront/src/components/site-header.tsx`
- Modify: `apps/storefront/src/lib/medusa/session.ts`

**Interfaces:**
- Consumes: Medusa email/password auth and customer/order Store APIs.
- Produces: HttpOnly `fm_customer_token`, optional account creation/sign-in/out, and authenticated order history.

- [ ] **Step 1: Write auth boundary tests**

Assert that registration calls `sdk.auth.register("customer", "emailpass", credentials)`, creates the customer, then performs a normal login. Assert that login accepts only a string token response, stores it in an HttpOnly cookie for eight hours, and attaches an existing cart to the authenticated customer. Route JSON must contain `CustomerView`, never the JWT.

Cover invalid credentials, duplicate email, expired token, logout cookie clearing, unauthenticated order-history `401`, and cross-customer order retrieval rejection.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/auth.test.ts src/app-api-auth.test.ts`

Expected: FAIL because the auth boundary is absent.

- [ ] **Step 2: Implement stateless server-side SDK auth**

Instantiate a fresh in-memory SDK per Route Handler. On login, store the returned JWT in `fm_customer_token`. On authenticated requests, call `sdk.client.setToken(cookieValue)` before customer/cart/order operations. Never use browser local storage for auth.

After login or registration, update the existing cart while authenticated so Medusa associates it with the customer. On logout, clear only the customer token; keep the guest cart unless Medusa invalidates it.

- [ ] **Step 3: Add localized account pages**

Use labeled email, password, first-name, and last-name controls with inline validation plus an accessible error summary. The order-history page renders order date, display ID, total, status, and fulfillment state. Empty, loading, and expired-session states must be distinct.

- [ ] **Step 4: Verify and commit Task 8**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/auth.test.ts src/app-api-auth.test.ts src/components/account-form.test.tsx`

Expected: PASS.

Run: `npm.cmd run typecheck --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront
git commit -m "feat: add optional Fotomax accounts"
```

---

### Task 9: Complete Delivery, Pickup, System Payment, and Order Confirmation

**Files:**
- Create: `apps/storefront/src/lib/medusa/checkout.ts`
- Create: `apps/storefront/src/lib/medusa/checkout.test.ts`
- Create: `apps/storefront/src/lib/confirmation-cookie.ts`
- Create: `apps/storefront/src/lib/confirmation-cookie.test.ts`
- Create: `apps/storefront/app/api/checkout/route.ts`
- Create: `apps/storefront/app/api/checkout/contact/route.ts`
- Create: `apps/storefront/app/api/checkout/fulfillment/route.ts`
- Create: `apps/storefront/app/api/checkout/payment/route.ts`
- Create: `apps/storefront/app/api/checkout/complete/route.ts`
- Create: `apps/storefront/src/app-api-checkout.test.ts`
- Create: `apps/storefront/src/components/checkout-flow.tsx`
- Create: `apps/storefront/src/components/checkout-flow.test.tsx`
- Create: `apps/storefront/app/[locale]/checkout/page.tsx`
- Create: `apps/storefront/app/[locale]/checkout/confirmation/page.tsx`
- Modify: `apps/storefront/app/[locale]/cart/page.tsx`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: Medusa cart, branch compatibility, shipping-option, system-payment, and completion APIs.
- Produces: a complete guest or account retail order and a private 15-minute confirmation view.

- [ ] **Step 1: Write checkout state-machine tests**

Cover these transitions and blockers:

```ts
contact -> fulfillment -> review -> payment -> complete
```

Delivery requires a Hong Kong address. Pickup requires one compatible branch and replaces the cart shipping address with that test branch address. Changing fulfillment removes the previous shipping method before adding the new one. Completion must re-retrieve cart totals and branch/inventory validity before initiating the system payment session.

Cover empty cart, invalid email, missing address, incompatible branch, inventory conflict, stale total, payment-session failure, duplicate completion, and localized recovery hrefs.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/checkout.test.ts src/app-api-checkout.test.ts`

Expected: FAIL because checkout is absent.

- [ ] **Step 2: Implement server-authoritative checkout operations**

Use `sdk.store.fulfillment.listCartOptions`, `sdk.store.cart.addShippingMethod`, `sdk.store.payment.listPaymentProviders`, `sdk.store.payment.initiatePaymentSession`, and `sdk.store.cart.complete`. Select the provider returned for Medusa's system payment module; reject any provider outside the allowlist.

The BFF accepts contact/address/branch identifiers, never prices. Map all Medusa conflicts to typed blocker codes while retaining the cart. Clear `fm_cart_id` only after a successful order response.

- [ ] **Step 3: Protect guest confirmation details**

Sign and encrypt a minimal confirmation payload with `STOREFRONT_SESSION_SECRET`:

```ts
export interface OrderConfirmationView {
  orderId: string
  displayId: number
  email: string
  total: MoneyView
  fulfillmentKind: "delivery" | "pickup"
  createdAt: string
}
```

Store it in HttpOnly `fm_order_confirmation` with `sameSite=lax`, `secure` in production, and `maxAge=900`. The confirmation page reads and immediately clears it. An expired or forged cookie shows a localized privacy-safe recovery state without querying another customer's order.

- [ ] **Step 4: Build the localized checkout UI**

Use a compact stepper, one form section at a time, a delivery/pickup segmented control, disabled branches with visible reasons, a final order summary, and a single complete-order command. Preserve user input after recoverable failures and move focus to the error summary.

- [ ] **Step 5: Verify and commit Task 9**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/checkout.test.ts src/app-api-checkout.test.ts src/components/checkout-flow.test.tsx`

Expected: PASS.

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront
git commit -m "feat: complete simulated retail checkout"
```

---

### Task 10: Add Integration Gates and Deploy Phase 2A Staging

**Files:**
- Modify: `apps/medusa/package.json`
- Create: `apps/medusa/jest.config.js`
- Create: `apps/medusa/integration-tests/http/retail-checkout.spec.ts`
- Modify: `apps/storefront/playwright.config.ts`
- Create: `apps/storefront/e2e/retail-checkout.spec.ts`
- Create: `.github/workflows/phase-2a.yml`
- Create: `scripts/verify-phase-2a-staging.mjs`
- Create: `docs/deployment/fotomax-phase-2-staging.md`
- Create: `docs/verification/fotomax-phase-2a.md`

**Interfaces:**
- Consumes: all Phase 2A APIs and UI.
- Produces: repeatable local/CI verification and deployment-specific public staging evidence.

- [ ] **Step 1: Add Medusa integration-test plumbing**

Add direct dev dependencies `@medusajs/test-utils@2.17.2`, `jest@29.7.0`, and `ts-jest@29.2.5`. Configure a separate `test:integration` script so Vitest unit tests remain unchanged.

Write one real-database integration test that seeds twice, creates a retail cart, reserves inventory for pickup, initiates the system payment session, completes the order, verifies the order and reservation in Medusa, cancels it, and verifies inventory release. Also assert the order appears through the Admin query boundary.

Run: `npm.cmd run test:integration --workspace @fotomax/medusa`

Expected: FAIL at the first incomplete seed, shipping, payment, or reservation boundary. Fix only the production path exposed by the failure, rerunning until PASS.

- [ ] **Step 2: Replace Phase 1 browser expectations**

Add Playwright coverage in both locales and both configured viewports for:

1. Live catalog request and retail variant selection.
2. Cart persistence across reload.
3. Guest delivery checkout and confirmation.
4. Guest pickup checkout at a compatible test branch.
5. Account registration, checkout, logout/login, and order history.
6. Out-of-stock branch disabled with a reason.
7. Medusa unavailability and expired-cart recovery.
8. No horizontal overflow, uncaught exceptions, failed media, or console errors.

Remove the obsolete assertion that checkout is coming soon.

- [ ] **Step 3: Add CI and staging verification scripts**

The workflow must start PostgreSQL and Redis services, run migrations, seed twice, run `npm.cmd run check`, run Medusa integration tests, and run Playwright. `verify-phase-2a-staging.mjs` accepts `STAGING_STOREFRONT_URL` and `STAGING_MEDUSA_URL`, checks deployment-specific `/health`, catalog, both locales, and a system-payment retail order using unique test email data.

The deployment runbook must record required env names, migration-before-deploy order, seed idempotency, worker health, rollback rules, deployment IDs, and how to revoke test accounts. It must explicitly state that application rollback never reverses database migrations.

- [ ] **Step 4: Run the complete local gate**

Run: `npm.cmd run infra:up`

Run: `npm.cmd run db:migrate && npm.cmd run seed:medusa && npm.cmd run seed:medusa`

Run: `npm.cmd run check`

Run: `npm.cmd run test:integration --workspace @fotomax/medusa`

Run: `npm.cmd run e2e --workspace @fotomax/storefront`

Expected: all commands PASS. Record counts, durations, and environment versions in `docs/verification/fotomax-phase-2a.md`.

- [ ] **Step 5: Stop for explicit cloud-resource approval**

Present the concrete staging request before creating anything:

- Existing Vercel project remains the storefront host.
- Medusa Cloud long-lived staging environment hosts API, Admin, worker, PostgreSQL, and Redis.
- No production domain, real payment provider, real email, or production inventory is enabled.
- State the current monthly plan price and any usage charges from the provider UI at execution time.

Do not continue until the user explicitly approves provisioning and secret creation.

- [ ] **Step 6: Deploy and verify after approval**

Create the Medusa Cloud project/environment, connect the repository and branch, set storefront CORS/auth origins, create secure JWT/cookie/session secrets, apply migrations, seed reference data twice, and capture the backend deployment ID. Set `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`, and `STOREFRONT_SESSION_SECRET` in the Vercel staging environment, redeploy, and capture the Vercel deployment ID.

Run: `node scripts/verify-phase-2a-staging.mjs`

Expected: PASS against the two exact deployment URLs. Then use browser verification at 1440x900 and 375x812 for `/en`, `/zh-HK`, retail product, cart, delivery checkout, pickup checkout, account orders, and Medusa Admin order visibility.

- [ ] **Step 7: Commit Task 10**

```bash
git add apps .github scripts docs package.json package-lock.json
git commit -m "test: verify Phase 2A transaction foundation"
```

---

## Phase 2A Completion Gate

- [ ] `npm.cmd run check` passes.
- [ ] Medusa unit and integration suites pass against PostgreSQL and Redis.
- [ ] Playwright passes both locales on desktop and mobile.
- [ ] A fixed-SKU retail order completes with delivery and with pickup.
- [ ] Inventory reservation and release are visible in Medusa.
- [ ] Optional account order history works without exposing guest or other-customer orders.
- [ ] Public staging uses live Medusa data and has no runtime fixture fallback.
- [ ] Deployment-specific backend, worker, storefront, and Admin evidence is recorded.
- [ ] The branch is clean after the final task commit.

## Implementation References

- [Medusa production deployment and worker split](https://docs.medusajs.com/learn/deployment/general)
- [Medusa worker mode](https://docs.medusajs.com/learn/production/worker-mode)
- [Medusa Cloud projects and managed resources](https://docs.medusajs.com/cloud/projects)
- [Medusa Cloud Redis configuration](https://docs.medusajs.com/cloud/redis)
