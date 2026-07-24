# Fotomax Phase 2B Staging Runbook

## Scope

Staging is a disposable transaction environment. It uses live Medusa catalog, private synthetic photo media, inventory, fulfillment, payment-session, and order data, but it does not enable a real payment provider, production email, production inventory, production media, or a production domain.

The existing Vercel project remains the storefront host. Cloudflare Containers runs the Medusa API and worker, Neon provides PostgreSQL, Upstash provides Redis, and one private Amazon S3 bucket in ap-east-1 stores synthetic staging photo media.

## Required environment

Storefront:

- MEDUSA_BACKEND_URL
- MEDUSA_PUBLISHABLE_KEY
- STOREFRONT_SESSION_SECRET
- NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true

Medusa:

- DATABASE_URL
- REDIS_URL
- MEDUSA_WORKER_MODE=shared
- STORE_CORS
- ADMIN_CORS
- AUTH_CORS
- JWT_SECRET
- COOKIE_SECRET
- PHOTO_STORAGE_ENDPOINT=https://s3.ap-east-1.amazonaws.com
- PHOTO_STORAGE_REGION=ap-east-1
- PHOTO_STORAGE_BUCKET
- PHOTO_STORAGE_ACCESS_KEY
- PHOTO_STORAGE_SECRET_KEY
- PHOTO_STORAGE_FORCE_PATH_STYLE=false
- PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION=true

Verification:

- STAGING_STOREFRONT_URL
- STAGING_MEDUSA_URL
- STAGING_MEDUSA_PUBLISHABLE_KEY or MEDUSA_PUBLISHABLE_KEY

Use strong, unique staging secrets. Never reuse production JWT, cookie, storefront session, or AWS credentials.

## AWS approval gate

Stop before creating or changing any paid AWS resource. Present current AWS pricing and request explicit approval for exactly:

- One private S3 bucket in ap-east-1, with block-public-access enabled and AES256 default encryption.
- One least-privilege IAM principal limited to the bucket and required multipart/object operations.
- Bucket CORS limited to the exact Vercel staging origin.
- A lifecycle rule that aborts incomplete multipart uploads after one day.
- No KMS customer-managed key, production media, production domain, or broad account permissions.

Application retention remains authoritative for completed objects. Do not create the bucket, IAM principal, access keys, policies, CORS rules, lifecycle rules, or secrets before approval.

## Deployment order

1. Under Node 22, run npm.cmd ci, docker compose up -d --wait, migrations, the seed twice, and the complete local gate.
2. Confirm the Phase 2B verification record contains passing backend integration and browser evidence.
3. Obtain explicit AWS approval using the resource list above.
4. Create the approved S3 bucket, block all public access, enable AES256 default encryption, apply exact staging-origin CORS, and configure one-day incomplete-multipart cleanup.
5. Create the approved least-privilege IAM principal. Permit only bucket listing plus multipart and object operations under the application prefix.
6. Enter all runtime values as Cloudflare Worker secrets. Do not paste values into shell history, files, logs, or this runbook.

    npm.cmd run secret:put --workspace @fotomax/cloudflare -- DATABASE_URL
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- REDIS_URL
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- STORE_CORS
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- ADMIN_CORS
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- AUTH_CORS
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- JWT_SECRET
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- COOKIE_SECRET
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_ENDPOINT
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_REGION
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_BUCKET
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_ACCESS_KEY
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_SECRET_KEY
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_FORCE_PATH_STYLE
    npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION

7. Run npm.cmd run db:migrate and npm.cmd run seed:medusa twice against staging. The second seed must reconcile without duplicates.
8. Deploy with npm.cmd run cloudflare:deploy, record the Worker URL and deployment identifier, then verify API/worker heartbeat and a private storage write/read/delete probe.
9. In the existing Vercel staging project, set the storefront values above, including NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true, and redeploy.
10. Run node scripts/verify-phase-2a-staging.mjs against the exact Worker and Vercel URLs. It must upload a generated image directly to private storage, wait for worker readiness, quote and attach the photo version to a retail cart, then complete delivery with system payment.
11. Run browser verification at 1440x900 and 375x812 for both locales. Verify account draft claim, delivery, pickup, confirmation, Admin manifest access, fulfillment, and accelerated retention deletion.
12. Record deployment IDs, verifier JSON, worker logs, and browser evidence in docs/verification/fotomax-phase-2b.md. Rotate temporary access credentials after verification.

## Health and rollback

A successful staging deployment requires the Worker /health endpoint, container status, Redis connection, worker heartbeat, private storage access, a ready generated photo, and a completed mixed retail/photo system-payment order. A healthy storefront without a healthy API, worker, or private storage path is not successful.

For application rollback, restore the previous Cloudflare Worker deployment and previous Vercel deployment. Capture failed deployment IDs and logs first. Never reverse an applied Medusa migration during application rollback; use a forward-compatible release and alter schema only through a reviewed migration.

Disable NEXT_PUBLIC_PHOTO_PRINT_ENABLED before rolling back a backend that cannot serve the photo contract. Do not make the S3 bucket public as a diagnostic workaround.

## Test data cleanup

The verifier uses phase-2b-staging-<timestamp>@fotomax.test and generated image data only. After verification, remove test accounts and orders through the Admin boundary, run accelerated staging retention proof, confirm private objects are deleted, and retain only non-sensitive deployment evidence.