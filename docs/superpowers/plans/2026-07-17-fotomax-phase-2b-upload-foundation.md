# Fotomax Phase 2B Upload Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure, owner-scoped photo jobs with private resumable device uploads and a bilingual recovery-focused storefront shell.

**Architecture:** Medusa owns photo-job, asset, upload-session, and lifecycle state; Next.js keeps guest credentials in HttpOnly cookies and exposes same-origin BFF routes. Browser bytes upload directly to private S3-compatible storage through short-lived multipart signatures, with MinIO providing the local integration target.

**Tech Stack:** Medusa 2.17.2 custom modules, PostgreSQL, AWS SDK v3, MinIO, Next.js 16, React 19, TypeScript, Vitest, Jest integration tests, Playwright.

## Global Constraints

- Support only the published `classic-4r-photo-print` family and Hong Kong region.
- Accept JPEG, PNG, WebP, HEIC, and HEIF from device/system-picker files.
- Enforce 50 MiB per file, 500 files per job, and 10 GiB expected bytes per job.
- Use consecutive 8 MiB multipart parts, CRC32C checksums, and upload signatures valid for at most 15 minutes.
- Use randomized keys shaped as `photo-jobs/{jobUuid}/originals/{assetUuid}`.
- Never expose guest secrets, storage upload IDs, provider tokens, signed URL query strings, filenames in object keys, or image bytes in logs.
- Keep guest credentials in secure HttpOnly `SameSite=Lax` cookies and store only SHA-256 hashes in Medusa.
- Require optimistic `revision` checks for photo-job mutations.
- Provision no cloud bucket, IAM identity, lifecycle policy, or paid resource without separate user approval.
- Use TDD, focused verification, and one commit per task.

---

## File Structure

- `apps/medusa/src/modules/photo-production/models/*`: persistent photo-job, asset, and upload-session records.
- `apps/medusa/src/modules/photo-production/state-machine.ts`: pure guarded lifecycle transitions.
- `apps/medusa/src/modules/photo-production/ownership.ts`: owner contexts, secret hashing, and fixed-time verification.
- `apps/medusa/src/modules/photo-production/service.ts`: owner-scoped lifecycle operations.
- `apps/medusa/src/modules/photo-storage/*`: provider-neutral storage contract and AWS SDK implementation.
- `apps/medusa/src/api/store/photo-jobs/*`: owner-scoped job and multipart endpoints.
- `apps/storefront/src/lib/photo/*`: browser DTOs, BFF client, multipart coordinator, and recovery rules.
- `apps/storefront/app/api/photo-jobs/*`: same-origin credential-protecting proxy routes.
- `apps/storefront/src/components/photo-editor/*`: localized upload queue and recovery controls.
- `apps/medusa/src/jobs/photo-upload-cleanup.ts`: expired-session abort and cancelled-object cleanup.

---

### Task 1: Add Photo Production Domain And State Machines

**Files:**
- Create: `apps/medusa/src/modules/photo-production/models/photo-job.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-asset.ts`
- Create: `apps/medusa/src/modules/photo-production/models/photo-upload-session.ts`
- Create: `apps/medusa/src/modules/photo-production/state-machine.ts`
- Create: `apps/medusa/src/modules/photo-production/state-machine.test.ts`
- Create: `apps/medusa/src/modules/photo-production/service.ts`
- Create: `apps/medusa/src/modules/photo-production/index.ts`
- Create: `apps/medusa/src/modules/photo-production/migrations/Migration20260717000100.ts`
- Modify: `apps/medusa/medusa-config.ts`

**Interfaces:**
- Consumes: Medusa module registration and PostgreSQL configuration.
- Produces: `PhotoJobStatus`, `PhotoAssetStatus`, `PhotoUploadSessionStatus`, transition guards, and the `photoProduction` module.

- [ ] **Step 1: Write failing lifecycle tests**

Test these public contracts and every allowed/rejected transition:

