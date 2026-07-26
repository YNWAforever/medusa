# Fotomax Phase 2B Verification

## Scope

This Task 8 record covers the single-PUT photo-storage contract on branch `codex/fotomax-phase-2b-verification-deploy`. The final evidence run used this commit's code and test tree, based on parent `c5743bfc1c6e01f517c2bf8ce57a0f5d5cc2e676`, including the TDD-backed Playwright environment-isolation fix described below. Verification used generated images and the repository's local PostgreSQL, Redis, and private MinIO services. MinIO remained private, and browser tests received only signed upload URLs plus required content headers.

No Vercel Blob resource was provisioned or connected. No real token was used, no deployment was created, and no paid usage was modified.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Docker services | PASS | `docker compose up -d --wait`; PostgreSQL, Redis, MinIO, and bucket initialization healthy; measured wall time 2.849 s. |
| Medusa migrations | PASS | `npm.cmd run db:migrate --workspace @fotomax/medusa` with backend-only local MinIO configuration; database and links up to date, migration scripts completed; measured wall time 57.582 s. |
| Medusa integration | PASS | `npm.cmd run test:integration --workspace @fotomax/medusa` with local Compose DB/MinIO variables; all 5 configured suites and 17 tests passed; Jest 212.461 s, measured wall time 215.542 s. |
| Storefront Playwright | PASS | `FOTOMAX_E2E=1 npm.cmd run e2e --workspace @fotomax/storefront`; 54/54 passed in Playwright 4.6 min, measured wall time 279.418 s. Both projects ran 27 cases, including 10 photo-upload cases, 4 localized photo-production-to-cart cases, and live local signed PUT probes. |
| Repository check | PASS | `npm.cmd run check`; all workspace typechecks; Cloudflare 29, Medusa 453, storefront 280, shared 11, scripts 10 (783 tests total); storefront, Medusa, and Cloudflare builds completed; measured wall time 96.254 s. |
| Diff hygiene | PASS | `git diff --check` returned no errors after the final evidence edits; measured wall time 0.037 s. |

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
- RED (final-head regression): the Playwright configuration test passed 1 and failed 1 because the live Medusa server environment omitted `PHOTO_STORAGE_PROVIDER`; Vitest 1.26 s, measured wall time 3.279 s.
- GREEN (final-head regression): after supplying the backend-only local `s3` provider default, the Playwright configuration test passed 2/2; Vitest 1.09 s, measured wall time 2.245 s.
- RED (environment boundary): with ambient backend credential sentinels injected, the Playwright configuration test passed 1 and failed 2 because Medusa inherited the sentinel provider and credentials and the storefront inherited forbidden values; Vitest 836 ms, measured wall time 1.903 s.
- GREEN (environment boundary): after filtering backend-only key families from child process inheritance and assigning fixed local Medusa values, the Playwright configuration test passed 3/3; Vitest 946 ms, measured wall time 2.151 s. The test also confirms the storefront retains PATH/SystemRoot when present and receives only its explicit application variables.
- GREEN: the final real local Playwright run passed all 54 desktop/mobile tests, including browser-origin PUTs against private MinIO and all six delivery/account completion journeys.

## External gate

Vercel Blob provisioning, token configuration, deployment, and live staging verification were intentionally not run. They require separate explicit approval and are not claimed by this record.
