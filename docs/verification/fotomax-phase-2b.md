# Fotomax Phase 2B Verification

## Scope

This Task 8 record covers the single-PUT photo-storage contract and the complete review fixes on branch `codex/fotomax-phase-2b-verification-deploy`. The final evidence run is based on reviewed head `ea20d0d7ce92cdf2ab3c9a9f94804b9b0c49681d` plus focused fixes `34dd533`, `079b174`, and `6d3c50d`. Verification used generated images and the repository's local PostgreSQL, Redis, and private MinIO services. MinIO remained private, and browser tests received only signed upload URLs plus required content headers.

No Vercel Blob resource was provisioned or connected. No real token was used, no deployment was created, and no paid usage was modified.

## Gate evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Affected Medusa tests | PASS | Storage, stale cleanup, and upload-route command: 8 files, 126/126 tests, Vitest 6.50 s. |
| Affected storefront tests | PASS | Uploader, client, and Playwright-config command: 3 files, 48/48 tests, Vitest 927 ms. |
| Docker services | PASS | `docker compose up -d --wait`; PostgreSQL, Redis, MinIO, and bucket initialization healthy; measured wall time 2.0 s. |
| Medusa migrations | PASS | `npm.cmd run db:migrate --workspace @fotomax/medusa` with explicit local Compose DB/Redis/MinIO variables; database and links up to date, migration scripts completed without provider-configuration errors; measured wall time 10.52 s. |
| Medusa integration | PASS | `npm.cmd run test:integration --workspace @fotomax/medusa` with explicit local Compose DB/Redis/MinIO variables; all 5 configured suites and 17 tests passed; Jest 115.044 s. |
| Storefront Playwright | PASS | `FOTOMAX_E2E=1 npm.cmd run e2e --workspace @fotomax/storefront`; 56/56 passed in Playwright 6.8 min. Both projects ran 28 cases, including the new reload recovery and live local signed PUT probes. |
| Repository check | PASS | `npm.cmd run check`; all workspace typechecks; Cloudflare 29, Medusa 459, storefront 282, shared 11, scripts 10 (791 tests total); storefront, Medusa, and Cloudflare builds completed; measured wall time 121.548 s. |
| Diff hygiene | PASS | `git diff --check` returned no errors after the final evidence edits. |

Both focused typechecks and production builds also passed before the aggregate gate. The storefront build completed successfully while logging the existing missing `MEDUSA_BACKEND_URL` cache-revalidation fallback and multiple-lockfile warnings. Those warnings were not treated as live backend verification. An initial integration invocation without explicit parent-process DB credentials failed before application initialization; the recorded gate is the corrected explicit-environment rerun.

## Contract assertions

- New uploads use one signed direct `PUT`, required `content-type`, and completion body `{etag}`. Explicit legacy S3 multipart completion, abort, and stale cleanup coverage remains in the storage suite.
- Stale cleanup atomically changes an active session to cleanup-owned `expired` state before provider deletion or multipart abort. A completion winner prevents deletion; a cleanup winner prevents completion, and provider failure leaves `expired` plus `aborted_at: null` for cleanup-only retry.
- Direct-PUT completion persists the exact asset/session/ETag checkpoint in the existing durable queue before completion. Reload or manual retry resumes only the exact active session without another PUT, while terminal server state reconciles response-lost-after-commit and clears the checkpoint.
- Replacement generations remain bounded and are used only when the server returns an expired or otherwise replaceable session. A checkpoint never migrates to a different session or object.
- Storage inspection matches exact byte count, content type, and opaque ETag; full reads match source bytes; unsigned private-object reads return 403.
- Completion reads a 12-byte prefix from an object larger than 1 MiB before rejecting mismatched magic bytes.
- Cross-owner preview access is concealed, authorized preview access is private and signed, unauthenticated original access is rejected, and audited admin original access returns exact source bytes.
- Provider-routed retention deletes both original and preview objects and remains idempotent.
- Persisted client ETags are never trusted: completion re-inspects exact provider metadata and fails closed on forged ETags, byte/type mismatch, magic-byte mismatch, or provider mismatch.
- The Vercel Blob adapter rejects non-integer, zero, negative, and greater-than-50-MB direct-upload sizes with `photo_storage_invalid_size` before token issuance; 1 byte and exactly 50 MB are accepted.
- Completion replay returns one asset, and the mixed order contains one matching photo line and one version-to-order-line link.
- Browser recovery proves PUT success plus a completion 503 before commit, then reload and retry with one PUT, the same session/object and ETag, and one terminal asset commit on desktop and mobile.

## Browser evidence

- [Desktop Chromium: English photo workspace restored `holiday.jpg` at 100%](evidence/photo-upload-desktop-chromium.png)
- [Mobile Chromium: Traditional Chinese photo workspace restored `holiday.jpg` at 100%](evidence/photo-upload-mobile-chromium.png)

## TDD evidence

- RED (stale cleanup claim): 12 cleanup tests ran with 4 failures and 8 passes. Deletion occurred before ownership, provider failure reopened active state, and both deterministic interleavings violated the required winner semantics; Vitest 3.02 s.
- GREEN (stale cleanup claim): 12/12 cleanup tests passed; the combined cleanup and upload-route command then passed 55/55 tests in 3.72 s.
- RED (ambiguous completion unit): 33 uploader tests ran with 2 failures and 31 passes because the ETag checkpoint was absent after failure-before-commit and response-lost-after-commit; Vitest 1.76 s.
- RED (ambiguous completion browser): the recovery journey failed on desktop and mobile because durable queue rows lacked `completionEtag`; the invoked mocked file matrix reported 8 passes, 2 skips, and 2 failures in 51.7 s.
- GREEN (ambiguous completion unit): 33/33 uploader tests passed in 591 ms. The affected uploader/client command passed 45/45 tests in 616 ms.
- GREEN (ambiguous completion browser): the focused recovery journey passed 2/2 across desktop and mobile in 13.0 s, asserting one PUT, one session/object, the same ETag, and one terminal asset commit.
- RED (Blob size boundary): 17 adapter tests ran with 3 failures and 14 passes because invalid zero, fractional, and 50-MB-plus-one values reached signing; Vitest 636 ms.
- GREEN (Blob size boundary): 17/17 adapter tests passed in 733 ms; the full storage suite passed 71/71 tests across 6 files in 877 ms.
- GREEN (affected surface): post-commit affected commands passed 126/126 Medusa tests in 6.50 s and 48/48 storefront tests in 927 ms; both typechecks and both builds passed.
- GREEN (whole branch): Docker migration/integration, all 56 Playwright desktop/mobile cases, and `npm.cmd run check` all passed with the counts above.

## External gate

Vercel Blob provisioning, token configuration, deployment, and live staging verification were intentionally not run. They require separate explicit approval and are not claimed by this record.
