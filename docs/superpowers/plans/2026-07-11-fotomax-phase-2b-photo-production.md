# Fotomax Phase 2B Photo Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-shaped standard 4R photo-print journey with private resumable uploads, asynchronous validation and previews, batch configuration, authoritative quotes, grouped cart lines, immutable order instructions, operator controls, and automatic media retention.

**Architecture:** Implement photo printing as a custom Medusa module, not as trusted client metadata. Originals upload directly to private S3-compatible storage through signed multipart operations. Medusa stores ownership, lifecycle, asset metadata, immutable versions, and print instructions in PostgreSQL; workers process images from events. Next.js keeps photo credentials in HttpOnly cookies and exposes a same-origin editor/BFF. Medusa workflows validate and attach quoted versions to carts, and cart-completion hooks freeze them on the resulting order.

**Tech Stack:** Phase 2A stack, Medusa custom modules/workflows/hooks/Admin extensions, PostgreSQL, Redis locks/events/workflow engine, AWS SDK v3, MinIO for local S3 compatibility, AWS S3 `ap-east-1` for staging, Uppy 5 multipart uploads, Sharp 0.35.3, `heic-convert` 2.1.0, React, Vitest, Jest integration tests, Playwright.

## Global Constraints

- Complete and verify Phase 2A before starting this plan.
- Phase 2B supports only the published `classic-4r-photo-print` family: 4 x 6 inch output, glossy or matte Medusa variants.
- Photobooks, personalized gifts, document printing, freeform layouts, and production-capacity scheduling remain outside scope.
- Accepted sources in this plan are device/system-picker files. Google Photos and Dropbox arrive in Phase 2C through the same ingestion contract.
- Accepted source formats are JPEG, PNG, WebP, HEIC, and HEIF. Reject renamed files whose signatures do not match.
- Limits are 50 MiB per file, 500 files per job, 10 GiB per job, and 120 megapixels decoded per image.
- Images below 320 pixels on either axis are blocked. Estimated print quality is `good` at 250 PPI or higher, `caution` at 150-249 PPI, and `poor` below 150 PPI. `caution` and `poor` require visible acknowledgement but do not discard the upload.
- Browser uploads use 8 MiB consecutive parts, CRC32C checksums, 15-minute upload signatures, and randomized object keys.
- Preview output is metadata-stripped sRGB JPEG, longest edge 1600 pixels, quality 82. Originals are never destructively modified.
- Object buckets are private, block public access, and use server-side encryption. No reusable object URL, provider token, customer filename, or image bytes may appear in logs.
- Guest photo credentials remain in secure HttpOnly cookies and are stored only as SHA-256 hashes in Medusa.
- Configuration versions and ordered production instructions are immutable. Editing always creates a new version.
- Price, availability, capability, and cart totals are calculated by Medusa. The browser never submits a trusted amount.
- Standard retention is seven days after eligible abandoned-draft activity and thirty days after fulfillment.
- Provisioning the staging S3 bucket, IAM principal, lifecycle policy, or any paid resource requires explicit user approval during execution.
- Use application records as deletion evidence; never retain image bytes in evidence.
- Run focused tests and commit after every task.

## Plan Dependencies

- Consumes Phase 2A `CatalogProduct`, `CartView`, `CartLineView`, `CustomerView`, `CheckoutState`, `fm_cart_id`, and `fm_customer_token` without changing their existing meaning.
- Extends `CartLineView` only through its already-declared `kind`, `photoJobVersionId`, and `photoCount` fields.
- Produces the canonical `PhotoJobView` and `PhotoSourceAdapter`-ready import model consumed by Phase 2C.
- Phase 2C must not begin until Task 10 passes locally and on the Phase 2B staging deployment.

---

## File Structure

- `apps/medusa/src/modules/photo-production/models/*`: photo job, asset, import session, immutable version, print item, and access-audit models.
- `apps/medusa/src/modules/photo-production/service.ts`: generated CRUD plus explicit lifecycle operations.
- `apps/medusa/src/modules/photo-storage/*`: private S3-compatible storage contract and AWS SDK implementation.
- `apps/medusa/src/workflows/process-photo-asset.ts`: asynchronous validation, conversion, metadata, preview, and quality workflow.
- `apps/medusa/src/workflows/quote-photo-job.ts`: server-authoritative price and capability workflow.
- `apps/medusa/src/workflows/attach-photo-job-to-cart.ts`: idempotent grouped-line attachment.
- `apps/medusa/src/workflows/hooks/complete-cart-photo-validation.ts`: checkout revalidation and version freezing.
- `apps/medusa/src/workflows/hooks/create-order-photo-link.ts`: order/version and order-line links.
- `apps/medusa/src/api/store/photo-jobs/*`: customer/guest photo-job, upload, version, quote, cart, and preview APIs.
- `apps/medusa/src/api/admin/photo-jobs/*`: operations search, manifest, audited access, retry, and status APIs.
- `apps/medusa/src/admin/routes/photo-production/*`: focused Medusa Admin production screen.
- `apps/medusa/src/jobs/photo-retention.ts`: idempotent expiry and deletion scheduler.
- `apps/storefront/src/lib/photo/contracts.ts`: canonical `PhotoJobView` and editor types.
- `apps/storefront/src/lib/photo/client.ts`: same-origin photo BFF client.
- `apps/storefront/src/lib/photo/uploader.ts`: Uppy AWS S3 multipart adapter.
- `apps/storefront/src/components/photo-editor/*`: upload, progress, batch settings, grid, warnings, preview, quote, and cart UI.
- `apps/storefront/app/api/photo-jobs/*`: same-origin BFF Route Handlers.
- `apps/storefront/app/[locale]/photo-jobs/[jobId]/page.tsx`: resumable editor route.
- `apps/medusa/integration-tests/http/photo-production.spec.ts`: end-to-end backend photo workflow.
- `apps/storefront/e2e/photo-production.spec.ts`: bilingual desktop/mobile device-upload journey.
- `docs/verification/fotomax-phase-2b.md`: local and staging evidence.