```ts
export type PhotoJobStatus =
  | "draft" | "uploading" | "ready" | "failed"
  | "cancelled" | "expired"

export type PhotoAssetStatus =
  | "pending" | "uploading" | "uploaded" | "failed" | "deleted"

export type PhotoUploadSessionStatus =
  | "active" | "completed" | "aborted" | "expired"

export function assertPhotoJobTransition(from: PhotoJobStatus, to: PhotoJobStatus): void
export function assertPhotoAssetTransition(from: PhotoAssetStatus, to: PhotoAssetStatus): void
export function assertUploadSessionTransition(
  from: PhotoUploadSessionStatus,
  to: PhotoUploadSessionStatus,
): void
```

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/state-machine.test.ts`

Expected: FAIL because `state-machine.ts` does not exist.

- [ ] **Step 2: Implement the pure transition maps**

Allow job transitions `draft -> uploading|cancelled|expired`, `uploading -> ready|failed|cancelled|expired`, `failed -> uploading|cancelled|expired`, and `ready -> uploading|cancelled|expired`. Allow asset transitions `pending -> uploading|failed|deleted`, `uploading -> uploaded|failed|deleted`, `failed -> uploading|deleted`, and `uploaded -> deleted`. Allow session transitions only from `active` to one terminal state. Throw a stable `photo_state_transition_invalid` error otherwise.

Run the focused test and expect all transition cases to pass.

- [ ] **Step 3: Define DML models and constraints**

Model `PhotoJob` with `guest_owner_hash`, `customer_id`, `region_id`, `locale`, `currency_code`, `product_handle`, `status`, `revision`, `retention_class`, `last_activity_at`, and lifecycle timestamps. Enforce exactly one owner in service creation.

Model `PhotoAsset` with job relation, sanitized display name, randomized object key, reported/detected MIME, expected/stored bytes, CRC32C, status, failure code, and lifecycle timestamps.

Model `PhotoUploadSession` with asset relation, source idempotency key, provider upload ID, part size, expected bytes, completed-parts JSON, status, and expiry. Add unique constraints for source idempotency and one active session per asset.

- [ ] **Step 4: Register and verify migration**

Register `{ resolve: "./src/modules/photo-production" }` in `medusa-config.ts`. Generate the migration, normalize its filename to `Migration20260717000100.ts`, and inspect its foreign keys and unique indexes.

Run: `npm.cmd run db:generate --workspace @fotomax/medusa -- photoProduction`

Run when local PostgreSQL is available: `npm.cmd run db:migrate --workspace @fotomax/medusa`

Expected: first migration applies; second reports no pending migrations. If Docker is unavailable, record the exact infrastructure blocker and keep unit/type verification green.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/state-machine.test.ts`

Run: `npm.cmd run typecheck --workspace @fotomax/medusa`

```bash
git add apps/medusa
git commit -m "feat: add photo upload domain"
```

---

### Task 2: Enforce Guest And Customer Ownership

**Files:**
- Create: `apps/medusa/src/modules/photo-production/ownership.ts`
- Create: `apps/medusa/src/modules/photo-production/ownership.test.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/claim/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/route.unit.spec.ts`
- Create: `apps/storefront/src/lib/photo/ownership.ts`
- Create: `apps/storefront/src/lib/photo/ownership.test.ts`
- Create: `apps/storefront/app/api/photo-jobs/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/claim/route.ts`

**Interfaces:**
- Consumes: Task 1 photo-production service and existing `fm_customer_token` session boundary.
- Produces: `PhotoOwnerContext`, `fm_photo_guest`, owner-scoped create/list/retrieve/cancel/claim routes.

- [ ] **Step 1: Write failing ownership tests**

Define and test:

