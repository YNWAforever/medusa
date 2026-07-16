# Fotomax Cloudflare MVP Hosting Design

## Status

Approved direction: deploy the Medusa backend with the Cloudflare CLI. Cloudflare Workers Paid at a USD 5 monthly base plus usage is approved. Provisioning Neon, provisioning Upstash Redis, and creating deployment secrets remain separate approval-gated actions.

## Goal

Provide a low-cost public MVP environment for the Phase 2A Fotomax storefront without changing its commerce model or coupling it to Medusa Cloud. The deployment must support the live catalog, persistent carts, delivery and pickup checkout, optional customer accounts, Medusa Admin, PostgreSQL, and Redis.

The existing Vercel project remains the storefront host. The environment stays non-production: no real payment provider, transactional email, production inventory, or production domain is enabled.

## Approaches Considered

### Cloudflare Container with external data services (selected)

Run the existing Medusa Node application in a Cloudflare Container reached through a thin Worker. Use Neon for PostgreSQL and Upstash for Redis. This preserves the completed Medusa implementation and starts with a small usage-based footprint.

Trade-offs: the stack spans three providers, an idle container can have a cold start, and database migrations are an explicit release step.

### Railway-managed backend

Run Medusa, PostgreSQL, and Redis together on Railway while retaining Vercel for the storefront. This is operationally simpler, but it does not satisfy the selected Cloudflare CLI direction.

### Workers-native commerce rewrite

Port the Medusa behavior to Workers, D1, KV, Queues, and Workflows. This would replace rather than deploy the current backend, and it would discard the completed transaction and Admin work. It is outside MVP scope.

## Architecture

```text
Browser
  |
  v
Vercel Next.js storefront
  |
  v
Cloudflare Worker endpoint
  |
  v
Cloudflare Container: Medusa API + Admin + shared worker
  |                                      |
  v                                      v
Neon PostgreSQL                      Upstash Redis
```

The Worker owns public routing and forwards each request to one stable staging container identity. The container runs the current Medusa build with `MEDUSA_WORKER_MODE=shared`. API work and background event processing therefore share one process for the MVP.

The data services and container should use the nearest mutually available Asia region, preferring Singapore. The first release uses one container instance. Automatic multi-region replication and a dedicated Medusa worker are deferred until traffic or reliability evidence justifies them.

## Components

### Cloudflare Worker and Container

`wrangler` is installed as an exact project development dependency. A repository-owned Wrangler configuration defines the Worker entry point, Container binding, instance type, health route, placement preference, and observability. A multi-stage Dockerfile builds only the Medusa workspace and its shared package dependencies.

The Worker contains no commerce logic. It forwards API and Admin traffic, returns a controlled `503` response while the container starts or is unavailable, and attaches a request identifier for logs. Cloudflare Workflows, Queues, and scheduled jobs are not part of the first deployment.

The initial container may scale to zero when idle. Several seconds of cold-start delay are acceptable for the MVP. No synthetic keep-alive is added because it would convert burst pricing into continuous runtime cost.

### PostgreSQL

Neon supplies a standard TLS PostgreSQL connection string through `DATABASE_URL`. D1 is not used because the existing Medusa modules and migrations require PostgreSQL. The free Neon tier is acceptable for staging until its storage or compute limit is approached.

Schema migrations run before application deployment. Application rollback never reverses database migrations. Seed reconciliation runs twice after the first migration and must remain idempotent.

### Redis

Upstash supplies a TLS Redis protocol connection string through `REDIS_URL`. The REST token and Upstash Box API key are not substitutes for this connection string. KV is not used because the current Medusa event bus, cache, locking, and workflow engine use Redis-compatible modules.

The free Upstash tier is acceptable for MVP traffic. Command usage is monitored because Medusa background processing can consume the monthly command allowance faster than page traffic alone suggests.

### Vercel Storefront

The storefront remains on its existing Vercel project. Its staging environment receives the Cloudflare Worker URL as `MEDUSA_BACKEND_URL`, the seeded Medusa publishable key as `MEDUSA_PUBLISHABLE_KEY`, and a unique `STOREFRONT_SESSION_SECRET`.

No storefront runtime fallback to fixtures is permitted in the public staging deployment.

## Secrets and Access

Tracked files contain names and placeholders only. Secret values are created uniquely for staging and entered with provider secret-management commands, including `wrangler secret put` where applicable. They are never passed as command-line arguments, written to logs, committed, or placed in public environment variables.

Required Medusa values are `DATABASE_URL`, `REDIS_URL`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`, and `MEDUSA_WORKER_MODE=shared`. Cloudflare account credentials remain local operator credentials and are not embedded in the deployed application.

Credentials pasted into chat are treated as exposed and rotated after deployment. The supplied Upstash Box credential is not used by the application.

## Deployment Flow

1. Validate Cloudflare CLI authentication and account access without creating resources.
2. After explicit approval, create or select the Neon database and Upstash Redis database.
3. Create unique staging JWT, cookie, and storefront session secrets.
4. Run the repository verification gate.
5. Apply Medusa migrations to Neon.
6. Run the Medusa reference seed twice and capture the publishable key.
7. Deploy the Worker and Container with `wrangler deploy` and capture the version/deployment identifier.
8. Update the Vercel staging variables and redeploy the storefront.
9. Run the deployment-specific verifier against the exact backend and storefront URLs.
10. Verify the customer journeys and Admin order visibility in desktop and mobile browsers.

If deployment fails before traffic switches, the previous Worker version remains active. If it fails after release, roll back the Worker and storefront application versions while preserving the migrated database schema.

## Error Handling and Observability

The Worker exposes a lightweight health response and converts container startup or routing failures into a stable JSON `503` response. Medusa retains its existing `/health` endpoint for application readiness.

Cloudflare logs must include request identifier, route, status, duration, and container lifecycle failures without recording cookies, authorization headers, customer addresses, or secrets. Verification evidence records the Cloudflare deployment identifier, Vercel deployment identifier, backend health result, worker/container status, and exact test URLs.

Budget alerts are enabled before public staging use. Neon compute/storage and Upstash command usage are reviewed after the first end-to-end test and again after one week.

## Verification

Before deployment:

- Root checks, Medusa unit tests, storefront unit tests, and production builds pass.
- Medusa integration tests pass against PostgreSQL and Redis.
- Playwright discovers and runs the Phase 2A desktop/mobile matrix.
- The container image starts locally and answers `/health` before it is pushed.

After deployment:

- Both storefront locales load live Medusa catalog data.
- Delivery and pickup orders complete with the system payment provider.
- Inventory reservation and cancellation release are visible.
- Account login and order history preserve customer isolation.
- Medusa Admin displays the staging order.
- Desktop and mobile checks report no uncaught exceptions, failed media, console errors, or horizontal overflow.

## Cost Boundary

Cloudflare Workers Paid has an approved USD 5 monthly base plus usage. Container memory, CPU, disk, logging, and egress are usage-billed. Neon and Upstash begin on free plans, but upgrading either service or enabling paid add-ons requires a new explicit approval.

The deployment does not create a production environment. The MVP is reconsidered if cold starts materially affect checkout, Medusa exceeds the selected container resources, or combined provider cost approaches the simpler managed alternatives.