---

### Task 1: Create the Photo Production Domain and State Machine

**Files:**
- Create: `apps/medusa/src/modules/photo-production/models/photo-job.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-asset.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-import-session.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-job-version.ts`
- Create: `apps/medusa/src/modules/photo-production/models/print-item.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-asset-access-audit.ts`
- Create: `apps/medusa/src/modules/photo-production/service.ts`
- Create: `apps/medusa/src/modules/photo-production/index.ts`
- Create: `apps/medusa/src/modules/photo-production/migrations/Migration20260711000200.ts`
- Create: `apps/medusa/src/modules/photo-production/state-machine.ts`
- Create: `apps/medusa/src/modules/photo-production/state-machine.test.ts`
- Modify: `apps/medusa/medusa-config.ts`

**Interfaces:**
- Consumes: Medusa module registration and PostgreSQL from Phase 2A.
- Produces: authoritative photo aggregates and pure guarded lifecycle transitions.

- [ ] **Step 1: Define and test exact lifecycle transitions**

Create the failing test first for this public contract:

```ts
export type PhotoJobStatus =
  | "draft"
  | "uploading"
  | "importing"
  | "processing"
  | "ready"
  | "cart_attached"
  | "ordered"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "expired"

export type PhotoAssetStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "blocked"
  | "failed"
  | "deleted"

export function assertPhotoJobTransition(from: PhotoJobStatus, to: PhotoJobStatus): void
export function assertPhotoAssetTransition(from: PhotoAssetStatus, to: PhotoAssetStatus): void
```

Allow the main lifecycle plus `failed -> processing`, `cart_attached -> ready`, active/failed states to `cancelled`, `ordered -> cancelled` only after Medusa order cancellation, `ordered -> fulfilled` only after Medusa fulfillment, and eligible non-ordered states to `expired`. Reject edits from `ordered`, `fulfilled`, `cancelled`, or `expired`.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/state-machine.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Define models with immutable/version fields**

Use Medusa DML models with these required ownership and concurrency fields:

```ts
type PhotoJobOwnership = {
  guest_owner_hash: string | null
  customer_id: string | null
}

type PhotoJobConcurrency = {
  revision: number
  active_version_id: string | null
  cart_id: string | null
  order_id: string | null
}
```

`PhotoJob` stores region, locale, currency, product handle, status, ownership, revision, lifecycle timestamps, retention class, and failure code. Enforce exactly one owner at creation.

`PhotoAsset` stores job relation, source type/provider ID, sanitized display name, randomized original/preview keys, reported and detected MIME, bytes, CRC32C/SHA-256 checksums, width, height, orientation, status, quality band/PPI, warnings/errors JSON, attempt count, failure class, dead-letter timestamp, and activity/retention/deletion timestamps.

`PhotoImportSession` stores job/asset relations, source type, source idempotency key, storage upload ID, part size, expected bytes, state, and expiry. Do not store signed URLs.

`PhotoJobVersion` stores job relation, monotonically increasing sequence, source revision, status, subtotal/currency, quote timestamps, manifest SHA-256 digest, cart attachment, and order freeze timestamps.

`PrintItem` stores version/asset relations, Medusa variant ID/SKU, size `4R`, finish, border, crop mode, normalized crop JSON, quantity, unit-price snapshot, and warning acknowledgements.

`PhotoAssetAccessAudit` stores asset ID, actor ID/type, reason, action, expiry, request correlation ID, and timestamp, but no signed URL.

- [ ] **Step 3: Generate migration and register the module**

Register the module as `photoProduction`. Generate the migration with Medusa's migration command, inspect the SQL for unique constraints on import idempotency and `(photo_job_id, sequence)`, then keep the deterministic migration filename listed above.

Run: `npm.cmd run db:generate --workspace @fotomax/medusa -- photoProduction`

Run: `npm.cmd run db:migrate`

Expected: migration applies once and a second run reports no pending migration.

- [ ] **Step 4: Verify and commit Task 1**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/state-machine.test.ts`

Run: `npm.cmd run typecheck --workspace @fotomax/medusa`

Expected: PASS.

```bash
git add apps/medusa
git commit -m "feat: add photo production domain"
```

---

### Task 2: Enforce Guest and Customer Photo-Job Ownership

**Files:**
- Create: `apps/medusa/src/modules/photo-production/ownership.ts`
- Create: `apps/medusa/src/modules/photo-production/ownership.test.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/claim/route.ts`
- Create: `apps/medusa/src/api/middlewares.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/route.unit.spec.ts`
- Modify: `apps/storefront/src/lib/medusa/session.ts`
- Modify: `apps/storefront/src/lib/medusa/session.test.ts`
- Create: `apps/storefront/src/lib/photo/ownership.ts`
- Create: `apps/storefront/src/lib/photo/ownership.test.ts`
- Create: `apps/storefront/app/api/photo-jobs/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/route.ts`
- Create: `apps/storefront/app/api/account/photo-jobs/route.ts`
- Create: `apps/storefront/src/components/account-photo-jobs.tsx`
- Create: `apps/storefront/src/components/account-photo-jobs.test.tsx`
- Create: `apps/storefront/app/[locale]/account/photo-jobs/page.tsx`

**Interfaces:**
- Consumes: `fm_customer_token` and same-origin BFF from Phase 2A.
- Produces: `fm_photo_guest`, owner-scoped create/list/retrieve/resume/claim/delete APIs, account draft history, and optimistic `revision` checks.

- [ ] **Step 1: Write ownership-policy tests**

Use this exact guest-cookie contract:

```ts
export const PHOTO_GUEST_COOKIE = "fm_photo_guest"
export const PHOTO_GUEST_TTL_SECONDS = 60 * 60 * 24 * 7
```

Generate 32 random bytes with `crypto.randomBytes`, encode base64url, persist only `sha256(secret)` in Medusa, and compare fixed-length digest bytes with `timingSafeEqual`. Tests must reject missing credentials, the wrong guest secret, a different customer JWT, ambiguous dual ownership, expired jobs, and a claim request that lacks either the valid guest secret or authenticated customer.

Refresh the seven-day cookie expiry only after valid owner-scoped photo-job activity so browser access and abandoned-media timing stay aligned. Do not rotate the secret while a multipart upload/import is active.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/ownership.test.ts src/api/store/photo-jobs/route.unit.spec.ts`

