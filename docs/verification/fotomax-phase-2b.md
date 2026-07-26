# Fotomax Phase 2B Verification

## Scope

This Task 8 record covers the single-PUT photo-storage contract on branch `codex/fotomax-phase-2b-verification-deploy`. Verification used generated images and the repository's local PostgreSQL, Redis, and private MinIO services. MinIO remained private, and browser tests received only signed upload URLs plus required content headers.

No Vercel Blob resource was provisioned or connected. No real token was used, no deployment was created, and no paid usage was modified.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Docker services | PASS | `docker compose up -d --wait`; PostgreSQL, Redis, MinIO, and bucket initialization healthy; 1.292 s. |
| Medusa migrations | PASS | `npm.cmd run db:migrate` with local-only S3-compatible storage configuration; database and links up to date, migration scripts completed; 17.591 s. |
| Medusa integration | PASS | Configured command ran all 5 suites and 17 tests; Jest 118.971 s, measured wall time 120.399 s. |
| Storefront Playwright | PASS | `FOTOMAX_E2E=1` desktop and Pixel 5 projects; 50/50 tests in 7.2 min, including 10 Task 8 photo cases and live local signed PUT probes. |
| Repository check | PASS | All workspace typechecks; Cloudflare 29, Medusa 453, storefront 277, shared 11, scripts 10 (780 tests total); storefront, Medusa, and Cloudflare builds completed; 168.705 s. |
| Diff hygiene | PASS | `git diff --check` returned no errors after Task 8 edits. |

The storefront build completed successfully while logging the existing missing `MEDUSA_BACKEND_URL` cache-revalidation fallback and multiple-lockfile warnings. Those warnings were not treated as live backend verification.

## Contract assertions

- New uploads use one signed direct `PUT`, required `content-type`, and completion body `{etag}`. Explicit legacy S3 multipart completion and idempotent abort coverage remains in the storage suite.
- Storage inspection matches exact byte count, content type, and opaque ETag; full reads match source bytes; unsigned private-object reads return 403.
- Completion reads a 12-byte prefix from an object larger than 1 MiB before rejecting mismatched magic bytes.
- Cross-owner preview access is concealed, authorized preview access is private and signed, unauthenticated original access is rejected, and audited admin original access returns exact source bytes.
- Provider-routed retention deletes both original and preview objects and remains idempotent.
- Forged ETags and persisted provider mismatches fail closed; mismatch state and object cleanup behavior are asserted explicitly.
- Completion replay returns one asset, and the mixed order contains one matching photo line and one version-to-order-line link.
- Browser upload progress reaches 100, a locally expired direct grant is replaced before any stale PUT, active-window provider 401/403 responses fail without abort or replacement, and English plus Traditional Chinese desktop/mobile journeys reach the grouped cart.

## Browser evidence

- [Desktop Chromium: English photo workspace restored `holiday.jpg` at 100%](evidence/photo-upload-desktop-chromium.png)
- [Mobile Chromium: Traditional Chinese photo workspace restored `holiday.jpg` at 100%](evidence/photo-upload-mobile-chromium.png)

## TDD evidence

- RED: after the browser fixtures advertised `single-put` but before direct routes were added, the focused mocked desktop run failed 4 tests because no signed direct PUT completed.
- RED (initial Task 8): uploader unit coverage expecting provider 401/403 to imply expiry failed 2 cases because both were reported as `photo_upload_failed`.
- RED (review fix): 29/31 uploader tests passed; the 2 new active-window 401/403 cases failed because the adapter reported `photo_upload_expired`. The focused desktop browser run also failed both cases by entering replacement instead of rendering `Upload failed`.
- GREEN (review fix): 31/31 uploader tests passed. The focused desktop browser regression passed 2/2 cases, and the full mocked photo journey passed 8 tests across desktop/mobile with 2 live-service probes intentionally skipped.
- GREEN: the final real local Playwright run passed all 50 desktop/mobile tests, including browser-origin PUTs against private MinIO.

## External gate

Vercel Blob provisioning, token configuration, deployment, and live staging verification were intentionally not run. They require separate explicit approval and are not claimed by this record.
