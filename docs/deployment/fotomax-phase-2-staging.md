# Fotomax Phase 2B Staging Runbook

## Scope and stop condition

Staging is a disposable transaction environment for synthetic photo media, inventory, fulfillment, system-payment sessions, and orders. It does not enable a real payment provider, production email, production inventory, production media, or a production domain.

The existing Vercel staging project hosts the storefront. Cloudflare Containers runs the Medusa API and photo worker, Neon provides PostgreSQL, Upstash provides Redis, and one private Vercel Blob store will hold Phase 2B staging photo objects.

This runbook is preparation, not authorization. Do not create or connect a Blob store, enable or change paid usage, generate or enter a cloud token, or deploy until the user explicitly approves the exact staging resource action after current official pricing is presented. No AWS resources or configuration steps are part of this deployment.

## Runtime contract

Storefront values:

- `MEDUSA_BACKEND_URL`
- `MEDUSA_PUBLISHABLE_KEY`
- `STOREFRONT_SESSION_SECRET`
- `NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true`

Cloudflare Medusa secrets and settings:

- `DATABASE_URL`
- `REDIS_URL`
- `STORE_CORS`
- `ADMIN_CORS`
- `AUTH_CORS`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `PHOTO_STORAGE_PROVIDER=vercel-blob`
- `BLOB_READ_WRITE_TOKEN`

Verifier values:

- `STAGING_STOREFRONT_URL`
- `STAGING_MEDUSA_URL`
- `STAGING_MEDUSA_PUBLISHABLE_KEY` or `MEDUSA_PUBLISHABLE_KEY`

Use strong, unique staging secrets. `BLOB_READ_WRITE_TOKEN` is a Cloudflare secret: never place it in a `NEXT_PUBLIC_*` value, browser response, source file, shell transcript, log, screenshot, or evidence record. Cloudflare must not receive any S3 provider settings when `PHOTO_STORAGE_PROVIDER=vercel-blob`.

## Approval and spend controls

Before provisioning, present current official Vercel Blob pricing and request explicit approval for exactly:

- one private Blob store connected to the existing staging Vercel project;
- one scoped read-write credential entered into Cloudflare secrets;
- staging-only synthetic usage with spend controls;
- no production media or production domain;
- no other storage provider or paid resource.

Before the first upload:

1. Confirm the store is private and connected only to the staging project.
2. Configure the lowest practical budget or usage cap supported by the account and enable billing notifications before enabling photo uploads.
3. Monitor stored bytes, write operations, read operations, and transfer. Assign an owner for responding to alerts.
4. Keep the application limits at 50 MB per file and 15 minutes per upload grant.
5. Keep `NEXT_PUBLIC_PHOTO_PRINT_ENABLED` as the immediate upload kill switch.
6. Use synthetic staging images only and run retention cleanup after verification.

Record the spend-control names and enabled status, never billing credentials or secret values.

## Private Blob connection

After approval, create one private store from the existing staging Vercel project and confirm the project-to-store connection. Do not make the store public. Do not create a second store for retries.

Transfer the scoped read-write credential through a secure, non-logging path directly into the Cloudflare `BLOB_READ_WRITE_TOKEN` secret entry. The storefront does not use this credential. If the Vercel connection automatically adds a runtime token to the storefront project, remove that runtime exposure after the Cloudflare handoff while retaining the staging project connection. Confirm no client-exposed or preview environment contains the token before redeploying the storefront.

Enter Cloudflare values interactively by name only. Do not place values on the command line:

```powershell
npm.cmd run secret:put --workspace @fotomax/cloudflare -- DATABASE_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- REDIS_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- STORE_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- ADMIN_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- AUTH_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- JWT_SECRET
npm.cmd run secret:put --workspace @fotomax/cloudflare -- COOKIE_SECRET
npm.cmd run secret:put --workspace @fotomax/cloudflare -- PHOTO_STORAGE_PROVIDER
npm.cmd run secret:put --workspace @fotomax/cloudflare -- BLOB_READ_WRITE_TOKEN
```

Verify the Cloudflare secret-name listing contains the required names. Evidence may show names, timestamps, and status only; it must not show values.

## Deployment order

