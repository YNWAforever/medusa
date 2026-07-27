# Fotomax Phase 2B Upload Foundation Design

## Goal

Deliver the secure upload foundation for Fotomax's standard 4R photo-print journey. Customers and guests can create a private photo job, upload supported images directly to private object storage, recover interrupted uploads, and resume the job from a bilingual storefront shell.

This slice establishes the durable photo-job, ownership, storage, and multipart-upload contracts. Image processing, generated previews, print configuration, quoting, cart attachment, checkout validation, and operator production controls remain in later Phase 2B slices.

## Scope

### Included

- Medusa photo-job, photo-asset, and upload-session records.
- Guarded photo-job and photo-asset lifecycle transitions.
- Guest and authenticated-customer ownership isolation.
- Guest-to-customer job claiming after login.
- Private S3-compatible object storage behind an application interface.
- MinIO for local development and integration tests.
- Direct, resumable multipart uploads from the browser.
- Same-origin Next.js BFF routes that protect photo credentials.
- A bilingual upload shell with progress, retry, remove, and resume states.
- File signature, size, count, and aggregate-job limit enforcement.
- Focused unit, integration, and desktop/mobile browser tests.

### Deferred

- Image decoding, HEIC conversion, metadata extraction, and malware scanning.
- Generated previews and print-quality estimation.
- Crop, finish, border, quantity, and batch editing.
- Authoritative quotes, cart lines, checkout, and immutable order manifests.
- Google Photos, Dropbox, and other source adapters.
- Medusa Admin production queues and audited original access.
- Cloud object-storage provisioning or any new paid resource.

## Domain Model

The `photoProduction` Medusa module owns all authoritative photo-job state.

`PhotoJob` records exactly one owner: either a guest credential hash or a Medusa customer ID. It also stores locale, region, currency, product handle, status, revision, lifecycle timestamps, retention class, and the current upload activity timestamp.

`PhotoAsset` belongs to one job and records a sanitized display filename, randomized private object key, reported and detected media type, expected and stored byte counts, checksum, upload status, failure code, and retention timestamps. Original filenames never appear in object keys or logs.

`PhotoUploadSession` belongs to one asset and records the storage upload ID, fixed part size, expected bytes, completed-part metadata, state, expiry, and an idempotency key. Signed URLs are never persisted.

Lifecycle transitions are enforced through pure state-machine functions and service methods. Terminal jobs cannot be edited. Optimistic writes require the current job revision so two browser tabs cannot silently overwrite each other.

## Ownership And Sessions

Guests receive a random 32-byte base64url secret in the secure, HttpOnly, `SameSite=Lax` cookie `fm_photo_guest`. Medusa stores only its SHA-256 digest. Comparisons use fixed-length digest bytes and timing-safe equality.

The Next.js BFF reads the cookie and forwards the credential to Medusa through a server-side header. Browser JavaScript never receives the secret. Authenticated requests use the existing Medusa customer token boundary.

Every photo-job service operation requires an owner context. Missing, invalid, expired, and cross-owner requests return the same non-enumerating not-found response. Claiming a guest job requires both the valid guest credential and an authenticated customer, is revision-checked, and is idempotent for the same customer.

Mutating BFF requests reject an unexpected `Origin`. Valid owner activity refreshes the guest cookie lifetime, but credentials are not rotated while multipart uploads are active.

## Private Storage

Application code depends on a `PhotoObjectStorage` contract rather than AWS SDK types. The first implementation uses AWS SDK v3 and supports S3-compatible endpoints.

Local development uses a private MinIO bucket. Staging can later use an explicitly approved private S3 or R2 bucket without changing domain or route contracts. Provisioning cloud storage remains a separate approval-gated operation.

Object keys use this shape:

```text
photo-jobs/{jobUuid}/originals/{assetUuid}
```

Buckets block public access and use server-side encryption where the provider supports it. Upload URLs expire after at most 15 minutes. Read URLs are outside this slice. Storage errors redact URL query strings, provider tokens, filenames, and object contents before logging.

Multipart uploads use consecutive 8 MiB parts and CRC32C checksums. Completion verifies part ordering, expected size, checksum metadata, and session ownership. Abort and cleanup operations are idempotent.

## Upload Contract

The MVP accepts JPEG, PNG, WebP, HEIC, and HEIF selected from the device or system picker. The server validates file signatures instead of trusting extensions or browser media types.

