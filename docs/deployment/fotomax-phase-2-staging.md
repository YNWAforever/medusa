# Fotomax Phase 2A Staging Runbook

## Scope

Staging is a disposable transaction environment. It uses live Medusa catalog, inventory, fulfillment, payment-session, and order data, but it does not enable a real payment provider, production email, production inventory, or a production domain.

The existing Vercel project remains the storefront host. The Medusa staging environment must provide the API, Admin, worker, PostgreSQL, and Redis services. Cloud provisioning is intentionally blocked until the owner approves the provider plan and usage charges at execution time.

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

1. Create or select the Medusa staging environment and managed PostgreSQL/Redis resources after approval.
2. Deploy the Medusa API and worker configuration.
3. Run `npm run db:migrate` against the staging database.
4. Run `npm run seed:medusa` twice. The second run must be a no-op reconciliation with no duplicate handles, SKUs, branches, shipping options, or API keys.
5. Record the Medusa API, worker, and Admin deployment IDs and verify `/health`.
6. Set the three storefront environment variables in the existing Vercel staging environment.
7. Deploy the storefront and record the Vercel deployment ID.
8. Run `node scripts/verify-phase-2a-staging.mjs` against the two exact deployment URLs.
9. Run browser verification at 1440x900 and 375x812 for both locales, including delivery, pickup, account orders, and Admin order visibility.

## Health and rollback

The API `/health` endpoint, worker logs, Redis connection, and a completed system-payment retail order are required staging evidence. A healthy storefront without a healthy Medusa worker is not a successful deployment.

Application rollback never reverses database migrations. If a rollback is needed, first stop new traffic or disable the affected deployment, capture the deployment IDs and logs, and use a forward-compatible application release. Only an explicitly reviewed database migration can change schema state.

## Test data cleanup

The verifier uses `phase-2a-staging-<timestamp>@fotomax.test` addresses. After verification, revoke or delete those test accounts and orders through the Admin boundary, remove temporary publishable keys if the environment is disposable, and retain the deployment IDs and logs with the verification record.