Expected: FAIL because ownership helpers and routes are absent.

- [ ] **Step 2: Implement Medusa Store routes**

Implement these exact operations:

```text
POST   /store/photo-jobs
GET    /store/photo-jobs?status=active
GET    /store/photo-jobs/:id
DELETE /store/photo-jobs/:id
POST   /store/photo-jobs/:id/claim
```

The Next.js BFF forwards the secret as `x-fotomax-guest-token`; the browser never sees it. Customer routes use the forwarded bearer JWT. Medusa middleware resolves an `PhotoOwnerContext` and every service method requires it.

Creating a job requires the live Hong Kong region and published `classic-4r-photo-print` product. Retrieval returns only the normalized Store DTO. Delete performs a guarded transition to `cancelled`; object deletion remains the retention worker's responsibility.

Claim atomically verifies guest ownership, customer authentication, and current revision, then replaces `guest_owner_hash` with `customer_id`. A repeated claim by the same customer is idempotent.

- [ ] **Step 3: Add same-origin request protections**

In the Next.js BFF, reject mutating requests whose `Origin` is not the configured storefront origin. Use `sameSite=lax` and HttpOnly cookies. Return stable codes `photo_job_not_found`, `photo_job_expired`, `photo_job_forbidden`, and `photo_job_conflict` without revealing whether another owner has that ID.

Add an authenticated account page that lists only the current customer's non-expired `draft`, `uploading`, `importing`, `processing`, `ready`, and `cart_attached` jobs with resume links. Expired jobs and deleted media must never appear as a permanent photo library.

- [ ] **Step 4: Verify and commit Task 2**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/ownership.test.ts src/api/store/photo-jobs/route.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/ownership.test.ts src/lib/medusa/session.test.ts src/components/account-photo-jobs.test.tsx`

Expected: PASS.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: secure guest photo jobs"
```

---

### Task 3: Add Private S3-Compatible Multipart Storage

**Files:**
- Modify: `compose.yaml`
- Create: `infra/minio/cors.json`
- Modify: `apps/medusa/package.json`
- Modify: `apps/medusa/.env.example`
- Create: `apps/medusa/src/modules/photo-storage/types.ts`
- Create: `apps/medusa/src/modules/photo-storage/config.ts`
- Create: `apps/medusa/src/modules/photo-storage/config.test.ts`
- Create: `apps/medusa/src/modules/photo-storage/service.ts`
- Create: `apps/medusa/src/modules/photo-storage/service.test.ts`
- Create: `apps/medusa/src/modules/photo-storage/index.ts`
- Modify: `apps/medusa/medusa-config.ts`
- Create: `apps/medusa/integration-tests/modules/photo-storage.spec.ts`

**Interfaces:**
- Consumes: owner-scoped asset/session records from Tasks 1-2.
- Produces: private object operations for multipart upload, short read access, metadata checks, and idempotent deletion.

- [ ] **Step 1: Add pinned storage dependencies and local MinIO**

Add these direct dependencies to `apps/medusa/package.json`:

```json
{
  "@aws-sdk/client-s3": "3.1082.0",
  "@aws-sdk/s3-request-presigner": "3.1082.0"
}
```

Extend Compose with MinIO API on `9002`, console on `9003`, a private bucket named `fotomax-photo-private`, and an idempotent init service that applies `infra/minio/cors.json`. Permit only `http://localhost:3100`, methods `PUT` and `GET`, upload checksum/content headers, and expose `ETag`. Do not enable anonymous read.

- [ ] **Step 2: Write failing storage-contract tests**

Define this exact interface:

```ts
export interface PhotoObjectStorage {
  startMultipartUpload(input: {
    key: string
    contentType: string
    checksumAlgorithm: "CRC32C"
  }): Promise<{ uploadId: string }>
  signUploadPart(input: {
    key: string
    uploadId: string
    partNumber: number
  }): Promise<{ url: string; expiresAt: string; requiredHeaders: Record<string, string> }>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{ partNumber: number; etag: string; checksumCRC32C: string }>
  }): Promise<{ etag: string; checksumCRC32C: string }>
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>
  headPrivateObject(key: string): Promise<{ bytes: number; contentType: string; checksumCRC32C: string }>
  signPrivateRead(key: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }>
  putPrivateObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>
  deletePrivateObjects(keys: string[]): Promise<void>
}
```

Tests must reject non-randomized keys, part numbers outside `1..10000`, nonconsecutive completion parts, signatures over 900 seconds, and read signatures over 300 seconds.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-storage`

Expected: FAIL because the storage module is absent.

- [ ] **Step 3: Implement AWS SDK v3 storage**

Use `CreateMultipartUploadCommand`, `UploadPartCommand`, `CompleteMultipartUploadCommand`, `AbortMultipartUploadCommand`, `HeadObjectCommand`, `GetObjectCommand`, `PutObjectCommand`, and `DeleteObjectsCommand`. Set `ServerSideEncryption: "AES256"`, `ChecksumAlgorithm: "CRC32C"`, and signature-v4 URLs.

Keys must match:

```text
photo-jobs/{jobUuid}/originals/{assetUuid}
photo-jobs/{jobUuid}/previews/{assetUuid}.jpg
```

Do not include customer names or original filenames. Redact query strings from storage errors before logging.

- [ ] **Step 4: Run real MinIO integration tests**

Run: `docker compose up -d --wait minio minio-init`

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- photo-storage.spec.ts`

Expected: PASS for create/sign/upload/complete/head/read/delete; an unsigned GET returns `403`, and a second delete succeeds.

- [ ] **Step 5: Commit Task 3**

```bash
git add compose.yaml infra apps/medusa package-lock.json
git commit -m "feat: add private photo object storage"
```

---