Limits are:

- 50 MiB per file.
- 500 files per job.
- 10 GiB total expected bytes per job.
- Multipart part numbers from 1 through 10,000.
- Upload signatures valid for no more than 15 minutes.

The browser first creates an asset and upload session through the BFF. It then requests signed part operations and uploads bytes directly to storage. Completion calls Medusa through the BFF, which verifies storage metadata before moving the asset to `uploaded`.

Retries reuse the active session while it remains valid. Expired or irrecoverable sessions are aborted and replaced without duplicating the asset. Repeated create and complete requests use idempotency keys and return the existing result.

## API Boundaries

Medusa Store routes provide owner-scoped operations:

```text
POST   /store/photo-jobs
GET    /store/photo-jobs?status=active
GET    /store/photo-jobs/:id
DELETE /store/photo-jobs/:id
POST   /store/photo-jobs/:id/claim
POST   /store/photo-jobs/:id/uploads
POST   /store/photo-jobs/:id/uploads/:sessionId/parts
POST   /store/photo-jobs/:id/uploads/:sessionId/complete
POST   /store/photo-jobs/:id/uploads/:sessionId/abort
```

Next.js exposes matching same-origin `/api/photo-jobs/*` handlers. Store responses use a normalized `PhotoJobView`; raw module models, storage upload IDs, provider errors, and credentials never cross into browser-visible payloads.

Stable public error codes include `photo_job_not_found`, `photo_job_expired`, `photo_job_conflict`, `upload_invalid_file`, `upload_limit_exceeded`, `upload_session_expired`, `upload_part_failed`, and `upload_completion_failed`. Each recoverable error identifies one action: retry, replace, or remove.

## Storefront Experience

The localized route `/[locale]/photo-jobs/[jobId]` is the first usable photo editor screen. It contains a device-picker action, stable upload queue, per-file progress, aggregate progress, and clear retry/remove controls.

Successful files remain visible as uploaded placeholders until the later processing slice provides previews. Interrupted jobs restore their server state on reload. An expired or inaccessible job returns the existing localized not-found experience without revealing ownership information.

The shell supports English and Traditional Chinese, keyboard operation, visible focus, screen-reader progress announcements, reduced motion, and responsive desktop/mobile layouts. Upload activity must not resize surrounding controls or obscure error recovery actions.

## Error Handling And Cleanup

Validation errors are deterministic and do not start storage operations. A failed part remains retryable while its session is valid. Completion failure leaves the session recoverable unless storage metadata proves the upload invalid.

Deleting a draft transitions the job to `cancelled`; it does not synchronously delete potentially active objects. A cleanup job aborts expired multipart sessions and deletes objects for cancelled or expired jobs. Cleanup is idempotent and records object keys and outcomes without image bytes or customer filenames.

This slice implements abandoned-upload cleanup but leaves the final seven-day abandoned-draft and thirty-day post-fulfillment retention policy to the later retention slice, where order state is available.

## Testing And Verification

Unit tests cover state transitions, ownership comparison, optimistic revision checks, configuration validation, storage input guards, idempotency, and uploader recovery.

Medusa route tests verify cross-owner isolation, claim behavior, limit enforcement, repeated requests, expired sessions, and stable errors. MinIO integration tests exercise multipart create, sign, upload, complete, head, abort, and idempotent deletion while proving unsigned reads are rejected.

Storefront tests cover BFF origin checks, credential containment, bilingual states, progress, retry, remove, reload recovery, and accessible announcements. Playwright covers one desktop and one mobile device-upload journey using deterministic local fixtures.

Completion requires focused tests, Medusa and storefront typechecks, production builds, the full existing test suite, and documented local integration evidence. Cloud verification is deferred until the user approves a storage provider and any associated paid resources.

## Delivery Sequence

1. Domain models, migration, and lifecycle state machines.
2. Guest/customer ownership, claiming, and owner-scoped routes.
3. Storage interface, MinIO environment, and integration tests.
4. Multipart upload routes and idempotent recovery.
5. Next.js BFF, browser uploader, and localized upload shell.
6. Cleanup job, browser journeys, full regression verification, and evidence.

The next Phase 2B slice consumes uploaded assets from this contract and adds asynchronous processing, safe previews, print settings, and authoritative quotes.