```ts
export const PHOTO_GUEST_COOKIE = "fm_photo_guest"
export const PHOTO_GUEST_TTL_SECONDS = 60 * 60 * 24 * 7

export type PhotoOwnerContext =
  | { kind: "guest"; digest: Buffer }
  | { kind: "customer"; customerId: string }

export function createGuestSecret(): string
export function hashGuestSecret(secret: string): Buffer
export function verifyGuestSecret(secret: string, expectedHex: string): boolean
```

Cover malformed secrets, wrong secrets, fixed-time equal-length comparison, ambiguous dual ownership, customer mismatch, expired jobs, stale revisions, and idempotent same-customer claims.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/ownership.test.ts src/api/store/photo-jobs/route.unit.spec.ts`

Expected: FAIL because ownership helpers and routes do not exist.

- [ ] **Step 2: Implement owner-scoped Medusa routes**

Implement `POST/GET /store/photo-jobs`, `GET/DELETE /store/photo-jobs/:id`, and `POST /store/photo-jobs/:id/claim`. Resolve the live Hong Kong region and published `classic-4r-photo-print` product during creation. Require `If-Match` revision input for cancel and claim.

Return `photo_job_not_found` for absent, expired, and cross-owner jobs; return `photo_job_conflict` for stale revisions. Never reveal whether another owner has the supplied ID.

- [ ] **Step 3: Implement BFF credential containment**

Generate a 32-byte base64url guest secret only when needed, set it HttpOnly, Secure in production, and `SameSite=Lax`, and forward it only as `x-fotomax-guest-token`. Reject mutating requests whose `Origin` differs from the configured storefront origin.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/ownership.test.ts`

Expected: PASS for cookie attributes, origin checks, and absence of the guest secret in JSON responses.

- [ ] **Step 4: Verify and commit**

Run both focused suites and both workspace typechecks.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: secure photo job ownership"
```

---

### Task 3: Add Private S3-Compatible Storage

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
- Create: `apps/medusa/integration-tests/modules/photo-storage.spec.ts`
- Modify: `apps/medusa/medusa-config.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: randomized object keys and upload-session records.
- Produces: `PhotoObjectStorage` and AWS SDK implementation.

- [ ] **Step 1: Pin dependencies and define configuration**

Add direct, lockfile-pinned compatible versions of `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Define validated env values for endpoint, region, bucket, access key, secret key, and path-style mode. Production startup must reject missing storage configuration once the module is enabled.

- [ ] **Step 2: Write failing storage contract tests**

Use this interface:

```ts
export interface PhotoObjectStorage {
  startMultipartUpload(input: { key: string; contentType: string }): Promise<{ uploadId: string }>
  signUploadPart(input: { key: string; uploadId: string; partNumber: number }): Promise<{
    url: string
    expiresAt: string
    requiredHeaders: Record<string, string>
  }>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{ partNumber: number; etag: string; checksumCRC32C: string }>
  }): Promise<{ etag: string; checksumCRC32C: string }>
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>
  headPrivateObject(key: string): Promise<{
    bytes: number
    contentType: string
    checksumCRC32C: string
  }>
  deletePrivateObjects(keys: string[]): Promise<void>
}
```

Reject malformed keys, part numbers outside `1..10000`, nonconsecutive completion parts, and signatures over 900 seconds.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-storage`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement AWS SDK storage and redaction**

Use multipart create/upload-sign/complete/abort, head, and delete commands with CRC32C and server-side encryption. Convert provider failures into stable internal errors after removing URL query strings and credentials.

- [ ] **Step 4: Add private MinIO integration environment**

Expose MinIO API on `9002`, console on `9003`, and create private bucket `fotomax-photo-private`. CORS permits only `http://localhost:3100`, `PUT`, checksum/content headers, and exposed `ETag`; anonymous reads remain disabled.