### Task 4: Implement Direct Resumable Device Uploads

**Files:**
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/parts/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/complete/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/abort/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/upload-routes.unit.spec.ts`
- Modify: `apps/storefront/package.json`
- Create: `apps/storefront/src/lib/photo/contracts.ts`
- Create: `apps/storefront/src/lib/photo/client.ts`
- Create: `apps/storefront/src/lib/photo/uploader.ts`
- Create: `apps/storefront/src/lib/photo/uploader.test.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/uploads/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/uploads/[sessionId]/parts/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/uploads/[sessionId]/complete/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/uploads/[sessionId]/abort/route.ts`
- Create: `apps/storefront/src/components/photo-editor/photo-uploader.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-uploader.test.tsx`

**Interfaces:**
- Consumes: photo ownership and private storage.
- Produces: direct Uppy multipart upload with accepted-file recovery and canonical `PhotoJobView`.

- [ ] **Step 1: Define the Phase 2 photo DTO contract**

Create this stable public shape in `apps/storefront/src/lib/photo/contracts.ts`:

```ts
export type PhotoQualityBand = "pending" | "good" | "caution" | "poor"
export type CropMode = "fill" | "fit"
export type BorderChoice = "none" | "white"
export type PaperFinish = "glossy" | "matte"

export interface NormalizedCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface PrintSettings {
  size: "4R"
  finish: PaperFinish
  cropMode: CropMode
  border: BorderChoice
  quantity: number
  crop: NormalizedCrop | null
}

export interface PhotoAssetView {
  id: string
  filename: string
  status: "pending" | "uploading" | "uploaded" | "processing" | "ready" | "blocked" | "failed" | "deleted"
  previewHref: string | null
  width: number | null
  height: number | null
  quality: { band: PhotoQualityBand; estimatedPpi: number | null }
  warnings: Array<{ code: string; message: string; acknowledged: boolean }>
  error: { code: string; message: string; recoveryAction: "retry" | "replace" | "remove" } | null
  settings: PrintSettings | null
}

export interface PhotoQuoteView {
  versionId: string
  subtotal: { amount: number; currencyCode: "hkd" }
  expiresAt: string
  lines: Array<{ variantId: string; sku: string; quantity: number; unitPrice: { amount: number; currencyCode: "hkd" } }>
}

export interface PhotoJobView {
  id: string
  status: "draft" | "uploading" | "importing" | "processing" | "ready" | "cart_attached" | "ordered" | "fulfilled" | "failed" | "cancelled" | "expired"
  revision: number
  activeVersionId: string | null
  assets: PhotoAssetView[]
  defaults: PrintSettings
  quote: PhotoQuoteView | null
  expiresAt: string
  canEdit: boolean
}
```

- [ ] **Step 2: Write upload API and client tests**

Cover MIME/extension/signature allowlists, file/job limits, duplicate idempotency keys, 8 MiB part sizing, consecutive part completion, CRC32C presence, repeated completion, abort, expired session, owner mismatch, and page reload resumption.

Run: `npm.cmd run test --workspace @fotomax/medusa -- upload-routes.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/uploader.test.ts src/components/photo-editor/photo-uploader.test.tsx`

Expected: FAIL because upload routes and client are absent.

- [ ] **Step 3: Implement owner-scoped upload sessions**

`POST /uploads` accepts `{ filename, reportedMime, bytes, sourceIdempotencyKey }`, validates aggregate limits in a transaction, creates pending asset/import-session records, starts storage multipart upload, and returns `{ assetId, sessionId, partSize: 8388608 }`.

`POST /parts` accepts consecutive part numbers and returns only 15-minute signed part URLs. `POST /complete` validates ETags/checksums, completes the object, verifies object length/type metadata, transitions the asset to `uploaded`, emits `photo_asset.uploaded`, and returns the job DTO. Repeated completion returns the same asset state.

- [ ] **Step 4: Use Uppy instead of a custom transfer engine**

Add `@uppy/core@5.2.0` and `@uppy/aws-s3@5.1.0` to the storefront. Configure custom `createMultipartUpload`, `signPart`, `completeMultipartUpload`, and `abortMultipartUpload` callbacks that call the BFF. Keep Uppy state per job and restore incomplete files when the user reselects the same local file after reload.

Use the native file/system picker with `accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"` and `multiple`. Announce separate queued, uploading, uploaded, and processing counts. Never claim an upload is ready before worker completion.

- [ ] **Step 5: Verify and commit Task 4**

Run: `npm.cmd run test --workspace @fotomax/medusa -- upload-routes.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/uploader.test.ts src/components/photo-editor/photo-uploader.test.tsx`

Expected: PASS.

```bash
git add apps/medusa apps/storefront package-lock.json
git commit -m "feat: upload photo jobs directly to storage"
```

---

### Task 5: Process, Validate, and Preview Assets in the Worker

**Files:**
- Modify: `apps/medusa/package.json`
- Create: `apps/medusa/src/modules/photo-production/image-policy.ts`
- Create: `apps/medusa/src/modules/photo-production/image-policy.test.ts`
- Create: `apps/medusa/src/modules/photo-production/image-processor.ts`
- Create: `apps/medusa/src/modules/photo-production/image-processor.test.ts`
- Create: `apps/medusa/src/workflows/process-photo-asset.ts`
- Create: `apps/medusa/src/subscribers/photo-asset-uploaded.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/assets/[assetId]/preview/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/assets/[assetId]/preview/route.ts`
- Create: `apps/medusa/test-fixtures/images/generate-fixtures.mjs`
- Create: `apps/medusa/test-fixtures/images/README.md`

**Interfaces:**
- Consumes: `photo_asset.uploaded`, original object, Redis workflow state and locks.
- Produces: detected metadata, validation outcome, quality band, private preview, and explicit retryable/permanent failures.

- [ ] **Step 1: Add image-processing dependencies and generated fixtures**

