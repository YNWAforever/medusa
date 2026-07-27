# Vercel Blob Photo Storage Design

## Goal

Replace Amazon S3 as the Phase 2B staging photo store with a private Vercel Blob store while keeping Medusa and its photo worker on Cloudflare. Preserve private direct uploads, ownership checks, processing, previews, order attachment, retention, and local integration testing.

## Scope

This change covers the photo object-storage boundary, browser upload transport, Cloudflare environment forwarding, tests, and staging documentation.

It does not move Medusa routes or workers to Vercel, migrate existing production media, enable a production domain, or change photo pricing, editing, checkout, fulfillment, or retention policy.

## Provider Strategy

The application will support two storage providers behind one provider-neutral interface:

- `s3`: retained for local MinIO integration tests and rollback compatibility.
- `vercel-blob`: used by Phase 2B staging.

`PHOTO_STORAGE_PROVIDER` selects the adapter for new uploads at process startup. Assets and upload sessions record their provider so a session cannot start with one provider and complete through another, while historical objects remain readable after a configuration change.

The Vercel adapter uses `@vercel/blob` with a scoped `BLOB_READ_WRITE_TOKEN` stored only in Cloudflare secrets. The token is never returned to the browser or written to logs, source files, or deployment evidence.

## Upload Flow

1. The browser requests an upload session through the existing authenticated or guest-owned Medusa boundary.
2. Medusa validates the filename, reported MIME type, expected byte count, job limits, ownership, and source idempotency key.
3. Medusa creates an immutable object pathname under the existing `photo-jobs/<uuid>/originals/<uuid>` namespace.
4. The Vercel adapter mints a signed `PUT` URL scoped to that pathname, expected content type, maximum file size, and a 15-minute expiry.
5. Medusa persists the active upload session and returns the signed URL, required headers, expiry, asset ID, and session ID.
6. The browser uploads the complete file directly to Vercel Blob with progress reporting. Vercel handles the transport without routing file bytes through Medusa.
7. The browser submits the provider ETag to the existing completion endpoint.
8. Medusa authenticates to the private store and verifies pathname, object existence, exact byte count, content type, prefix magic bytes, and ETag before completing the session.
9. Completion remains idempotent and publishes `photo_asset.uploaded`. Existing reconciliation republishes stranded events.
10. The worker reads the private original, generates a JPEG preview, writes it through the same adapter, and continues the existing version, quote, cart, order, fulfillment, and retention flow.

The current 50 MB per-file limit is retained. The S3-specific browser part-signing loop is removed from the provider-neutral path. Existing S3 multipart methods remain internal to the S3 adapter for local compatibility.

## Storage Interface

The public module interface will accept an object reference containing `provider` and `key`, and expose provider-neutral operations:

- create a direct private upload grant;
- inspect a private object;
- read a private object prefix;
- stream a private object;
- write a private JPEG preview;
- sign a short-lived private read;
- delete private objects.

Provider results carry an opaque provider ETag or integrity identifier. Domain code must not assume an AWS multipart upload ID, S3 checksum header, bucket name, or S3 URL shape.

An additive migration will introduce:

- `photo_asset.storage_provider`, required and backfilled to `s3`;
- `photo_asset.provider_etag`, nullable;
- `photo_upload_session.storage_provider`, required and backfilled to `s3`;
- `photo_upload_session.upload_strategy`, required and backfilled to `multipart`;
- `photo_upload_session.completion_metadata`, nullable JSON.

New Blob sessions use `storage_provider=vercel-blob` and `upload_strategy=single-put`. Existing `provider_upload_id`, `part_size`, and `completed_parts` fields remain for S3 multipart compatibility and are not repurposed. No existing records are destructively rewritten.

## Security

- Use one private Vercel Blob store.
- Keep the scoped read-write token only in Cloudflare secrets.
- Scope each browser URL to one pathname and one `PUT` operation.
- Limit upload grants to 15 minutes, the validated content type, and at most 50 MB.
- Keep object pathnames immutable and unguessable.
- Require existing customer or guest ownership checks before issuing or completing an upload.
- Serve previews and originals only through short-lived signed reads issued after authorization.
- Redact provider URLs and tokens from logs and verification artifacts.
- Do not create an AWS bucket, IAM principal, access key, policy, lifecycle rule, or CORS configuration.

## Failure And Replay Behavior

- An expired upload grant produces a retryable replacement session without reusing the old pathname.
- Duplicate session creation with the same source idempotency key returns the winning active session.
- Duplicate completion with the same ETag returns the completed asset and republishes the upload event safely.
- Completion with a different ETag fails with `photo_upload_completion_mismatch`.
- Missing, oversized, undersized, or metadata-mismatched objects fail closed.
- Invalid uploaded objects are deleted when ownership and pathname are established.
- Provider failures map to the existing stable `photo_storage_*` error family.
- A session whose recorded provider has no configured adapter fails closed without accessing another store.
- Retention deletion remains idempotent.

## Local Development And Rollback

Local development and integration tests continue to use private MinIO through the S3 adapter. This avoids paid Vercel Blob operations in routine test runs and preserves the strongest existing storage integration suite.

Staging selects `vercel-blob` for new uploads. The storage router keeps configured adapters for providers referenced by retained assets. Rollback switches the new-upload provider only after the target store is configured; active sessions continue through their recorded provider. Existing objects remain readable through the provider recorded on their assets until retention removes them.

## Verification

Unit tests must cover:

- provider selection and invalid configuration;
- signed upload constraints and token redaction;
- Blob inspect, prefix read, stream, preview write, signed read, and delete behavior;
- provider error mapping;
- session provider mismatch;
- completion replay and forged ETag rejection;
- expired grant replacement;
- Cloudflare forwarding for Vercel Blob variables.

Integration tests must cover:

- private direct upload and completion through the provider-neutral contract;
- size, MIME type, magic-byte, and ETag validation;
- worker processing and private preview access;
- cart, order, fulfillment, and retention behavior with Blob-backed assets;
- existing MinIO/S3 compatibility.

Browser tests must cover desktop and mobile upload progress, retry after an expired grant, completion, editing, quoting, and adding the generated photo product to cart.

The complete repository check, Medusa integration gate, and browser gate must pass before staging provisioning.

## Provisioning Gate

Creating a Vercel Blob store or enabling paid usage is an external resource action. Before provisioning, present current official Vercel Blob pricing and request explicit approval for exactly:

- one private Blob store connected to the existing staging Vercel project;
- one scoped credential made available to Cloudflare Medusa;
- staging-only usage and spend controls;
- no AWS resources and no production media.

After approval, provision through the Vercel CLI or dashboard, store the credential as a Cloudflare secret, deploy, run the staging verifier, and record non-sensitive deployment evidence.
