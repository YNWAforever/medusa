# Fotomax Phase 2A Staging Runbook

## Scope

Staging is a disposable transaction environment. It uses live Medusa catalog, inventory, fulfillment, payment-session, and order data, but it does not enable a real payment provider, production email, production inventory, or a production domain.

The existing Vercel project remains the storefront host. Cloudflare Containers runs the Medusa API and worker, Neon provides PostgreSQL, and Upstash provides Redis. This runbook is staging-only: do not use it for production resources, domains, data, or credentials.

## Required environment

Storefront:

- `MEDUSA_BACKEND_URL`
- `MEDUSA_PUBLISHABLE_KEY`
- `STOREFRONT_SESSION_SECRET`

Medusa:

- `DATABASE_URL`
- `REDIS_URL`
- `MEDUSA_WORKER_MODE=shared` for the first staging deployment
- `STORE_CORS`
- `ADMIN_CORS`
- `AUTH_CORS`
- `JWT_SECRET`
- `COOKIE_SECRET`

Verification:

- `STAGING_STOREFRONT_URL`
- `STAGING_MEDUSA_URL`
- `STAGING_MEDUSA_PUBLISHABLE_KEY` or `MEDUSA_PUBLISHABLE_KEY`

Use strong, unique staging secrets. Never reuse production JWT, cookie, or storefront session secrets.

## Deployment order

1. Under Node 22, run `npm.cmd ci` and the full verification gate.
2. Set `CLOUDFLARE_API_TOKEN` only in the current PowerShell process and validate Cloudflare authentication with `npm.cmd run cloudflare:whoami`.
3. Stop for explicit Task 7 approval before creating any staging resource or secret. This gate covers Neon, Upstash, Cloudflare, Vercel, and all secret creation or entry.
4. Provision one Neon staging database in Singapore or the nearest mutually available APAC region.
5. Provision one Upstash Redis database in Singapore/APAC and obtain its native TLS `rediss://` connection string. REST credentials and Upstash Box credentials are invalid for `REDIS_URL`.
6. Generate unique 48-byte random values for `JWT_SECRET`, `COOKIE_SECRET`, and `STOREFRONT_SESSION_SECRET`.
7. Set the Neon `DATABASE_URL` and native Upstash `REDIS_URL` only in the current process, then run `npm.cmd run db:migrate` and `npm.cmd run seed:medusa` twice. The second seed must reconcile without duplicate handles, SKUs, branches, shipping options, or API keys.
8. Enter the seven Cloudflare Worker secrets interactively. Do not paste their values into shell history, files, logs, or this runbook.

```powershell
npm.cmd run secret:put --workspace @fotomax/cloudflare -- DATABASE_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- REDIS_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- STORE_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- ADMIN_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- AUTH_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- JWT_SECRET
npm.cmd run secret:put --workspace @fotomax/cloudflare -- COOKIE_SECRET
npm.cmd run secret:put --workspace @fotomax/cloudflare -- ADMIN_GATE_SECRET
```

`ADMIN_GATE_SECRET` gates `/app`, `/admin/*`, and `/auth/user/*` at the edge.
Without it those paths return an opaque 404 — the gate fails closed for admin
only, so store traffic is unaffected. Generate it like the other secrets.

9. Deploy with `npm.cmd run cloudflare:deploy`, record the Worker URL and deployment identifier, then run `npm.cmd run container:list --workspace @fotomax/cloudflare`.
10. Bootstrap the Medusa Admin operator. Nothing else in the pipeline creates one, so the Admin verification below is impossible until this runs. Point `DATABASE_URL` at the same Neon database in the current process only:

```powershell
$env:FOTOMAX_ADMIN_EMAIL = "ops@example.com"
$env:FOTOMAX_ADMIN_PASSWORD = "<strong-password>"
npm.cmd run admin:create
```

The seed scripts are not present in the container image, so this runs from the
workstation against Neon, exactly like step 7. The script is safe to re-run.

11. In the existing Vercel staging project, set `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`, and `STOREFRONT_SESSION_SECRET`, then redeploy the storefront.
12. Run `node scripts/verify-phase-2a-staging.mjs` against the exact Worker and Vercel URLs, then run browser verification at 1440x900 and 375x812 for both locales, including delivery, pickup, account orders, and Admin order visibility. Reach the Admin by sending the `x-fotomax-admin-gate` header with `ADMIN_GATE_SECRET`; confirm that `/app` without the header returns 404 while `/store/regions` still succeeds.
13. After deployment, rotate the Cloudflare token and the pasted Upstash Box credential.

## Migrations

There is no automatic migration step. `wrangler deploy` ships the Worker and
container only, so `npm.cmd run db:migrate` (step 7) must be run and confirmed
**before** deploying code that depends on a new column or table. An earlier
`predeploy` hook implied this was automatic; it never ran, because the workspace
has no `deploy` script for npm to hook onto, and it has been removed.

## Health and rollback

The Worker `/health` endpoint, container status, Redis connection, and a completed system-payment retail order are required staging evidence. A healthy Vercel storefront without a healthy Cloudflare Container is not a successful deployment.

For application rollback, restore the previous Cloudflare Worker deployment and the previous Vercel deployment. Capture the failed deployment IDs and logs first. Never reverse an already-applied Medusa migration during an application rollback; use a forward-compatible release, and alter schema only through an explicitly reviewed migration.

## Test data cleanup

The verifier uses `phase-2a-staging-<timestamp>@fotomax.test` addresses. After verification, revoke or delete those test accounts and orders through the Admin boundary, remove temporary publishable keys if the environment is disposable, and retain the deployment IDs and logs with the verification record.
