# Vercel Blob Photo Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use a private Vercel Blob store for new Phase 2B staging photo uploads while Medusa remains on Cloudflare and local integration tests remain on private MinIO.

**Architecture:** Split the current S3-only service into provider adapters behind a provider-aware router. New uploads use a single signed `PUT` contract for both providers, while the S3 adapter retains legacy multipart methods so already-active sessions can finish. Assets and sessions persist their provider, allowing processing, reads, cleanup, and retention to dispatch to the correct store after configuration changes.

**Tech Stack:** Node.js 22, TypeScript, Medusa 2.17, `@vercel/blob` 2.4+, AWS SDK v3, Next.js 16, Vitest, Jest integration tests, Playwright, Cloudflare Containers, Vercel CLI.

## Global Constraints

- Medusa API and photo worker remain on Cloudflare Containers.
- Phase 2B staging uses one private Vercel Blob store; local tests use private MinIO.
- `BLOB_READ_WRITE_TOKEN` remains a Cloudflare secret and must never reach browser responses, logs, source files, or evidence.
- Signed upload grants are scoped to one immutable pathname, one `PUT`, the validated content type, at most 50 MB, and 15 minutes.
- Existing S3 multipart sessions remain resumable; all newly created sessions use `single-put`.
- Existing rows are backfilled to `storage_provider=s3` and `upload_strategy=multipart`.
- No AWS bucket, IAM principal, key, policy, lifecycle rule, or CORS configuration is created.
- No Vercel store or paid resource is provisioned until current pricing is presented and the user explicitly approves the exact resource action.
- Provider errors continue to use stable `photo_storage_*` codes.
- Every implementation task follows red-green-refactor and ends with a focused commit.

## File Structure

**Create**

- `apps/medusa/src/modules/photo-storage/s3-adapter.ts`: S3/MinIO direct upload, private object operations, and legacy multipart compatibility.
- `apps/medusa/src/modules/photo-storage/vercel-blob-adapter.ts`: private Vercel Blob signed uploads and object operations.
- `apps/medusa/src/modules/photo-storage/router.test.ts`: provider dispatch and missing-adapter tests.
- `apps/medusa/src/modules/photo-storage/vercel-blob-adapter.test.ts`: Vercel SDK contract and error mapping tests.
- `apps/medusa/src/modules/photo-production/migrations/Migration20260726000100.ts`: additive provider and completion metadata columns.

**Modify**

- `package.json`, `package-lock.json`, `apps/medusa/package.json`: add `@vercel/blob`.
- `apps/medusa/src/modules/photo-storage/types.ts`: provider-neutral contracts and legacy multipart compatibility type.
- `apps/medusa/src/modules/photo-storage/config.ts`, `config.test.ts`: discriminated provider configuration.
- `apps/medusa/src/modules/photo-storage/service.ts`, `service.test.ts`, `index.ts`: provider-aware router.
- `apps/medusa/src/modules/photo-production/models/photo-asset.ts`, `photo-upload-session.ts`, `operations-models.test.ts`: persisted provider metadata.
- `apps/medusa/src/api/store/photo-jobs/[id]/uploads/handlers.ts`, `upload-routes.unit.spec.ts`: dual upload strategies.
- `apps/medusa/src/workflows/process-photo-asset.ts`, `process-photo-asset.test.ts`: provider-aware processing.
- `apps/medusa/src/jobs/photo-retention.ts`, `photo-retention.test.ts`, `photo-upload-cleanup.ts`, `photo-upload-cleanup.test.ts`: provider-aware cleanup.
- `apps/medusa/src/api/store/photo-jobs/[id]/assets/[assetId]/route.ts`, `asset-delete.unit.spec.ts`: provider-aware deletion.
- `apps/medusa/src/api/store/photo-jobs/[id]/assets/[assetId]/preview/route.ts`, `photo-preview-route.unit.spec.ts`: provider-aware signed preview reads.
- `apps/medusa/src/api/admin/photo-jobs/admin-operations.ts`, `admin-routes.unit.spec.ts`: provider-aware original reads.
- `apps/storefront/src/lib/photo/contracts.ts`, `client.ts`, `client.test.ts`, `uploader.ts`, `uploader.test.ts`: single-PUT transport with legacy multipart fallback.
- `apps/storefront/app/api/photo-jobs/upload-proxy.ts`: safe projection of upload grants and completion metadata.
- `apps/cloudflare/src/runtime.ts`, `runtime.test.ts`: conditional storage secrets.
- `apps/medusa/.env.example`, `.github/workflows/phase-2a.yml`, `compose.yaml`: explicit local S3 provider.
- `scripts/verify-phase-2a-staging.mjs`, `phase-2b-staging-verifier.test.mjs`, `phase-2a-workflow.test.mjs`: provider-neutral staging upload.
- `apps/medusa/integration-tests/modules/photo-storage.spec.ts`, `http/photo-upload.spec.ts`, `http/photo-production.spec.ts`, `http/photo-security.spec.ts`, `http/retail-checkout.spec.ts`: provider-aware integration coverage.
- `apps/storefront/e2e/photo-upload.spec.ts`, `photo-production.spec.ts`: single-PUT browser contract.
- `docs/deployment/fotomax-phase-2-staging.md`, `docs/verification/fotomax-phase-2b.md`: Vercel Blob deployment and evidence.