Run: `docker compose up -d --wait minio minio-init`

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- photo-storage.spec.ts`

Expected: multipart create/upload/complete/head/delete passes, unsigned GET returns 403, abort is idempotent, and a second delete succeeds.

- [ ] **Step 5: Verify and commit**

Run storage unit tests, integration tests when Docker is available, and Medusa typecheck.

```bash
git add compose.yaml infra apps/medusa package-lock.json
git commit -m "feat: add private photo storage"
```

---

### Task 4: Implement Multipart Upload APIs

**Files:**
- Create: `apps/medusa/src/modules/photo-production/file-validation.ts`
- Create: `apps/medusa/src/modules/photo-production/file-validation.test.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/parts/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/complete/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/abort/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/upload-routes.unit.spec.ts`

**Interfaces:**
- Consumes: owner context, photo-production service, and `PhotoObjectStorage`.
- Produces: idempotent create/sign/complete/abort operations and normalized upload DTOs.

- [ ] **Step 1: Write failing validation and route tests**

Test signature detection for JPEG, PNG, WebP, HEIC, and HEIF; reject extension/MIME mismatches, unsupported signatures, files over 50 MiB, a 501st asset, and aggregate expected bytes over 10 GiB.

Test repeated create with the same idempotency key, session ownership, part boundaries, expired signatures, consecutive completion parts, stored-size mismatch, repeated completion, and repeated abort.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-production/file-validation.test.ts src/api/store/photo-jobs/[id]/uploads/upload-routes.unit.spec.ts`

Expected: FAIL because validators and routes are absent.

- [ ] **Step 2: Implement upload creation and part signing**

Create randomized asset IDs before object keys, sanitize browser filenames for display only, store expected bytes and reported MIME, and start one active storage session. Return only session ID, asset ID, 8 MiB part size, expiry, and stable status.

Part signing requires owner, active session, non-expired session, and part number `1..10000`. Do not return provider upload IDs.

- [ ] **Step 3: Implement completion and abort**

Completion verifies consecutive parts, completes storage, heads the private object, checks expected byte count and checksum metadata, and atomically marks session `completed` and asset `uploaded`. Repeated completion returns the existing uploaded asset.

Abort calls storage idempotently and marks the session `aborted`; the asset moves to `failed` with recovery action `retry` unless it was deleted.

- [ ] **Step 4: Verify and commit**

Run focused route tests, all photo-production tests, and Medusa typecheck.

```bash
git add apps/medusa
git commit -m "feat: add resumable photo upload api"
```

---

### Task 5: Build The Bilingual Upload Shell

**Files:**
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
- Create: `apps/storefront/src/components/photo-editor/photo-editor-shell.tsx`
- Create: `apps/storefront/src/components/photo-editor/photo-editor-shell.test.tsx`
- Create: `apps/storefront/app/[locale]/photo-jobs/[jobId]/page.tsx`
- Modify: `apps/storefront/app/globals.css`
- Modify: `packages/shared/src/i18n.ts`

**Interfaces:**
- Consumes: same-origin photo-job/upload APIs.
- Produces: `PhotoJobView`, multipart coordinator, localized editor route, and recovery UI.

- [ ] **Step 1: Define DTOs and write failing uploader tests**

Define browser-safe DTOs for `PhotoJobView`, `PhotoAssetView`, `PhotoUploadSessionView`, stable errors, and recovery actions. The multipart coordinator accepts a `File`, requests a session, uploads consecutive slices with required headers, reports aggregate/per-file progress, retries transient part failures, and completes with ETags/checksums.

Test retry without duplicating an asset, abort, reload restoration, expired-session replacement, and rejection before network calls for client-known size/count limits.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/uploader.test.ts`

Expected: FAIL because uploader modules are absent.

- [ ] **Step 2: Implement BFF upload handlers**

Reuse Task 2 origin and credential helpers. Proxy JSON only; signed part URLs may cross the BFF response, but guest secrets, provider upload IDs, and raw provider errors may not. Set `Cache-Control: no-store` on all photo responses.

- [ ] **Step 3: Write failing component tests**

Cover English and Traditional Chinese picker labels, stable queue rows, progress announcements, retry/remove buttons, keyboard focus after failure, restored uploaded placeholders, aggregate progress, reduced-motion behavior, and localized inaccessible-job handling.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/components/photo-editor`

