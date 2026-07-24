# Fotomax Phase 2B Verification

## Scope

This record covers the private photo-production vertical slice on branch `codex/fotomax-phase-2b-verification-deploy`. All files and browser uploads use generated test images. No AWS staging resource has been provisioned.

## Local evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Docker services | PASS | PostgreSQL, Redis, MinIO, and private bucket initialization healthy via `docker compose up -d --wait`. |
| Repository unit/static suites | PASS | Cloudflare 25, Medusa 383, storefront 247, shared 11, and scripts 10: 676 tests total. |
| Storage/config regressions | PASS | 29 focused tests. |
| Upload/version route regressions | PASS | 52 focused tests. |
| Money conversion | PASS | 5 tests; Medusa HKD 2.8 projects to 280 cents and unsafe values are rejected. |
| Medusa integration gate | PASS | 5 suites and 13 tests in 157.428 s: retail checkout, private upload, production, security, and S3-compatible storage. |
| Photo browser matrix | PASS | 6/6 focused cases in 42.9 s: English and Traditional Chinese at desktop and Pixel 5 viewports. |
| Complete browser gate | PASS | 48/48 in 8.4 minutes, including all retail, checkout, account, locale, responsive, upload, and production cases on desktop and mobile Chromium. |
| Database lifecycle | PASS | Medusa migrations completed; the operational seed completed twice against the same database without drift. |
| Complete local gate | PASS | `npm run check`: all workspace typechecks, 676 unit/static tests, storefront build, Medusa build, and Cloudflare build. |

## Verified assertions

- Generated device file selection, multipart progress, and uploaded versus worker-ready states.
- Failed persisted upload replacement with exact source identity.
- Batch fit/matte defaults, per-photo quantity, quality filtering, and warning acknowledgement.
- Authoritative quote and grouped retail/photo cart rendering.
- Browser-origin multipart PUTs through the MinIO CORS policy on desktop and mobile.
- Mixed retail/photo checkout creates one order, freezes the selected job version, and rejects incompatible pickup branches.
- Expired presigned URLs, CSRF rejection, audited Admin access, and accelerated idempotent retention deletion.
- Shared retention/order locks, stranded-upload event reconciliation, and compensated order-link retries.
- No console errors, failed private preview requests, broken media, horizontal page overflow, or lost focus.
- A Playwright failure exposed overlapping mobile toolbar controls; the responsive toolbar now preserves intrinsic control widths inside its horizontal scroller.

## Live staging gate

AWS staging remains blocked pending explicit approval of current pricing and the exact S3/IAM resources in the staging runbook. After approval, record:

- AWS bucket and IAM identifiers without secret values.
- Cloudflare and Vercel deployment IDs.
- Worker heartbeat and private storage probe.
- Staging verifier JSON for the generated mixed retail/photo order.
- Admin manifest, fulfillment, and accelerated retention evidence.
- Desktop/mobile screenshots for both locales.