---

### Task 1: Define Provider-Neutral Storage Contracts And Configuration

**Files:**
- Modify: `apps/medusa/src/modules/photo-storage/types.ts`
- Modify: `apps/medusa/src/modules/photo-storage/config.ts`
- Modify: `apps/medusa/src/modules/photo-storage/config.test.ts`
- Modify: `apps/medusa/.env.example`

**Interfaces:**
- Produces: `PhotoStorageProvider`, `PhotoObjectRef`, `PhotoDirectUploadGrant`, `PhotoObjectInfo`, `PhotoStorageAdapter`, `PhotoStorageRuntimeConfig`, and `loadPhotoStorageRuntimeConfig`.
- Consumes: existing `PhotoStorageError`.

- [ ] **Step 1: Write failing discriminated-config tests**

Add tests that assert S3 requires only the S3 variables, Blob requires only `BLOB_READ_WRITE_TOKEN`, both adapters can be configured for historical reads, and unknown providers fail without printing secret values:

```ts
const blobEnv = {
  NODE_ENV: "production",
  PHOTO_STORAGE_PROVIDER: "vercel-blob",
  BLOB_READ_WRITE_TOKEN: "vercel-blob-token",
}

expect(loadPhotoStorageConfig(blobEnv)).toEqual({
  defaultProvider: "vercel-blob",
  vercelBlob: { token: "vercel-blob-token" },
})
expect(() =>
  loadPhotoStorageConfig({
    PHOTO_STORAGE_PROVIDER: "vercel-blob",
    BLOB_READ_WRITE_TOKEN: "",
  }),
).toThrow("photo_storage_config_invalid:BLOB_READ_WRITE_TOKEN")
expect(() =>
  loadPhotoStorageConfig({ PHOTO_STORAGE_PROVIDER: "unknown" }),
).toThrow("photo_storage_config_invalid:PHOTO_STORAGE_PROVIDER")
```