Expected: FAIL because components are absent.

- [ ] **Step 4: Implement the editor shell**

Use a native multiple file input with an icon-labelled command, fixed-height queue rows, semantic progress elements, and explicit retry/remove controls. Uploaded assets display filename, size, and `Uploaded`/`已上載` status without a fake preview. Preserve queue geometry as progress and errors change.

- [ ] **Step 5: Verify and commit**

Run uploader/component tests, storefront typecheck, and storefront production build.

```bash
git add apps/storefront packages/shared
git commit -m "feat: add photo upload workspace"
```

---

### Task 6: Add Cleanup, End-To-End Verification, And Evidence

**Files:**
- Create: `apps/medusa/src/jobs/photo-upload-cleanup.ts`
- Create: `apps/medusa/src/jobs/photo-upload-cleanup.test.ts`
- Create: `apps/medusa/integration-tests/http/photo-upload.spec.ts`
- Create: `apps/storefront/e2e/photo-upload.spec.ts`
- Modify: `apps/storefront/playwright.config.ts`
- Create: `docs/verification/fotomax-phase-2b-upload-foundation.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: all prior task contracts.
- Produces: idempotent expired-upload cleanup and final local verification evidence.

- [ ] **Step 1: Write failing cleanup tests**

Cover expired active sessions, already-aborted sessions, cancelled jobs with objects, repeated cleanup, partial provider deletion failure, and logs containing only IDs/object keys/status codes. Assert logs contain no customer display filename, signed URL, credentials, or bytes.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/jobs/photo-upload-cleanup.test.ts`

Expected: FAIL because the cleanup job is absent.

- [ ] **Step 2: Implement bounded idempotent cleanup**

Process fixed batches, abort expired sessions, delete objects for cancelled/expired jobs, mark successful deletions, and leave provider failures retryable. Do not implement final order-based retention in this slice.

- [ ] **Step 3: Add backend and browser journeys**

Backend integration covers guest create, multipart upload, reload, customer claim, cross-owner denial, abort, and cleanup. Playwright uses small deterministic JPEG/PNG fixtures and covers desktop English plus mobile Traditional Chinese upload/retry/reload flows.

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- photo-upload.spec.ts`

Run: `npm.cmd run e2e --workspace @fotomax/storefront -- photo-upload.spec.ts`

Expected: PASS when PostgreSQL, Redis, MinIO, Medusa, and storefront services are available.

- [ ] **Step 4: Run full regression gates**

Run: `npm.cmd run typecheck`

Run: `npm.cmd test`

Run: `npm.cmd run build`

Expected: all existing and new checks pass. Document any unavailable Docker/browser gate separately; do not describe an unrun gate as passing.

- [ ] **Step 5: Record evidence and commit**

Document commands, pass counts, local service URLs, unsigned-read proof, credential-containment proof, screenshots, and any infrastructure limitation. Update the SDD ledger task-by-task without overwriting unrelated user notes.

```bash
git add apps docs .superpowers/sdd/progress.md
git commit -m "test: verify photo upload foundation"
```

---

## Completion Criteria

- A guest can create, upload, interrupt, reload, retry, and remove files without exposing the guest secret.
- An authenticated customer can claim a valid guest job; another guest/customer cannot enumerate or access it.
- Original bytes remain private, use randomized keys, and upload directly through short-lived multipart signatures.
- Invalid signatures, size/count/aggregate limits, stale revisions, expired sessions, and repeated requests behave deterministically.
- Cancelled and expired upload objects are cleaned idempotently.
- English desktop and Traditional Chinese mobile journeys pass locally.
- Typechecks, production builds, focused tests, and the full regression suite pass.
- No cloud or paid resources are provisioned by this plan.