Add `sharp@0.35.3`, `heic-convert@2.1.0`, and dev dependency `@types/heic-convert@2.1.1`. Generate synthetic fixtures for portrait/landscape EXIF orientation, low resolution, 120-megapixel boundary, corrupt bytes, extension/MIME mismatch, transparent PNG, WebP, duplicate content, and HEIC. Commit only synthetic non-customer fixtures and their generation script.

- [ ] **Step 2: Write policy and processor tests**

Assert signature detection precedes extension trust, decoded pixels never exceed 120 million, either axis below 320 blocks, metadata is stripped, preview is at most 1600 pixels, and quality bands use the exact PPI thresholds in Global Constraints. The processor's initial PPI estimate uses the full oriented image against a 6 x 4 inch fit; Task 6 recalculates it from the customer's final crop.

Assert HEIC is converted with `heic-convert` inside the worker before Sharp normalization. Limit concurrent HEIC conversions to one per worker process because the converter performs substantial synchronous work. HEIC is the only path allowed to buffer a complete original in worker memory, and the existing 50 MiB limit must be enforced before that buffer is allocated.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/image-policy.test.ts src/modules/photo-production/image-processor.test.ts`

Expected: FAIL because policy and processor are absent.

- [ ] **Step 3: Implement an idempotent worker workflow**

Acquire Redis lock `photo-asset:{assetId}` with 120-second TTL. If the asset is already `ready` or `blocked`, return it unchanged. Otherwise transition `uploaded|failed -> processing`, stream the private original, validate signature and byte limits, decode metadata with bounded Sharp settings, auto-orient, remove metadata, convert to sRGB, write the private preview, compute SHA-256, and update the asset.

Within one job, if a ready asset already has the same SHA-256, mark the new asset `blocked` with `duplicate_asset` and delete its redundant original. Do not deduplicate across customers or jobs.

Use three bounded retries for transient storage/worker errors. Permanent corruption/type/limit errors become `blocked`; exhausted transient errors become `failed` with `failure_class=dead_letter`, `dead_lettered_at`, recovery action `retry`, and event `photo_asset.dead_lettered`. Admin retry clears the dead-letter marker only after writing an audit record. A failed worker must never mark the asset ready.

- [ ] **Step 4: Add private preview access**

The Medusa preview route verifies owner context and asset/job relation, writes no audit record for ordinary customer previews, and returns a 300-second signed read URL. The Next BFF returns `302` to that URL with `Cache-Control: private, no-store`. A deleted, non-ready, or foreign asset returns privacy-safe `404`.

- [ ] **Step 5: Verify worker/server separation and commit Task 5**

Run one Medusa process with `MEDUSA_WORKER_MODE=server` and another with `MEDUSA_WORKER_MODE=worker`. Upload a fixture and confirm the server remains responsive while the worker creates the preview.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production`

Expected: PASS.

```bash
git add apps/medusa apps/storefront package-lock.json
git commit -m "feat: process private photo assets"
```

---

### Task 6: Create Immutable Print Versions and Server Quotes

**Files:**
- Create: `apps/medusa/src/modules/photo-production/print-settings.ts`
- Create: `apps/medusa/src/modules/photo-production/print-settings.test.ts`
- Create: `apps/medusa/src/modules/photo-production/quality.ts`
- Create: `apps/medusa/src/modules/photo-production/quality.test.ts`
- Create: `apps/medusa/src/workflows/create-photo-job-version.ts`
- Create: `apps/medusa/src/workflows/quote-photo-job.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/versions/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/quote/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/version-routes.unit.spec.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/versions/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/quote/route.ts`
- Create: `apps/storefront/src/lib/photo/settings.ts`
- Create: `apps/storefront/src/lib/photo/settings.test.ts`

**Interfaces:**
- Consumes: ready photo assets, live 4R variants/prices, and branch capabilities.
- Produces: immutable version snapshots and a 15-minute authoritative quote.

- [ ] **Step 1: Write crop, override, quality, and quote tests**

Validate normalized crop coordinates are finite and each value is within `0..1`, crop rectangles fit within the source, quantity is `1..99`, finish maps only to a published 4R Medusa variant, and border is no-cost metadata.

Calculate effective PPI against 6 x 4 inches after orientation and crop. Add warning `crop_loss_gt_15_percent` when fill removes more than 15 percent of source area. Require acknowledgements for `quality_caution`, `quality_poor`, and crop-loss warnings.

Quote tests must reject non-ready assets, unknown variants, unpublished variants, stale revisions, missing warning acknowledgements, unsupported pickup capability, and any client-provided price.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/print-settings.test.ts src/modules/photo-production/quality.test.ts src/api/store/photo-jobs/[id]/version-routes.unit.spec.ts`

Expected: FAIL because versioning and quote behavior are absent.

- [ ] **Step 2: Implement version creation with optimistic concurrency**

Accept this untrusted input:

```ts
type CreatePhotoVersionInput = {
  expectedRevision: number
  defaults: PrintSettings
  overrides: Array<{ assetId: string; settings: Partial<PrintSettings> }>
  warningAcknowledgements: Array<{ assetId: string; code: string }>
}
```

Resolve defaults and overrides server-side, validate ownership and current revision, create the next immutable `PhotoJobVersion` and all `PrintItem` rows in one transaction, increment job revision, and set the new active version. Repeated requests with the same idempotency key return the same version.

- [ ] **Step 3: Implement server-authoritative quoting**

Query every referenced Medusa variant and current HKD price, verify `commerce_mode=photo_print`, map glossy/matte exactly, apply quantities, and calculate subtotal in Medusa. Store unit-price snapshots, subtotal, currency, `quoted_at`, `quote_expires_at = quoted_at + 15 minutes`, and a SHA-256 digest of canonical production instructions.

The response is `PhotoQuoteView`. If the same version is quoted again before expiry and catalog prices are unchanged, return the existing quote. If prices changed, create a new version/quote response and require customer review instead of silently attaching.

- [ ] **Step 4: Verify and commit Task 6**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/print-settings.test.ts src/modules/photo-production/quality.test.ts src/api/store/photo-jobs/[id]/version-routes.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/settings.test.ts`

