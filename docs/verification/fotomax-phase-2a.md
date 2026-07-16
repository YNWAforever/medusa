# Fotomax Phase 2A Verification

Date: 2026-07-13
Branch: `codex/fotomax-storefront`

## Completed before the local integration gate

- Checkout implementation commit: `1ca2a3b`
- Storefront tests: 25 files, 179 tests passed
- Storefront typecheck: passed
- Storefront production build: passed and emitted checkout, account, and confirmation routes
- Live Medusa checkout adapter probe: `getCheckout` passed against the local seeded backend before the backend was stopped
- Built storefront checkout page HTTP check: `GET /en/checkout` returned 200 on port 3106
- Browser visual verification: unavailable in this environment

## Task 10 gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Medusa unit suite | Passed | 9 files, 57 tests; `npm run test --workspace @fotomax/medusa` |
| Medusa typecheck | Passed for the integration harness | `npm run typecheck --workspace @fotomax/medusa` |
| Medusa integration suite | Blocked | Runner loads after `pg-god` and VM-module fixes, then cannot connect to PostgreSQL because Docker Desktop is unavailable |
| Postgres/Redis infrastructure | Blocked | `docker compose ps` cannot connect to the Docker Desktop Linux engine |
| Storefront Playwright | Blocked | Web-server wait timed out at 120 seconds while Medusa could not start without PostgreSQL/Redis |
| Root check | Passed | `npm run check` exit 0; typechecks, 57 Medusa tests, 179 storefront tests, and both production builds pass |
| Cloud staging | Not started | Explicit cloud-resource approval is required before provisioning |

The integration command currently reaches database bootstrap and fails with connection refusal. This is infrastructure evidence, not a passing order-flow result. The prior direct Medusa probe also exposed a shipping-profile mismatch during order completion; the integration gate is intended to make that production seed defect reproducible once PostgreSQL and Redis are available.

## CI gate

`.github/workflows/phase-2a.yml` starts PostgreSQL and Redis services, migrates, seeds twice, runs the repository check, builds the Cloudflare Container image, validates the Wrangler deployment bundle with a dry run, runs the Medusa integration suite, installs Chromium, and runs both Playwright projects. CI must pass before staging deployment. The live Cloudflare/Vercel deployment IDs and order evidence are recorded after the separate deployment flow.

## Cloudflare MVP staging

```text
Git commit:
GitHub Actions run:
Cloudflare Worker URL:
Cloudflare deployment ID:
Cloudflare container status:
Vercel deployment URL:
Vercel deployment ID:
Backend health result:
Staging verifier result:
Desktop browser result:
Mobile browser result:
Credential rotation confirmed:
```

## Live staging completion

Verified on 2026-07-16 against the canonical production storefront and the
Cloudflare staging backend.

| Check | Result | Evidence |
| --- | --- | --- |
| Cloudflare Worker | Passed | `https://fotomax-medusa-staging.laichiwillyjp.workers.dev`; version `dc9b8011-ec0c-45c3-8978-cf5eeb68bd32` |
| Cloudflare container | Passed | Application `a0379f22-8431-46b1-9e07-bd3b960a4c40` active with one live instance; image digest `sha256:f488c98c6dad60b40c95c86d01c54e3298cad79fe42d54e4166f0e0f26d13d91` |
| Backend health | Passed | Public `GET /health` returned `200 OK` after deployment |
| Vercel production | Passed | Deployment `dpl_13Uo2BeHKT2kfkEwWvq2qdxCqdrF` ready and aliased to `https://fotomax-storefront.vercel.app` |
| Locale routes | Passed | `/en` and `/zh-HK` both returned HTTP 200 |
| Transaction verifier | Passed | Created order `order_01KXMSVBNH4M22EWQ5CQB9N6VE`, display ID `1`, total `118` |
| Storefront runtime cart | Passed | `/api/cart/items` created a one-item HKD cart and set the cart cookie through the Vercel runtime |
| Desktop browser | Passed | Chromium at 1440x900: HTTP 200, no page/console errors, `scrollWidth` equals `clientWidth` (1440) |
| Mobile browser | Passed | Chromium at 390x844: HTTP 200, no page/console errors, `scrollWidth` equals `clientWidth` (390) |

Visual evidence:

- `docs/verification/screenshots/fotomax-phase-2a-desktop.png`
- `docs/verification/screenshots/fotomax-phase-2a-mobile.png`

Credential rotation remains required for the Cloudflare token and other key
material pasted into the task conversation. Rotation cannot be verified from
the repository.