- [ ] **Step 2: Run the config test and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-storage/config.test.ts
```

Expected: FAIL because `PHOTO_STORAGE_PROVIDER` and Blob configuration are not modeled.

- [ ] **Step 3: Add the provider-neutral types**

Add these provider-neutral contracts alongside the unchanged S3-shaped public interface, retaining a separate compatibility interface for legacy sessions:

```ts
export type PhotoStorageProvider = "s3" | "vercel-blob"
export type PhotoUploadStrategy = "multipart" | "single-put"
export interface PhotoObjectRef {
  provider: PhotoStorageProvider
  key: string
}
export interface PhotoDirectUploadGrant {
  provider: PhotoStorageProvider
  url: string
  expiresAt: string
  requiredHeaders: Record<string, string>
}
export interface PhotoObjectInfo {
  bytes: number
  contentType: string
  etag: string
}
export interface PhotoStorageAdapter {
  createDirectUpload(input: {
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant>
  inspect(key: string): Promise<PhotoObjectInfo>
  readPrefix(key: string, maxBytes: number): Promise<Uint8Array>
  read(key: string): Promise<Readable>
  writePreview(input: {
    key: string
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }>
  signRead(key: string, expiresIn: number): Promise<{
    url: string
    expiresAt: string
  }>
  delete(keys: string[]): Promise<void>
}
export interface LegacyMultipartStorage {
  startMultipartUpload(input: {
    key: string
    contentType: string
  }): Promise<{ uploadId: string }>
  signUploadPart(input: {
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string }>
  abortMultipartUpload(input: {
    key: string
    uploadId: string
  }): Promise<void>
}
```

Keep the existing `PhotoObjectStorage` interface and `loadPhotoStorageConfig` export intact in this task so the repository remains type-safe. Task 2 replaces them atomically after both adapters and the router exist.

- [ ] **Step 4: Implement discriminated environment loading**

Add a new loader that returns:

```ts
export interface PhotoStorageRuntimeConfig {
  defaultProvider: PhotoStorageProvider
  s3?: PhotoS3Config
  vercelBlob?: { token: string }
}
```

`loadPhotoStorageRuntimeConfig` requires `PHOTO_STORAGE_PROVIDER`. It loads old S3 variables only when the default is `s3` or an S3 endpoint is explicitly present; it loads Blob only when the default is `vercel-blob` or a Blob token is present. It validates that the default provider has an adapter. The existing loader remains available only for the unchanged service until Task 2.

- [ ] **Step 5: Update local environment defaults and run green tests**

Add `PHOTO_STORAGE_PROVIDER=s3` to `apps/medusa/.env.example`.

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-storage/config.test.ts
npm.cmd run typecheck --workspace @fotomax/medusa
```

Expected: config tests PASS and Medusa typecheck exits zero.

- [ ] **Step 6: Commit**

```powershell
git add apps/medusa/src/modules/photo-storage/types.ts apps/medusa/src/modules/photo-storage/config.ts apps/medusa/src/modules/photo-storage/config.test.ts apps/medusa/.env.example
git commit -m "refactor: define provider-neutral photo storage"
```

### Task 2: Implement S3, Vercel Blob, And Router Adapters

**Files:**
- Create: `apps/medusa/src/modules/photo-storage/s3-adapter.ts`
- Create: `apps/medusa/src/modules/photo-storage/vercel-blob-adapter.ts`
- Create: `apps/medusa/src/modules/photo-storage/vercel-blob-adapter.test.ts`
- Create: `apps/medusa/src/modules/photo-storage/router.test.ts`
- Modify: `apps/medusa/src/modules/photo-storage/service.ts`
- Modify: `apps/medusa/src/modules/photo-storage/service.test.ts`
- Modify: `apps/medusa/src/modules/photo-storage/index.ts`
- Modify: `apps/medusa/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 1 storage contracts and runtime config.
- Produces: `S3PhotoStorageAdapter`, `VercelBlobPhotoStorageAdapter`, and `PhotoStorageModuleService` implementing the following router contract:

```ts
export interface PhotoObjectStorage {
  readonly defaultProvider: PhotoStorageProvider
  createDirectUpload(input: {
    provider: PhotoStorageProvider
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant>
  inspect(ref: PhotoObjectRef): Promise<PhotoObjectInfo>
  readPrefix(ref: PhotoObjectRef, maxBytes: number): Promise<Uint8Array>
  read(ref: PhotoObjectRef): Promise<Readable>
  writePreview(input: {
    ref: PhotoObjectRef
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }>
  signRead(
    ref: PhotoObjectRef,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string }>
  delete(refs: PhotoObjectRef[]): Promise<void>
  startLegacyMultipart(input: {
    provider: "s3"
    key: string
    contentType: string
  }): Promise<{ uploadId: string }>
  signLegacyPart(input: {
    provider: "s3"
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant>
  completeLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string }>
  abortLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
  }): Promise<void>
}
```

- [ ] **Step 1: Install the supported Blob SDK**

Run:

```powershell
npm.cmd install @vercel/blob@^2.4.0 --workspace @fotomax/medusa
```

Expected: `apps/medusa/package.json` and root `package-lock.json` add `@vercel/blob`.

- [ ] **Step 2: Write failing Vercel adapter tests**

Inject a `BlobApi` fake and assert:

```ts
await adapter.createDirectUpload({
  key,
  contentType: "image/jpeg",
  maxBytes: 50 * 1024 * 1024,
  expiresIn: 900,
})

expect(api.issueSignedToken).toHaveBeenCalledWith({
  pathname: key,
  operations: ["put"],
  allowedContentTypes: ["image/jpeg"],
  maximumSizeInBytes: 50 * 1024 * 1024,
  validUntil: expect.any(Number),
  token: "scoped-token",
})
expect(api.presignUrl).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({
    pathname: key,
    operation: "put",
  }),
)
```

Also test `head`, range `get`, full `get`, private preview `put`, signed `get`, batch `del`, `BlobNotFoundError`, invalid keys, and generic provider failures. Assert thrown errors contain only stable codes.

- [ ] **Step 3: Run the adapter test and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-storage/vercel-blob-adapter.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Extract the S3 adapter**

Move S3 client construction and key validation from `service.ts` into `S3PhotoStorageAdapter`. Implement `createDirectUpload` with a presigned `PutObjectCommand`, `inspect` with `HeadObjectCommand`, and the remaining private operations with the existing commands. Preserve the current multipart methods on this adapter for legacy sessions. Replace the old public interface and loader only after the router compiles.

The direct grant must sign:

```ts
new PutObjectCommand({
  Bucket: config.bucket,
  Key: input.key,
  ContentType: input.contentType,
  ...(config.serverSideEncryption === false
    ? {}
    : { ServerSideEncryption: "AES256" as const }),
})
```

Return required `content-type` and, when enabled, `x-amz-server-side-encryption` headers.

- [ ] **Step 5: Implement the Vercel Blob adapter**

Use `issueSignedToken`, `presignUrl`, `head`, `get`, `put`, and `del` with explicit `{ token, access: "private" }` where accepted. Convert Web streams with `Readable.fromWeb`. For prefix reads, pass `Range: bytes=0-${maxBytes - 1}` through `get` headers. Require returned pathname, size, content type, and ETag to match the request.

Do not include the token in any error message:

```ts
function providerError(): PhotoStorageError {
  return new PhotoStorageError("photo_storage_provider_error")
}
```

- [ ] **Step 6: Write the router test and implement dispatch**

Test that:

```ts
await router.inspect({ provider: "vercel-blob", key })
expect(blob.inspect).toHaveBeenCalledWith(key)
expect(s3.inspect).not.toHaveBeenCalled()
```

Test missing adapters fail with `photo_storage_provider_unavailable`, and legacy multipart with provider `vercel-blob` fails closed.

Construct only configured adapters. Expose `defaultProvider` for new sessions. Keep key validation inside each adapter.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-storage
npm.cmd run typecheck --workspace @fotomax/medusa
```

Expected: all storage tests PASS; remaining type errors are limited to callers still using old signatures.

- [ ] **Step 8: Commit**

```powershell
git add apps/medusa/package.json package-lock.json apps/medusa/src/modules/photo-storage
git commit -m "feat: add Vercel Blob photo storage adapter"
```

### Task 3: Persist Provider And Upload Strategy

**Files:**
- Create: `apps/medusa/src/modules/photo-production/migrations/Migration20260726000100.ts`
- Modify: `apps/medusa/src/modules/photo-production/models/photo-asset.ts`
- Modify: `apps/medusa/src/modules/photo-production/models/photo-upload-session.ts`
- Modify: `apps/medusa/src/modules/photo-production/operations-models.test.ts`

**Interfaces:**
- Produces asset fields: `storage_provider`, `provider_etag`.
- Produces session fields: `storage_provider`, `upload_strategy`, `completion_metadata`.

- [ ] **Step 1: Add failing model metadata assertions**

Extend `operations-models.test.ts` to require:

```ts
expect(photoAssetFields).toEqual(
  expect.arrayContaining(["storage_provider", "provider_etag"]),
)
expect(uploadSessionFields).toEqual(
  expect.arrayContaining([
    "storage_provider",
    "upload_strategy",
    "completion_metadata",
  ]),
)
```

- [ ] **Step 2: Run the model test and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-production/operations-models.test.ts
```

Expected: FAIL with missing fields.

- [ ] **Step 3: Add model fields**

Add:

```ts
storage_provider: model.enum(["s3", "vercel-blob"]).default("s3").index(),
provider_etag: model.text().nullable(),
```

to `PhotoAsset`, and:

```ts
storage_provider: model.enum(["s3", "vercel-blob"]).default("s3").index(),
upload_strategy: model.enum(["multipart", "single-put"]).default("multipart"),
completion_metadata: model.json().nullable(),
```

to `PhotoUploadSession`.

- [ ] **Step 4: Add the reversible migration**

The migration `up()` adds all five columns, backfills existing rows, sets non-null constraints, and creates provider indexes. The `down()` drops the indexes and columns in reverse dependency order. Use explicit SQL matching the existing migration style; preserve old multipart columns.

- [ ] **Step 5: Run model tests and Medusa build**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/modules/photo-production/operations-models.test.ts
npm.cmd run typecheck --workspace @fotomax/medusa
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/medusa/src/modules/photo-production/models apps/medusa/src/modules/photo-production/migrations/Migration20260726000100.ts apps/medusa/src/modules/photo-production/operations-models.test.ts
git commit -m "feat: persist photo storage provider"
```

### Task 4: Make Processing, Reads, And Retention Provider-Aware

**Files:**
- Modify: `apps/medusa/src/workflows/process-photo-asset.ts`
- Modify: `apps/medusa/src/workflows/process-photo-asset.test.ts`
- Modify: `apps/medusa/src/jobs/photo-retention.ts`
- Modify: `apps/medusa/src/jobs/photo-retention.test.ts`
- Modify: `apps/medusa/src/jobs/photo-upload-cleanup.ts`
- Modify: `apps/medusa/src/jobs/photo-upload-cleanup.test.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/[id]/assets/[assetId]/route.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/asset-delete.unit.spec.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/[id]/assets/[assetId]/preview/route.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/photo-preview-route.unit.spec.ts`
- Modify: `apps/medusa/src/api/admin/photo-jobs/admin-operations.ts`
- Modify: `apps/medusa/src/api/admin/photo-jobs/admin-routes.unit.spec.ts`

**Interfaces:**
- Consumes: `PhotoObjectRef` and provider fields from Tasks 1-3.
- Produces: every post-upload read/write/delete dispatches by persisted provider.

- [ ] **Step 1: Write failing provider-dispatch assertions**

Update each fixture asset to include `storage_provider: "vercel-blob"` and assert object calls receive:

```ts
{
  provider: "vercel-blob",
  key: asset.object_key,
}
```

For previews, assert both original reads and preview writes use the same provider. For retention, assert original and preview refs are deleted together. For legacy cleanup, assert multipart abort is called only when `upload_strategy === "multipart"` and provider is `s3`.

- [ ] **Step 2: Run focused tests and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/workflows/process-photo-asset.test.ts src/jobs/photo-retention.test.ts src/jobs/photo-upload-cleanup.test.ts src/api/store/photo-jobs/asset-delete.unit.spec.ts src/api/store/photo-jobs/photo-preview-route.unit.spec.ts src/api/admin/photo-jobs/admin-routes.unit.spec.ts
```

Expected: FAIL because callers still pass bare keys.

- [ ] **Step 3: Introduce one object-ref helper**

Add to `types.ts`:

```ts
export function photoObjectRef(
  asset: { storage_provider?: string | null },
  key: string,
): PhotoObjectRef {
  const provider = asset.storage_provider ?? "s3"
  if (provider !== "s3" && provider !== "vercel-blob") {
    throw new PhotoStorageError("photo_storage_provider_unavailable")
  }
  return { provider, key }
}
```

Use it at every listed call site. Defaulting missing values to `s3` preserves pre-migration test fixtures and historical records during rollout.

- [ ] **Step 4: Update preview writes and cleanup**

Pass `{ provider, key }` for inspect, prefix, read, signed read, and delete. Pass `provider` into preview writes. In upload cleanup, branch on `upload_strategy` so `single-put` sessions delete an object if present but never call multipart abort.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/workflows/process-photo-asset.test.ts src/jobs/photo-retention.test.ts src/jobs/photo-upload-cleanup.test.ts src/api/store/photo-jobs/asset-delete.unit.spec.ts src/api/store/photo-jobs/photo-preview-route.unit.spec.ts src/api/admin/photo-jobs/admin-routes.unit.spec.ts
npm.cmd run typecheck --workspace @fotomax/medusa
```

Expected: PASS except upload-handler callers addressed in Task 5.

- [ ] **Step 6: Commit**

```powershell
git add apps/medusa/src/modules/photo-storage/types.ts apps/medusa/src/workflows apps/medusa/src/jobs apps/medusa/src/api/store/photo-jobs apps/medusa/src/api/admin/photo-jobs
git commit -m "refactor: route photo objects by provider"
```

### Task 5: Add Dual Upload Strategies To Medusa

**Files:**
- Modify: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/handlers.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/upload-routes.unit.spec.ts`
- Modify: `apps/medusa/src/api/store/photo-jobs/[id]/uploads/[sessionId]/parts/route.ts`

**Interfaces:**
- Produces new upload DTO:

```ts
type SinglePutUploadDto = {
  assetId: string
  sessionId: string
  strategy: "single-put"
  uploadUrl: string
  requiredHeaders: Record<string, string>
  status: string
  expiresAt: string
}
```

- Produces completion body `{ etag: string }` for `single-put`.
- Preserves `{ parts: CompletedPart[] }` for legacy `multipart`.

- [ ] **Step 1: Add failing creation and completion tests**

Add tests proving:

- new sessions call `createDirectUpload` with `storage.defaultProvider`;
- asset and session persist the same provider;
- new sessions persist `upload_strategy: "single-put"`;
- DTO includes only the signed URL and safe headers, never a token;
- completion rejects blank or mismatched ETags;
- replay accepts only the stored ETag;
- multipart sessions still use the old part-signing and completion path;
- a provider mismatch fails before object access.

Use:

```ts
expect(res.json).toHaveBeenCalledWith({
  upload: {
    assetId: "asset_1",
    sessionId: "session_1",
    strategy: "single-put",
    uploadUrl: "https://private.blob.example/upload",
    requiredHeaders: { "content-type": "image/jpeg" },
    status: "active",
    expiresAt: expect.any(String),
  },
})
```

- [ ] **Step 2: Run the route test and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/api/store/photo-jobs/upload-routes.unit.spec.ts
```

Expected: new strategy tests FAIL.

- [ ] **Step 3: Create single-PUT sessions**

Generate the object key, call `createDirectUpload`, then transactionally create the asset and session with:

```ts
storage_provider: grant.provider,
upload_strategy: "single-put",
provider_upload_id: null,
part_size: input.expectedBytes,
completion_metadata: null,
```

Persist `storage_provider` on the asset. If the database transaction loses an idempotency race, delete the newly granted pathname; signed URLs require no provider abort.

- [ ] **Step 4: Complete single-PUT sessions**

Parse exactly one non-empty `etag`. Inspect and prefix-read the recorded provider ref. Require exact bytes, content type, magic bytes, and ETag. On success update:

```ts
{
  status: "completed",
  completed_at: new Date(),
  completion_metadata: { etag },
}
```

and asset:

```ts
{
  status: "uploaded",
  stored_bytes: head.bytes,
  provider_etag: head.etag,
  uploaded_at: new Date(),
}
```

Keep `crc32c` nullable for new Blob uploads. Continue publishing the existing event after the transaction.

If size, content type, magic bytes, or ETag do not match, delete the recorded object reference, transition the session and asset to their existing retryable failure state, and return the stable mismatch error without publishing an event.

- [ ] **Step 5: Preserve legacy multipart behavior**

The parts route must require `upload_strategy === "multipart"` and `storage_provider === "s3"`. The existing `parts` completion body remains valid only for such sessions. Existing completion replay compares `completed_parts`; new replay compares `completion_metadata.etag`.

- [ ] **Step 6: Run upload tests and Medusa typecheck**

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- src/api/store/photo-jobs/upload-routes.unit.spec.ts
npm.cmd run typecheck --workspace @fotomax/medusa
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/medusa/src/api/store/photo-jobs
git commit -m "feat: issue provider-neutral photo uploads"
```

### Task 6: Upload Directly From The Storefront

**Files:**
- Modify: `apps/storefront/src/lib/photo/contracts.ts`
- Modify: `apps/storefront/src/lib/photo/client.ts`
- Modify: `apps/storefront/src/lib/photo/client.test.ts`
- Modify: `apps/storefront/src/lib/photo/uploader.ts`
- Modify: `apps/storefront/src/lib/photo/uploader.test.ts`
- Modify: `apps/storefront/app/api/photo-jobs/upload-proxy.ts`

**Interfaces:**
- Consumes: Task 5 dual upload DTO and completion bodies.
- Produces: `putFileWithProgress` and a dual-strategy uploader.

- [ ] **Step 1: Add failing contract and uploader tests**

Model the upload view as a discriminated union:

```ts
export type PhotoUploadSessionView =
  | {
      assetId: string
      sessionId: string
      strategy: "single-put"
      uploadUrl: string
      requiredHeaders: Record<string, string>
      status: string
      expiresAt: string
    }
  | {
      assetId: string
      sessionId: string
      strategy: "multipart"
      partSize: number
      status: string
      expiresAt: string
    }
```

Test that a single-PUT session sends the whole `File`, reports monotonic progress, extracts ETag, and calls `complete(jobId, sessionId, { etag })`. Retain one legacy multipart test.

- [ ] **Step 2: Run storefront tests and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/storefront -- src/lib/photo/client.test.ts src/lib/photo/uploader.test.ts
```

Expected: FAIL because the client and uploader require multipart arrays.

- [ ] **Step 3: Update the BFF projection and client**

Project only `strategy`, `uploadUrl`, `requiredHeaders`, `partSize`, status, IDs, and expiry. Reject or omit every other upstream field.

Change completion to:

```ts
type PhotoUploadCompletion =
  | { strategy: "single-put"; etag: string }
  | { strategy: "multipart"; parts: UploadedPart[] }
```

Serialize `{ etag }` or `{ parts }` based on the discriminator.

- [ ] **Step 4: Implement progress-reporting direct PUT**

Add an injectable `DirectPut` dependency and a browser default built on `XMLHttpRequest`:

```ts
export type DirectPut = (
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
) => Promise<string>
```

The default must:

- set every required header;
- resolve only for HTTP 2xx with a non-empty `ETag`;
- reject with `photo_upload_failed` otherwise;
- abort the XHR when the signal aborts;
- remove the abort listener after settlement;
- emit `{ uploadedBytes, totalBytes, percent }` from `xhr.upload.onprogress`.

- [ ] **Step 5: Branch by upload strategy**

For `single-put`, call `DirectPut` once and complete with the ETag. For `multipart`, retain the existing CRC32C part loop. Keep expired-session replacement and idempotency behavior unchanged.

- [ ] **Step 6: Run focused tests, storefront typecheck, and build**

Run:

```powershell
npm.cmd test --workspace @fotomax/storefront -- src/lib/photo/client.test.ts src/lib/photo/uploader.test.ts
npm.cmd run typecheck --workspace @fotomax/storefront
npm.cmd run build --workspace @fotomax/storefront
```

Expected: PASS. Build may log the existing Medusa-unavailable static fallback but exits zero.

- [ ] **Step 7: Commit**

```powershell
git add apps/storefront/src/lib/photo apps/storefront/app/api/photo-jobs/upload-proxy.ts
git commit -m "feat: upload photos directly to private storage"
```

### Task 7: Wire Cloudflare, CI, And Staging Verification

**Files:**
- Modify: `apps/cloudflare/src/runtime.ts`
- Modify: `apps/cloudflare/src/runtime.test.ts`
- Modify: `.github/workflows/phase-2a.yml`
- Modify: `compose.yaml`
- Modify: `scripts/phase-2a-workflow.test.mjs`
- Modify: `scripts/verify-phase-2a-staging.mjs`
- Modify: `scripts/phase-2b-staging-verifier.test.mjs`
- Modify: `docs/deployment/fotomax-phase-2-staging.md`

**Interfaces:**
- Consumes: provider environment contract and upload DTO.
- Produces: Cloudflare forwards one provider's required secrets and verifier follows single-PUT.

- [ ] **Step 1: Add failing runtime and workflow tests**

Use two fixtures:

```ts
const blobSecrets = {
  ...baseSecrets,
  PHOTO_STORAGE_PROVIDER: "vercel-blob",
  BLOB_READ_WRITE_TOKEN: "blob-token",
}
const s3Secrets = {
  ...baseSecrets,
  PHOTO_STORAGE_PROVIDER: "s3",
  PHOTO_STORAGE_ENDPOINT: "http://minio:9000",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
  PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
}
```

Assert Blob does not require S3 values, S3 does not require Blob, and error messages name only missing variables.

- [ ] **Step 2: Run tests and verify red**

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- src/runtime.test.ts
node --test scripts/phase-2a-workflow.test.mjs scripts/phase-2b-staging-verifier.test.mjs
```

Expected: FAIL under the old unconditional S3 secret list and multipart verifier.

- [ ] **Step 3: Implement conditional Cloudflare forwarding**

Always require core Medusa secrets and `PHOTO_STORAGE_PROVIDER`. When `s3`, validate and forward the seven S3 settings. When `vercel-blob`, validate and forward only `BLOB_READ_WRITE_TOKEN`. Never include unused provider secrets in the container environment.

- [ ] **Step 4: Keep CI and compose on S3**

Set `PHOTO_STORAGE_PROVIDER: "s3"` in `.github/workflows/phase-2a.yml` and `compose.yaml`. Keep MinIO CORS and all existing S3 test values.

- [ ] **Step 5: Update the staging verifier**

After session creation:

```js
assert.equal(upload.strategy, "single-put")
const put = await fetch(upload.uploadUrl, {
  method: "PUT",
  headers: upload.requiredHeaders,
  body: generatedImage,
})
assert.ok(put.ok)
const etag = put.headers.get("etag")
assert.ok(etag)
await medusaJson(
  `/store/photo-jobs/${job.id}/uploads/${upload.sessionId}/complete`,
  { method: "POST", body: JSON.stringify({ etag }) },
)
```

Keep generated synthetic media, worker readiness, quote, cart, delivery, system payment, and mixed-order checks.

- [ ] **Step 6: Rewrite the staging runbook before provisioning**

Document:

- private Blob store connected to the staging Vercel project;
- Cloudflare `PHOTO_STORAGE_PROVIDER=vercel-blob`;
- Cloudflare `BLOB_READ_WRITE_TOKEN` secret entry without displaying its value;
- no AWS resource steps;
- spend controls, token rotation, deployment order, verifier, rollback, and evidence.

- [ ] **Step 7: Run runtime, scripts, typechecks, and local gate**

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- src/runtime.test.ts
node --test scripts/phase-2a-workflow.test.mjs scripts/phase-2b-staging-verifier.test.mjs
npm.cmd run check
```

Expected: all unit/static suites, typechecks, and builds PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/cloudflare .github/workflows/phase-2a.yml compose.yaml scripts docs/deployment/fotomax-phase-2-staging.md
git commit -m "chore: configure Vercel Blob staging storage"
```

### Task 8: Complete Integration, Browser, Review, And Provisioning Gate

**Files:**
- Modify: `apps/medusa/integration-tests/modules/photo-storage.spec.ts`
- Modify: `apps/medusa/integration-tests/http/photo-upload.spec.ts`
- Modify: `apps/medusa/integration-tests/http/photo-production.spec.ts`
- Modify: `apps/medusa/integration-tests/http/photo-security.spec.ts`
- Modify: `apps/medusa/integration-tests/http/retail-checkout.spec.ts`
- Modify: `apps/storefront/e2e/photo-upload.spec.ts`
- Modify: `apps/storefront/e2e/photo-production.spec.ts`
- Modify: `docs/verification/fotomax-phase-2b.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified implementation and an explicit stop before paid provisioning.

- [ ] **Step 1: Convert MinIO integration helpers to direct PUT**

Keep MinIO private and upload through the API-returned signed URL. Complete with the response ETag. Add assertions that:

- storage `HEAD` reports exact bytes, MIME type, and ETag;
- range reads still validate signatures;
- private preview and original reads remain authorization-gated;
- retention removes provider-routed original and preview objects;
- forged ETags and provider mismatches fail closed;
- complete replay creates one uploaded asset and one order link.

- [ ] **Step 2: Update browser mocks and journeys**

Mock `strategy: "single-put"` and one signed URL response. Assert progress reaches 100, completion submits the ETag, retry replaces an expired grant, and desktop/mobile production journeys still reach cart.

- [ ] **Step 3: Run the complete Medusa integration gate**

Run:

```powershell
docker compose up -d --wait
npm.cmd run db:migrate --workspace @fotomax/medusa
npm.cmd run test:integration --workspace @fotomax/medusa
```

Expected: all five integration suites PASS.

- [ ] **Step 4: Run the complete browser gate**

Run:

```powershell
$env:FOTOMAX_E2E='1'
npm.cmd run e2e --workspace @fotomax/storefront
```

Expected: all configured desktop and mobile Chromium projects PASS.

- [ ] **Step 5: Run final repository verification**

Run:

```powershell
npm.cmd run check
git diff --check
```

Expected: all unit/static tests, typechecks, storefront build, Medusa build, Cloudflare build, and formatting checks PASS.

- [ ] **Step 6: Request independent code review**

Use `superpowers:requesting-code-review`. Resolve all Critical and Important findings, rerun the affected focused tests, then rerun the complete local, integration, and browser gates.

- [ ] **Step 7: Record evidence and commit**

Update `docs/verification/fotomax-phase-2b.md` with exact test counts, elapsed times, provider behavior, and non-sensitive evidence paths.

```powershell
git add apps/medusa/integration-tests apps/storefront/e2e docs/verification/fotomax-phase-2b.md
git commit -m "test: verify Vercel Blob photo production"
```

- [ ] **Step 8: Stop and request paid-resource approval**

Browse current official Vercel Blob pricing. Present the current storage, operations, transfer, included-usage, and plan requirements. Request explicit approval for exactly:

- one private Blob store connected to the existing staging Vercel project;
- one scoped credential copied into Cloudflare secrets;
- staging-only usage with spend controls;
- no AWS resources and no production media.

Do not run `vercel blob create-store`, create a store in the dashboard, enable paid usage, copy credentials, or deploy until the user explicitly approves this resource action.