Expected: PASS.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: quote immutable photo print versions"
```

---

### Task 7: Build the Batch-First Photo Editor

**Files:**
- Create: `apps/storefront/src/components/photo-editor/photo-editor.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-editor.test.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-toolbar.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-grid.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-tile.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-inspector.tsx`
- Create: `apps/storefront/src/components/photo-editor/print-preview.tsx`
- Create: `apps/storefront/src/components/photo-editor/quality-filter.tsx`
- Create: `apps/storefront/src/components/photo-editor/quote-summary.tsx`
- Create: `apps/storefront/src/components/photo-editor/editor-state.ts`
- Create: `apps/storefront/src/components/photo-editor/editor-state.test.ts`
- Create: `apps/storefront/app/[locale]/photo-jobs/[jobId]/page.tsx`
- Modify: `apps/storefront/src/components/product-purchase-panel.tsx`
- Modify: `apps/storefront/app/globals.css`

**Interfaces:**
- Consumes: `PhotoJobView`, upload operations, version creation, and quotes.
- Produces: resumable batch defaults, multi-select overrides, crop/fit previews, warnings, autosave, and cart-ready review.

- [ ] **Step 1: Write reducer and component tests first**

Cover all-compatible selection, shift-range selection, select by warning, batch finish/crop/border/quantity changes, per-photo override, reset-to-default, crop transform, warning acknowledgement, autosave debounce, revision conflict reload, upload-vs-processing progress, and ordered/expired read-only states.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/components/photo-editor`

Expected: FAIL because the editor is absent.

- [ ] **Step 2: Implement stable editor state**

Use one reducer keyed by asset ID and keep server `revision` alongside local dirty state. Autosave after 750 ms of stable edits by creating a new version; never mutate an existing version. On `409 photo_job_conflict`, pause autosave, re-fetch, and show a localized choice to reload the latest server version. Do not discard accepted uploads.

- [ ] **Step 3: Build responsive batch controls**

Desktop uses an unframed grid with a compact sticky toolbar and inspector. Mobile prioritizes one large preview, bottom batch actions, and a filterable thumbnail strip. Use segmented controls for fill/fit and finish, checkboxes for selection/acknowledgement, steppers for quantity, and icon buttons with tooltips for rotate/reset/zoom where applicable.

Render crop/fit previews from the normalized server preview; do not edit the original. Status must be color-independent and announced through an `aria-live` region. Keyboard users can select, inspect, adjust, quote, and recover without pointer-only gestures.

- [ ] **Step 4: Wire product entry and recovery**

With `NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true`, the 4R product action calls `POST /api/photo-jobs`, then navigates to `/{locale}/photo-jobs/{jobId}`. Refreshing resumes through the URL and owner cookie. Expired/missing jobs return to the localized product route with a specific explanation.

- [ ] **Step 5: Verify and commit Task 7**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/components/photo-editor src/components/product-purchase-panel.test.tsx`

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS with no text overflow at 375px.

```bash
git add apps/storefront
git commit -m "feat: build batch photo print editor"
```

---

### Task 8: Attach Grouped Print Lines and Freeze Ordered Instructions

**Files:**
- Create: `apps/medusa/src/workflows/attach-photo-job-to-cart.ts`
- Create: `apps/medusa/src/workflows/detach-photo-job-from-cart.ts`
- Create: `apps/medusa/src/workflows/hooks/complete-cart-photo-validation.ts`
- Create: `apps/medusa/src/workflows/hooks/create-order-photo-link.ts`
- Create: `apps/medusa/src/subscribers/order-cancelled-photo.ts`
- Create: `apps/medusa/src/links/photo-version-cart-line-item.ts`
- Create: `apps/medusa/src/links/photo-version-order.ts`
- Create: `apps/medusa/src/links/photo-version-order-line-item.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/cart/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/cart/route.unit.spec.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/cart/route.ts`
- Modify: `apps/storefront/src/lib/medusa/cart.ts`
- Modify: `apps/storefront/src/lib/medusa/cart.test.ts`
- Modify: `apps/storefront/src/lib/medusa/checkout.ts`
- Modify: `apps/storefront/src/lib/medusa/checkout.test.ts`
- Modify: `apps/storefront/src/components/cart-drawer.tsx`
- Modify: `apps/storefront/app/[locale]/cart/page.tsx`
- Modify: `apps/storefront/src/components/photo-editor/quote-summary.tsx`

**Interfaces:**
- Consumes: unexpired quote, cart ownership, live variants/prices, fulfillment capability, and Medusa core workflows.
- Produces: grouped `photo_print` cart presentation, immutable version/order links, and checkout-time validation.

- [ ] **Step 1: Write attachment and completion tests**

Cover aggregation by variant, shared version metadata, idempotent repeated attach, cart ownership mismatch, expired quote, changed price, removed variant, branch incompatibility, grouped removal, reopening after detach, mixed retail/photo totals, concurrent completion, order links, immutable ordered state, and retry after a completed order.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/api/store/photo-jobs/[id]/cart/route.unit.spec.ts`

Expected: FAIL because cart workflows and links are absent.

- [ ] **Step 2: Attach quoted versions with core cart workflows**

Acquire `photo-cart:{cartId}` and `photo-version:{versionId}` locks. Revalidate quote, current variant prices, and cart/customer ownership. Aggregate `PrintItem` quantities by variant and call Medusa `addToCartWorkflow` once per variant with metadata:

```ts
{
  kind: "photo_print",
  photo_job_id: job.id,
  photo_job_version_id: version.id,
  photo_item_count: itemCount,
  photo_manifest_digest: version.manifest_digest,
}
```

Create explicit version/cart-line links, set `cart_id`, transition to `cart_attached`, and return the normal cart. A retry finds existing links and does not duplicate lines.

- [ ] **Step 3: Group and detach photo lines safely**

Project multiple Medusa lines sharing `photo_job_version_id` as one visual cart group while preserving each underlying line for totals. The edit action detaches all linked lines through the custom workflow, clears attachment fields, transitions `cart_attached -> ready`, and opens the editor. Generic line deletion detects a photo link and delegates to this group operation.