1. Under Node 22, run `npm.cmd ci`, start private local MinIO with `docker compose up -d --wait`, run migrations, seed twice, and complete the local verification gate. Local and CI must use `PHOTO_STORAGE_PROVIDER=s3` with the existing private MinIO and CORS values.
2. Confirm the Phase 2B verification record contains passing focused, integration, browser, typecheck, and build evidence.
3. Present current official Vercel Blob pricing and obtain the explicit approval described above. Stop if approval is absent or narrower than the requested action.
4. Create and connect the single approved private Blob store, configure spend controls, and confirm the store is private.
5. Enter the core Medusa secrets, `PHOTO_STORAGE_PROVIDER`, and `BLOB_READ_WRITE_TOKEN` in Cloudflare by name only. Confirm no S3 provider variables are present in the selected-provider deployment environment.
6. Run `npm.cmd run db:migrate` and `npm.cmd run seed:medusa` twice against staging. The second seed must reconcile without duplicates.
7. Deploy Cloudflare Medusa, record the deployment identifier, and verify `/health`, container readiness, Redis connectivity, worker heartbeat, and private storage access without logging a signed URL or token.
8. Configure the storefront values in the existing Vercel staging project, including `NEXT_PUBLIC_PHOTO_PRINT_ENABLED=true`, then deploy and record the deployment identifier.
9. Run the staging verifier against the exact Cloudflare and Vercel deployment URLs.
10. Run the required desktop and mobile browser journeys for both locales, including account draft claim, delivery, pickup, confirmation, Admin manifest access, fulfillment, and accelerated retention deletion.
11. Record sanitized evidence, review spend telemetry, clean up synthetic test data, and rotate any temporary credential used during setup.

## Staging verifier

Set the verifier environment in the current process without printing values, then run:

```powershell
node scripts/verify-phase-2a-staging.mjs
```

The verifier must:

- wait for the Medusa backend and photo worker;
- load both storefront locales;
- create a mixed retail and photo cart;
- generate a synthetic JPEG;
- validate the allowlisted `single-put` upload DTO;
- send one direct `PUT` with exactly the returned `requiredHeaders`;
- require a non-empty response ETag and complete with `{ etag }`;
- wait for the photo asset to become ready;
- quote and attach the photo version;
- select delivery and create the system payment session;
- complete the order and confirm its photo-version link.

A verifier failure blocks staging acceptance. Do not paste a signed upload URL, request headers, token, or full environment dump into an issue or evidence file.

## Credential rotation

Rotate the Blob credential after suspected exposure, operator handoff, or the staging verification window:

1. Generate a replacement scoped credential using the approved Vercel control surface without displaying it in logs or evidence.
2. Replace the Cloudflare `BLOB_READ_WRITE_TOKEN` secret interactively.
3. Redeploy only Cloudflare Medusa and verify health, worker readiness, a synthetic upload, private read, and deletion.
4. Revoke the previous credential only after the replacement deployment passes.
5. Record rotation time, operator, deployment identifier, and verifier result. Never record either credential.

If replacement verification fails, restore the prior Cloudflare secret through the secure control surface, redeploy, and investigate before revocation.

## Health and rollback

A successful staging deployment requires the Worker `/health` endpoint, container readiness, Redis connectivity, worker heartbeat, private Blob access, a ready generated photo, and a completed mixed retail/photo system-payment order. A healthy storefront alone is not sufficient.

For application rollback:

1. Capture failed deployment identifiers and sanitized logs.
2. Disable `NEXT_PUBLIC_PHOTO_PRINT_ENABLED` to stop new photo sessions.
3. Restore the previous Cloudflare Worker deployment and previous Vercel storefront deployment.
4. Do not reverse an applied Medusa migration; ship a forward-compatible fix.
5. Keep the private Blob store and its credential available while retained Blob-backed assets or active sessions still reference it.
6. Do not switch the provider for new uploads unless the replacement adapter is fully configured. With no approved staging S3 store, leave uploads disabled instead.
7. Do not make the Blob store public as a diagnostic workaround.

Resource deletion is a separate approved action. Do not delete the store, disconnect the project, revoke the only working credential, or change paid usage as part of an application rollback.

## Evidence and cleanup

Record only non-sensitive evidence in `docs/verification/fotomax-phase-2b.md`:

- Vercel project and private Blob store identifiers or names;
- proof that the store is private and connected to staging;
- spend-control names and enabled status;
- Cloudflare and Vercel deployment identifiers;
- Cloudflare secret names and update timestamps, never values;
- exact test commands, counts, durations, and exit status;
- sanitized verifier JSON and completed synthetic order identifier;
- worker readiness, processing, retention, and deletion results;
- credential rotation timestamp and result.

Do not retain signed URLs, upload headers, token fragments, environment dumps, or raw secret-entry output. The verifier uses `phase-2b-staging-<timestamp>@fotomax.test` and generated image data only. Remove synthetic accounts and orders through the Admin boundary, run accelerated staging retention, confirm private objects are deleted, and retain only the sanitized evidence above.