- [ ] **Step 4: Validate and freeze at checkout**

Consume `completeCartWorkflow.hooks.validate` to check every attached photo version is owned by the cart, quoted, unexpired, digest-consistent, capability-compatible, and not already linked to another order. Throw a typed conflict before order creation.

Consume `createOrderWorkflow.hooks.orderCreated` idempotently to create version/order and version/order-line links, store order ID/freeze timestamp, and transition to `ordered`. On retry, existing links make the hook a no-op. Ordered rows and print items must reject all update/delete methods except retention metadata and production status.

After Medusa's order-cancellation workflow has released retail reservations, `order-cancelled-photo.ts` transitions every linked ordered photo job to `cancelled`, records the cancellation timestamp, and applies the explicit cancellation retention policy without deleting media inline.

- [ ] **Step 5: Verify and commit Task 8**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/api/store/photo-jobs/[id]/cart/route.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/medusa/cart.test.ts src/lib/medusa/checkout.test.ts src/components/cart-components.test.tsx`

Expected: PASS.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: attach photo jobs to Medusa orders"
```

---

### Task 9: Add Operations, Audited Access, and Retention Cleanup

**Files:**
- Create: `apps/medusa/src/api/admin/photo-jobs/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/[id]/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/[id]/manifest/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/[id]/assets/[assetId]/access/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/[id]/retry/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/[id]/status/route.ts`
- Create: `apps/medusa/src/api/admin/branch-capabilities/route.ts`
- Create: `apps/medusa/src/api/admin/branch-capabilities/[id]/route.ts`
- Create: `apps/medusa/src/api/admin/photo-jobs/admin-routes.unit.spec.ts`
- Create: `apps/medusa/src/admin/routes/photo-production/page.tsx`
- Create: `apps/medusa/src/admin/routes/photo-production/branches/page.tsx`
- Create: `apps/medusa/src/admin/routes/photo-production/components/photo-job-table.tsx`
- Create: `apps/medusa/src/admin/routes/photo-production/components/photo-job-detail.tsx`
- Create: `apps/medusa/src/admin/routes/photo-production/components/production-manifest.tsx`
- Create: `apps/medusa/src/modules/photo-production/retention.ts`
- Create: `apps/medusa/src/modules/photo-production/retention.test.ts`
- Create: `apps/medusa/src/subscribers/order-fulfilled-photo.ts`
- Create: `apps/medusa/src/jobs/photo-retention.ts`
- Create: `apps/medusa/src/jobs/photo-retention.test.ts`

**Interfaces:**
- Consumes: ordered photo versions, Admin auth/roles, storage deletion, fulfillment events.
- Produces: focused production operations, audited short access, status transitions, and observable deletion evidence.

- [ ] **Step 1: Write Admin authorization and retention tests**

Require authenticated Medusa Admin access for every route. Asset access additionally requires reason `quality_check`, `production`, or `support`, writes an audit record, and returns a read URL valid for at most 300 seconds. Tests reject Store tokens, cross-job asset IDs, unsupported retries, invalid status transitions, missing access reasons, non-photo capability SKUs, and non-positive lead times.

Retention tests assert draft expiry at last eligible activity + 168 hours and fulfilled expiry at fulfillment + 720 hours. Ordered but unfulfilled media must not expire. Cancellation uses abandoned timing unless `retention_hold_until` is later. Cleanup must be idempotent and preserve only deletion timestamps, checksums/dimensions, instructions, order links, and audits.

Run: `npm.cmd run test --workspace @fotomax/medusa -- admin-routes.unit.spec.ts src/modules/photo-production/retention.test.ts src/jobs/photo-retention.test.ts`

Expected: FAIL because Admin and cleanup paths are absent.

- [ ] **Step 2: Implement the production manifest and controls**

Manifest output contains job/version/order identifiers, manifest digest, each asset ID/dimensions, crop, size, finish, border, quantity, and quality acknowledgement. It contains no reusable URL. Operator asset access is an explicit command, not automatic image loading.

Allow production statuses `accepted`, `processing`, `ready`, `in_production`, `ready_for_pickup`, `shipped`, `fulfilled`, `failed`, and `cancelled` with guarded transitions. Retry only transient processing failures and preserve the original audit trail.

The branch-capability Admin API lists the stock-location link, localized staging label, enabled 4R SKUs, pickup flag, and lead time. Updates accept only published `photo_print` SKUs and lead times from one to thirty business days. Phase 2 staging records remain `test_only=true`; this surface must not imply POS or lab-capacity synchronization.

- [ ] **Step 3: Build a restrained Medusa Admin page**

Use Medusa Admin's route config and icon library. Render a dense searchable table, status filters, an unframed detail layout, production manifest, status action menu, retry control, audited access modal, and a separate compact branch-capability table with edit dialog. Keep originals hidden until access is requested. Do not create decorative dashboard cards.

- [ ] **Step 4: Implement retention and deletion evidence**

Run hourly in the worker. Acquire `photo-retention:{jobId}` lock, select eligible records in bounded pages, delete original/preview keys, verify `HeadObject` returns not found, mark assets `deleted`, clear object keys and future-access fields, mark the job `expired` when eligible, and emit a structured evidence event containing IDs/timestamps/counts only.

`order-fulfilled-photo.ts` reacts idempotently after Medusa fulfillment, transitions linked jobs to `fulfilled`, records the authoritative fulfillment timestamp, and calculates media expiry at that timestamp plus 720 hours.

Add an Admin-only staging test action enabled only by `PHOTO_RETENTION_TEST_MODE=true` that creates `retention_class=accelerated_test` jobs with 15-minute draft and 30-minute fulfilled expiry. Ordinary Store requests can never set this class. Reject `PHOTO_RETENTION_TEST_MODE=true` when `NODE_ENV=production` and the environment type is not a staging long-lived environment.

- [ ] **Step 5: Verify and commit Task 9**

Run: `npm.cmd run test --workspace @fotomax/medusa -- admin-routes.unit.spec.ts src/modules/photo-production/retention.test.ts src/jobs/photo-retention.test.ts`

Run: `npm.cmd run build --workspace @fotomax/medusa`

Expected: PASS and Admin bundle includes `/app/photo-production`.

```bash
git add apps/medusa
git commit -m "feat: operate and expire photo production jobs"
```

---

### Task 10: Verify and Deploy the Complete Photo Vertical Slice

**Files:**
- Create: `apps/medusa/integration-tests/http/photo-production.spec.ts`
- Create: `apps/medusa/integration-tests/http/photo-security.spec.ts`
- Create: `apps/storefront/e2e/photo-production.spec.ts`
- Modify: `.github/workflows/phase-2a.yml`
- Modify: `scripts/verify-phase-2a-staging.mjs`
- Modify: `docs/deployment/fotomax-phase-2-staging.md`
- Create: `docs/verification/fotomax-phase-2b.md`

**Interfaces:**
- Consumes: every Phase 2B backend, worker, storage, storefront, checkout, and Admin path.
- Produces: local/CI/live proof for one mixed retail and device-upload photo order.

- [ ] **Step 1: Add backend integration coverage**

Create the two integration specs with the journeys below, then run them before correcting any uncovered integration gap.

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- photo-production.spec.ts photo-security.spec.ts`

Expected: FAIL at the first missing upload, worker, quote, cart-link, security, Admin, or cleanup boundary.

Against real PostgreSQL, Redis, and MinIO, cover:

1. Guest job and multipart upload.
2. Worker processing of JPEG, PNG, WebP, and HEIC.
3. Corrupt/oversized/duplicate blocking.
4. Version, warning acknowledgement, and quote.
5. Mixed retail/photo cart attachment.
6. Pickup capability and delivery validation.
7. Concurrent order completion and immutable order links.
8. Admin manifest and audited access.
9. Cross-owner denial, forged price rejection, expired signature, replayed completion, and CSRF origin rejection.
10. Accelerated cleanup, private-object deletion, and idempotent evidence.

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- photo-production.spec.ts photo-security.spec.ts`

Expected: PASS.

- [ ] **Step 2: Add browser coverage**

In both locales and both Playwright viewports, verify device selection, resumable progress, processing states, blocked file replacement, batch defaults, per-photo override, fill/fit preview, quality filters, warning acknowledgement, quote, grouped mixed cart, edit/detach/requote, delivery, pickup, system payment, confirmation, account draft claim, and expired draft recovery.

Use generated image fixtures only. Assert no console errors, failed private preview requests, broken media, horizontal overflow, focus loss, or upload status that falsely reports worker completion.

Run: `npm.cmd run e2e --workspace @fotomax/storefront -- photo-production.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run the complete local and CI gate**

Run: `docker compose up -d --wait`

Run: `npm.cmd run db:migrate && npm.cmd run seed:medusa && npm.cmd run seed:medusa`

Run: `npm.cmd run check`

Run: `npm.cmd run test:integration --workspace @fotomax/medusa`

Run: `npm.cmd run e2e --workspace @fotomax/storefront`

Expected: all PASS. Record exact counts and durations in `docs/verification/fotomax-phase-2b.md`.

- [ ] **Step 4: Stop for explicit AWS staging approval**

Present the current price and proposed resources before provisioning:

- One private S3 bucket in `ap-east-1` with block-public-access and AES256 default encryption.
- One least-privilege IAM principal restricted to the bucket prefix and multipart/object operations.
- CORS limited to the exact Vercel staging origin.
- Lifecycle rule to abort incomplete multipart uploads after one day; application retention remains authoritative for completed objects.
- No production media, production domain, or KMS customer-managed key.

Do not create the bucket, IAM credentials, or secrets until the user explicitly approves.

- [ ] **Step 5: Deploy and verify after approval**

Provision the approved bucket/policy, store credentials only in the Medusa Cloud staging environment, deploy migrations/API/worker, verify worker heartbeat and storage access, enable `NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true` in Vercel staging, and redeploy the storefront. Capture exact deployment IDs.

Run the staging verifier and one browser journey that uploads synthetic files, interrupts/reloads, creates a mixed retail/photo order, reaches Medusa Admin, requests audited production access, marks fulfilled, then demonstrates accelerated test retention deletion.

Expected: PASS on both locale routes and target viewports with no runtime fixture fallback or public object access.

- [ ] **Step 6: Commit Task 10**

```bash
git add apps .github scripts docs package.json package-lock.json
git commit -m "test: verify Phase 2B photo production"
```

---

## Phase 2B Completion Gate

- [ ] All Phase 2A checks still pass.
- [ ] Unit and integration tests pass against PostgreSQL, Redis, and private S3-compatible storage.
- [ ] Device/system-picker files upload directly and resume without passing image bodies through Vercel.
- [ ] Worker validation, HEIC conversion, previews, quality bands, and explicit failures are demonstrated.
- [ ] Batch settings and per-photo overrides create immutable versions and authoritative quotes.
- [ ] Mixed retail/photo cart, delivery, pickup, system payment, and grouped removal work.
- [ ] Ordered production instructions are immutable and securely visible in Admin.
- [ ] Cross-owner access, forged prices, signature replay, and unauthorized Admin access are rejected.
- [ ] Seven-day abandoned and thirty-day fulfilled retention logic plus accelerated staging proof pass.
- [ ] Public staging contains private media only and records deployment-specific evidence.
- [ ] The branch is clean after the final task commit.

## Implementation References

- [Amazon S3 multipart upload and checksums](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Amazon S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS S3 Hong Kong region endpoint](https://docs.aws.amazon.com/AWSJavaSDK/latest/javadoc/com/amazonaws/services/s3/model/Region.html)
- [Sharp input metadata and HEIF detection](https://sharp.pixelplumbing.com/api-input/)
- [Sharp HEIC output support limitations](https://sharp.pixelplumbing.com/api-output/)
- [Uppy AWS S3 multipart package](https://www.npmjs.com/package/@uppy/aws-s3)
