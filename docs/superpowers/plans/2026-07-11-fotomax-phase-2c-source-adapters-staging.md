# Fotomax Phase 2C Source Adapters and Staging Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Photos and Dropbox imports through one normalized ingestion boundary, capture bilingual customer notifications and secure order transfers, harden reliability/security/observability, and pass the final public staging release gate for the complete Phase 2 journey.

**Architecture:** Provider-specific adapters own selection sessions and short-lived retrieval credentials; a provider-neutral workflow immediately copies selected bytes into Fotomax private storage and then uses the Phase 2B processing pipeline. Google OAuth tokens and Dropbox direct links are encrypted only while imports are active and are erased after completion or expiry. Medusa workers handle imports and captured notifications. Next.js opens provider selection UI but never stores reusable provider authorization. Health, rate limits, correlation IDs, metrics, contract tests, and live deployment checks close the production-shaped staging boundary.

**Tech Stack:** Phase 2A/2B stack, Google Photos Picker REST API, Google OAuth 2.0 authorization-code flow, Dropbox Chooser, Node crypto AES-256-GCM, Redis rate limits/heartbeat, Medusa Notification Module provider, Medusa order-transfer workflows, Prometheus-style metrics, Vitest, Jest integration tests, Playwright, Vercel, Medusa Cloud, AWS S3.

## Global Constraints

- Complete and verify Phase 2A and Phase 2B before starting this plan.
- Device/system-picker, Google Photos, and Dropbox must all produce the same normalized ingestion item and end in the same private processing workflow.
- iCloud remains available through the Apple device/system picker. Do not add or advertise a separate iCloud web connector.
- Do not add social-network imports unless a provider exposes an approved API and the user separately approves that scope.
- Google uses only `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`, online access, and no refresh token.
- Google Picker access tokens, Picker media base URLs, Dropbox direct links, OAuth codes, and signed object URLs must never appear in logs, analytics, browser storage, database plaintext, or notification payloads.
- Provider credentials may exist encrypted only for the active import lifetime and must be erased after success, cancellation, or expiry.
- External bytes must be copied immediately into Fotomax private storage. Provider URLs are never production assets.
- Every provider item is subject to Phase 2B MIME/signature, byte, count, decoded-pixel, duplicate, and retention policies.
- CI and ordinary browser tests use deterministic fake providers. Live Google/Dropbox login is a separate staging verification using designated test accounts.
- Staging notifications are captured in Medusa and never sent to real customers.
- Account order access uses Medusa's order-transfer workflows and a one-time token. Matching an email address alone never grants access.
- Public readiness responses reveal component status only, not connection strings, bucket names, queue payloads, or customer identifiers.
- Provisioning Google Cloud OAuth credentials, a Dropbox app, paid services, or new secrets requires explicit user approval during execution.
- Run focused tests and commit after every task.

## Plan Dependencies

- Consumes Phase 2B `PhotoJobView`, `PhotoAssetView`, `PhotoImportSession`, owner context, private storage, processing workflow, Admin, and retention behavior.
- Consumes Phase 2A `CustomerView`, `CheckoutState`, confirmation cookie, account pages, and Medusa customer/order APIs.
- Produces the final `PhotoSourceAdapter` contract, captured notification boundary, health/metrics contract, and complete Phase 2 verification evidence.

---

## File Structure

- `apps/medusa/src/modules/photo-sources/types.ts`: canonical provider-neutral adapter and item contracts.
- `apps/medusa/src/modules/photo-sources/token-vault.ts`: versioned AES-256-GCM temporary-secret encryption.
- `apps/medusa/src/modules/photo-sources/device-adapter.ts`: Phase 2B upload normalization.
- `apps/medusa/src/modules/photo-sources/google-photos-adapter.ts`: OAuth, Picker session, media list, and selected-byte stream.
- `apps/medusa/src/modules/photo-sources/dropbox-adapter.ts`: Chooser selection validation and direct-link stream.
- `apps/medusa/src/workflows/ingest-photo-source-item.ts`: shared private-copy and processing workflow.
- `apps/medusa/src/api/store/photo-jobs/[id]/imports/*`: source start/callback/selection/status/cancel APIs.
- `apps/storefront/src/components/photo-editor/source-picker.tsx`: device/Google/Dropbox source controls and state.
- `apps/storefront/app/api/photo-imports/google/callback/route.ts`: OAuth callback and Picker redirect.
- `apps/medusa/src/modules/notification-capture/*`: captured provider, templates, records, and Admin routes.
- `apps/storefront/app/api/orders/[orderId]/transfer/*`: secure request/accept order-transfer BFF.
- `apps/medusa/src/observability/*`: request context, redaction, metrics, worker heartbeat, and readiness.
- `apps/medusa/src/security/rate-limit.ts`: Redis-backed endpoint limits.
- `apps/medusa/integration-tests/http/source-adapters.spec.ts`: fake-provider and token-disposal integration tests.
- `apps/storefront/e2e/source-adapters.spec.ts`: provider test-mode browser journeys.
- `scripts/verify-phase-2-staging.mjs`: final deployment-specific live gate.
- `docs/verification/fotomax-phase-2.md`: final evidence and release decision.

---

### Task 1: Normalize Device and External Sources Behind One Adapter Contract

**Files:**
- Create: `apps/medusa/src/modules/photo-sources/types.ts`
- Create: `apps/medusa/src/modules/photo-sources/contract-tests.ts`
- Create: `apps/medusa/src/modules/photo-sources/device-adapter.ts`
- Create: `apps/medusa/src/modules/photo-sources/device-adapter.test.ts`
- Create: `apps/medusa/src/modules/photo-sources/token-vault.ts`
- Create: `apps/medusa/src/modules/photo-sources/token-vault.test.ts`
- Create: `apps/medusa/src/modules/photo-sources/service.ts`
- Create: `apps/medusa/src/modules/photo-sources/index.ts`
- Create: `apps/medusa/src/workflows/ingest-photo-source-item.ts`
- Modify: `apps/medusa/src/modules/photo-production/models/photo-import-session.ts`
- Create: `apps/medusa/src/modules/photo-production/migrations/Migration20260711000300.ts`
- Modify: `apps/medusa/medusa-config.ts`

**Interfaces:**
- Consumes: Phase 2B upload sessions, private storage, asset processing, and owner context.
- Produces: canonical `PhotoSourceAdapter`, encrypted temporary-secret storage, and provider-neutral ingestion.

- [ ] **Step 1: Define the adapter contract and contract suite**

Create this exact public interface:

```ts
export type PhotoSourceType = "device" | "google_photos" | "dropbox"

export interface NormalizedPhotoSourceItem {
  sourceType: PhotoSourceType
  providerSessionId: string
  providerItemId: string
  displayFilename: string
  reportedMediaType: string | null
  expectedBytes: number | null
  idempotencyKey: string
  retrievalExpiresAt: string | null
}

export interface SourceSessionStart {
  importSessionId: string
  expiresAt: string
  customerAction:
    | { kind: "none" }
    | { kind: "redirect"; url: string }
    | { kind: "chooser" }
}

export interface PhotoSourceAdapter {
  readonly sourceType: PhotoSourceType
  startSelection(input: {
    photoJobId: string
    ownerKey: string
    locale: "en" | "zh-HK"
    idempotencyKey: string
  }): Promise<SourceSessionStart>
  listSelectedItems(importSessionId: string): Promise<NormalizedPhotoSourceItem[]>
  openItemStream(input: {
    importSessionId: string
    item: NormalizedPhotoSourceItem
    signal: AbortSignal
  }): Promise<ReadableStream<Uint8Array>>
  dispose(importSessionId: string): Promise<void>
}
```

The reusable contract suite must prove stable idempotency keys, no unencrypted secret in returned DTOs, stream abort support, source type preservation, repeated `dispose`, and rejection after expiry.

- [ ] **Step 2: Write failing device-adapter and token-vault tests**

`DevicePhotoSourceAdapter` wraps a completed Phase 2B private upload as a normalized item and opens the existing private original. Its provider item ID is the Phase 2B asset ID.

`ProviderTokenVault` uses a 32-byte base64 `PHOTO_PROVIDER_TOKEN_KEY`, AES-256-GCM, a random 96-bit IV, authenticated context `{ importSessionId, sourceType, keyVersion }`, and payload expiry. Tests must detect ciphertext alteration, wrong context/key, expired payload, and accidental serialization of plaintext.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources`

Expected: FAIL because the source module is absent.

- [ ] **Step 3: Extend import sessions and implement common ingestion**

Add `provider_session_id`, `credentials_ciphertext`, `credentials_key_version`, `selection_state`, `selected_count`, `imported_count`, `failed_count`, and `credentials_cleared_at` to `PhotoImportSession`. Never add a plaintext token/link column.

`ingestPhotoSourceItem` must:

1. Enforce job ownership and source-item idempotency.
2. Stream at most 50 MiB with a 30-second idle timeout and three redirects maximum.
3. Copy to a randomized Phase 2B original key while computing CRC32C and SHA-256.
4. Confirm the private object and create/update the `PhotoAsset`.
5. Emit `photo_asset.uploaded` for the existing processor.
6. Dispose provider credentials when every selected item reaches imported or terminal failure.

Do not buffer a full provider file in Medusa memory.

- [ ] **Step 4: Verify and commit Task 1**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources`

Run: `npm.cmd run db:migrate && npm.cmd run typecheck --workspace @fotomax/medusa`

Expected: PASS.

```bash
git add apps/medusa
git commit -m "feat: normalize photo source ingestion"
```

---

### Task 2: Implement the Google Photos Picker Backend Adapter

**Files:**
- Create: `apps/medusa/src/modules/photo-sources/google-photos-client.ts`
- Create: `apps/medusa/src/modules/photo-sources/google-photos-client.test.ts`
- Create: `apps/medusa/src/modules/photo-sources/google-photos-adapter.ts`
- Create: `apps/medusa/src/modules/photo-sources/google-photos-adapter.test.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/google/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/google/[sessionId]/callback/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/[sessionId]/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/[sessionId]/cancel/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/google/google-routes.unit.spec.ts`
- Modify: `apps/medusa/.env.example`

**Interfaces:**
- Consumes: Google OAuth authorization code and Photos Picker REST API.
- Produces: an owner-scoped Picker session, normalized selected media, private import, and disposed authorization.

- [ ] **Step 1: Build a local fake Google provider in tests**

Use an in-process Node HTTP server with deterministic endpoints for OAuth token exchange, Picker session create/get, paginated media list, and expiring media download. Record every request so tests can assert exact scope/header/query use without calling Google.

Cover invalid state, reused code, wrong redirect URI, denied consent, token expiry, Picker timeout/cancel, media pagination, duplicate selections, expired base URL, oversized stream, transient `429/5xx` retry, permanent `4xx`, and credential disposal.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources/google-photos-client.test.ts src/modules/photo-sources/google-photos-adapter.test.ts google-routes.unit.spec.ts`

Expected: FAIL because the Google adapter is absent.

- [ ] **Step 2: Implement exact OAuth and Picker requests**

Use authorization endpoint `https://accounts.google.com/o/oauth2/v2/auth`, token endpoint `https://oauth2.googleapis.com/token`, and scope:

```text
https://www.googleapis.com/auth/photospicker.mediaitems.readonly
```

Set `response_type=code`, `access_type=online`, a ten-minute random state, exact callback URI, and no refresh-token request. Exchange the code server-side and encrypt the access token immediately. If Google unexpectedly returns a refresh token, discard it without persistence and record only a redacted policy-warning event.

Create a Picker session at `https://photospicker.googleapis.com/v1/sessions`, return its `pickerUri` only to the callback redirect flow, poll the session status through the authenticated API, and list all selected media pages once media is set. Download each media item from its API-provided `baseUrl` with `=d` and bearer authorization. Accept only HTTPS Google API responses and `*.googleusercontent.com` media hosts.

- [ ] **Step 3: Implement idempotent routes and polling behavior**

`POST /store/photo-jobs/:id/imports/google` creates/reuses an owner-scoped import session and returns an OAuth redirect. The callback route validates state plus owner, exchanges the code, creates the Picker session, and returns `{ pickerUri, importSessionId }`.

`GET /store/photo-jobs/:id/imports/:sessionId` checks Picker status. Once selected items are ready, it records normalized items in a transaction and emits one ingestion job per item exactly once. Polls after that return counts/status without calling Google again.

On success, cancellation, or terminal expiry, call adapter `dispose`, clear ciphertext/provider base URLs, and set `credentials_cleared_at`.

- [ ] **Step 4: Verify and commit Task 2**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources/google-photos-client.test.ts src/modules/photo-sources/google-photos-adapter.test.ts google-routes.unit.spec.ts`

Expected: PASS with fake-provider request assertions.

```bash
git add apps/medusa
git commit -m "feat: import Google Photos Picker selections"
```

---

### Task 3: Add the Google Photos Selection Experience

**Files:**
- Create: `apps/storefront/src/lib/photo/google-photos.ts`
- Create: `apps/storefront/src/lib/photo/google-photos.test.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/imports/google/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/imports/[sessionId]/route.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/imports/[sessionId]/cancel/route.ts`
- Create: `apps/storefront/app/api/photo-imports/google/callback/route.ts`
- Create: `apps/storefront/src/components/photo-editor/google-photos-button.tsx`
- Create: `apps/storefront/src/components/photo-editor/google-photos-button.test.tsx`
- Create: `apps/storefront/src/components/photo-editor/source-picker.tsx`
- Create: `apps/storefront/src/components/photo-editor/source-picker.test.tsx`
- Modify: `apps/storefront/src/components/photo-editor/photo-editor.tsx`
- Modify: `apps/storefront/.env.example`

**Interfaces:**
- Consumes: Google start/callback/status BFF operations from Task 2.
- Produces: accessible popup selection, resumable import progress, cancel/retry, and the same asset grid as device uploads.

- [ ] **Step 1: Write popup, callback, and recovery tests**

Cover popup blocked, OAuth denied, state mismatch, callback error, Picker cancelled, popup auto-close, import polling, page reload, partial item failure, complete success, explicit cancel, and focus restoration to the Google button. No test may put access tokens or Picker media URLs into local/session storage.

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/google-photos.test.ts src/components/photo-editor/google-photos-button.test.tsx src/components/photo-editor/source-picker.test.tsx`

Expected: FAIL because the Google UI and BFF are absent.

- [ ] **Step 2: Implement the popup flow**

The editor opens the OAuth URL in a named popup from a direct user activation. The same-origin callback forwards the authorization code/state to Medusa with owner credentials, then responds with a `302` to `${pickerUri}/autoclose` in the same popup. The main editor polls the owner-scoped import session every two seconds while visible, backs off while hidden, and resumes after reload.

Do not place `pickerUri`, OAuth code/state, or provider URLs in the editor URL. If the popup is blocked, show one localized action to open selection in the current tab and preserve the editor return route in signed state.

- [ ] **Step 3: Integrate source progress**

Show source-specific selection status but merge imported assets into the existing `PhotoJobView.assets`. Announce selected, importing, processed, failed, and preserved counts. A failed item offers retry/remove without restarting successful items.

Keep the feature hidden unless server env and `NEXT_PUBLIC_GOOGLE_PHOTOS_ENABLED=true` are both configured. An enabled public button with missing server credentials must fail the build or readiness check, not at customer click time.

- [ ] **Step 4: Verify and commit Task 3**

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/google-photos.test.ts src/components/photo-editor/google-photos-button.test.tsx src/components/photo-editor/source-picker.test.tsx`

Run: `npm.cmd run build --workspace @fotomax/storefront`

Expected: PASS.

```bash
git add apps/storefront
git commit -m "feat: add Google Photos picker flow"
```

---

### Task 4: Implement Dropbox Chooser and Immediate Private Import

**Files:**
- Create: `apps/medusa/src/modules/photo-sources/dropbox-adapter.ts`
- Create: `apps/medusa/src/modules/photo-sources/dropbox-adapter.test.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/dropbox/route.ts`
- Create: `apps/medusa/src/api/store/photo-jobs/[id]/imports/dropbox/dropbox-route.unit.spec.ts`
- Create: `apps/storefront/src/lib/photo/dropbox.ts`
- Create: `apps/storefront/src/lib/photo/dropbox.test.ts`
- Create: `apps/storefront/app/api/photo-jobs/[jobId]/imports/dropbox/route.ts`
- Create: `apps/storefront/src/components/photo-editor/dropbox-button.tsx`
- Create: `apps/storefront/src/components/photo-editor/dropbox-button.test.tsx`
- Modify: `apps/storefront/src/components/photo-editor/source-picker.tsx`
- Modify: `apps/storefront/next.config.mjs`
- Modify: `apps/storefront/.env.example`
- Modify: `apps/medusa/.env.example`

**Interfaces:**
- Consumes: Dropbox Chooser direct-link selection.
- Produces: validated normalized Dropbox items, immediate private copy, token/link disposal, and editor progress.

- [ ] **Step 1: Write adapter and chooser tests first**

Use a fake direct-link server and test valid selections, duplicate provider IDs, expired links, redirected host escape, non-HTTPS links, unsupported extensions, missing byte counts, oversized streams, partial imports, cancel, replay, and link ciphertext clearing.

Allow only `content.dropboxapi.com`, `dl.dropboxusercontent.com`, and subdomains ending `.dropboxusercontent.com`. Revalidate every redirect target against the allowlist.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources/dropbox-adapter.test.ts dropbox-route.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/dropbox.test.ts src/components/photo-editor/dropbox-button.test.tsx`

Expected: FAIL because Dropbox support is absent.

- [ ] **Step 2: Implement Chooser configuration and BFF selection**

Load `https://www.dropbox.com/static/api/2/dropins.js` once with script ID `dropboxjs` and `data-app-key=NEXT_PUBLIC_DROPBOX_APP_KEY`. Invoke:

```ts
Dropbox.choose({
  linkType: "direct",
  multiselect: true,
  extensions: ["images"],
  success: handleDropboxSelection,
  cancel: handleDropboxCancel,
})
```

Send only chooser entry ID, name, bytes, reported type, and direct link to the same-origin BFF. Never write the link to browser storage or logs.

- [ ] **Step 3: Validate and import immediately in Medusa**

The Medusa route validates owner, source limits, unique provider entry IDs, HTTPS and host allowlist, encrypts links, creates normalized items, and emits ingestion immediately. Set session expiry to three hours and thirty minutes. Stream with byte/time/redirect limits, then clear each link ciphertext as soon as its private copy completes or fails terminally.

Update CSP intentionally: permit the exact Dropbox script origin, no wildcard scripts, and retain nonce-based local scripts. Keep object previews restricted to configured private S3 origins.

- [ ] **Step 4: Verify and commit Task 4**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/photo-sources/dropbox-adapter.test.ts dropbox-route.unit.spec.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/photo/dropbox.test.ts src/components/photo-editor/dropbox-button.test.tsx`

Expected: PASS.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: import Dropbox chooser selections"
```

---

### Task 5: Capture Bilingual Notifications and Secure Guest Order Transfers

**Files:**
- Create: `apps/medusa/src/modules/notification-capture/models/captured-notification.ts`
- Create: `apps/medusa/src/modules/notification-capture/service.ts`
- Create: `apps/medusa/src/modules/notification-capture/provider.ts`
- Create: `apps/medusa/src/modules/notification-capture/templates.ts`
- Create: `apps/medusa/src/modules/notification-capture/templates.test.ts`
- Create: `apps/medusa/src/modules/notification-capture/index.ts`
- Create: `apps/medusa/src/modules/notification-capture/migrations/Migration20260711000400.ts`
- Create: `apps/medusa/src/subscribers/photo-notifications.ts`
- Create: `apps/medusa/src/subscribers/order-notifications.ts`
- Create: `apps/medusa/src/api/admin/captured-notifications/route.ts`
- Create: `apps/medusa/src/admin/routes/captured-notifications/page.tsx`
- Modify: `apps/medusa/medusa-config.ts`
- Create: `apps/storefront/app/api/orders/[orderId]/transfer/request/route.ts`
- Create: `apps/storefront/app/api/orders/[orderId]/transfer/accept/route.ts`
- Create: `apps/storefront/src/lib/order-transfer.ts`
- Create: `apps/storefront/src/lib/order-transfer.test.ts`
- Create: `apps/storefront/app/[locale]/account/claim-order/page.tsx`
- Modify: `apps/storefront/app/[locale]/checkout/confirmation/page.tsx`

**Interfaces:**
- Consumes: Medusa events, locale/customer/order/photo records, built-in request/accept order-transfer workflows.
- Produces: captured staging messages and one-time signed customer actions without real delivery.

- [ ] **Step 1: Write exact template and capture-provider tests**

Create bilingual templates for account verification/order transfer, order confirmation, processing action required, shipment, and pickup readiness. Tests assert both locales contain order display ID where applicable, action links use the configured staging storefront origin, no private asset URL/token is rendered, and unknown locale falls back to `zh-HK` only when the order locale is absent.

Captured records contain recipient, channel, locale, template ID, subject, HTML/text body, status, event ID, related order/job IDs, and timestamp. They must not contain provider tokens, object URLs, or image bytes.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/notification-capture/templates.test.ts`

Expected: FAIL because the capture module is absent.

- [ ] **Step 2: Register a staging-only captured notification provider**

Implement Medusa's Notification Module provider contract and register it only when `NOTIFICATION_PROVIDER=capture`. Reject `capture` when a production-activation flag is true. Make event IDs unique so retries do not create duplicate captured messages.

Add a dense Admin page for filtering by recipient/template/status and previewing content. It must be Admin-authenticated and must not expose any reusable action token after it has been consumed or expired.

- [ ] **Step 3: Use Medusa's built-in order-transfer workflows**

From the private confirmation page, an authenticated customer can request transfer of the guest order shown in the 15-minute confirmation cookie. The Next.js BFF calls Medusa's built-in `POST /store/orders/:id/transfer/request` Store endpoint, which runs `requestOrderTransferWorkflow`; capture the resulting one-time transfer notification to the checkout email. The claim page requires the logged-in customer plus the one-time token and calls the built-in transfer-accept Store endpoint, which runs `acceptOrderTransferWorkflow`.

Enforce 24-hour token expiry, one-time consumption, customer/email validation through Medusa's workflow, and generic errors for invalid/used/foreign tokens. Do not attach an order from email matching alone.

- [ ] **Step 4: Verify and commit Task 5**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/modules/notification-capture/templates.test.ts`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/lib/order-transfer.test.ts`

Run: `npm.cmd run db:migrate && npm.cmd run build --workspace @fotomax/medusa`

Expected: PASS.

```bash
git add apps/medusa apps/storefront
git commit -m "feat: capture notifications and order transfers"
```

---

### Task 6: Add Rate Limits, Readiness, Metrics, and Secret-Safe Logging

**Files:**
- Modify: `apps/medusa/package.json`
- Create: `apps/medusa/src/security/rate-limit.ts`
- Create: `apps/medusa/src/security/rate-limit.test.ts`
- Create: `apps/medusa/src/observability/request-context.ts`
- Create: `apps/medusa/src/observability/request-context.test.ts`
- Create: `apps/medusa/src/observability/redaction.ts`
- Create: `apps/medusa/src/observability/redaction.test.ts`
- Create: `apps/medusa/src/observability/metrics.ts`
- Create: `apps/medusa/src/observability/worker-heartbeat.ts`
- Create: `apps/medusa/src/jobs/worker-heartbeat.ts`
- Create: `apps/medusa/src/api/health/ready/route.ts`
- Create: `apps/medusa/src/api/admin/fotomax-health/route.ts`
- Create: `apps/medusa/src/api/admin/fotomax-metrics/route.ts`
- Modify: `apps/medusa/src/api/middlewares.ts`
- Modify: `apps/storefront/next.config.mjs`
- Create: `apps/storefront/proxy.ts`
- Create: `apps/storefront/src/lib/csp.ts`
- Create: `apps/storefront/src/security-headers.test.ts`

**Interfaces:**
- Consumes: Redis, PostgreSQL, S3, worker/job data, and all public mutation routes.
- Produces: bounded abuse controls, request/job correlation, redacted logs, readiness, heartbeat, queue visibility, and metrics.

- [ ] **Step 1: Write security and observability tests first**

Use Redis-backed fixed-window limits with these exact defaults:

```ts
export const rateLimitPolicies = {
  auth: { limit: 10, windowSeconds: 900 },
  orderTransfer: { limit: 5, windowSeconds: 3600 },
  providerImport: { limit: 20, windowSeconds: 3600 },
  adminAssetAccess: { limit: 30, windowSeconds: 300 },
} as const
```

Test IP plus normalized email/owner keys, atomic increment/expiry, `429` plus `Retry-After`, and no credential in keys. If Redis is unavailable, fail closed with `503` for auth, order transfer, provider import, and Admin asset-access mutations while leaving read-only catalog routes available; readiness must report Redis unhealthy. Test redaction of Authorization, cookies, OAuth codes, URLs with queries, Dropbox links, Google tokens, signed S3 URLs, and original filenames.

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/security src/observability`

Expected: FAIL because the modules are absent.

- [ ] **Step 2: Add correlation and metrics**

Accept or generate a UUID `x-request-id`, return it on responses, and propagate request/job/cart/order IDs as structured fields. Add `prom-client@15.1.3` and these metrics:

```text
fotomax_photo_import_total{source,status}
fotomax_photo_processing_seconds{format,status}
fotomax_photo_queue_depth{state}
fotomax_photo_oldest_job_seconds{state}
fotomax_photo_dead_letter_total{stage}
fotomax_photo_quote_total{status}
fotomax_photo_cart_attach_total{status}
fotomax_photo_retention_total{policy,status}
fotomax_checkout_total{result}
```

The protected Admin metrics route returns Prometheus text. Never use email, job ID, asset ID, cart ID, order ID, filename, or provider item ID as metric labels.

- [ ] **Step 3: Implement readiness and heartbeat**

The worker writes `fotomax:worker:heartbeat` every 30 seconds with a 90-second TTL and ensures encrypted object `_health/ready` exists in private storage. Public `GET /health/ready` checks database query, Redis ping, a head request for that fixed health object, migration state, and heartbeat freshness. Return only `{ ready, database, redis, storage, worker }` booleans with `200` or `503`.

The Admin health route additionally returns queue depth, oldest queued age, dead-letter count, last cleanup result, and deployment version, without secrets or customer identifiers.

- [ ] **Step 4: Tighten response headers and provider CSP**

Generate a per-request nonce in `proxy.ts`, forward it to the App Router, and build the CSP in `src/lib/csp.ts`. Set strict transport security in production, `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, nonce-based scripts, exact Dropbox script origin, exact configured preview origins, and no wildcard provider domains. Preserve Google OAuth/Picker popup navigation without relaxing frame or script policy.

- [ ] **Step 5: Verify and commit Task 6**

Run: `npm.cmd run test --workspace @fotomax/medusa -- src/security src/observability`

Run: `npm.cmd run test --workspace @fotomax/storefront -- src/security-headers.test.ts`

Run: `npm.cmd audit --omit=dev --audit-level=high`

Expected: PASS with no new high/critical production dependency advisory. Record any unrelated baseline finding separately.

```bash
git add apps/medusa apps/storefront package-lock.json
git commit -m "feat: harden staging operations"
```

---

### Task 7: Add Full Contract, Browser, Accessibility, and Failure Coverage

**Files:**
- Create: `apps/medusa/integration-tests/http/source-adapters.spec.ts`
- Create: `apps/medusa/integration-tests/http/notifications-observability.spec.ts`
- Create: `apps/storefront/e2e/source-adapters.spec.ts`
- Create: `apps/storefront/e2e/accessibility.spec.ts`
- Create: `apps/storefront/e2e/failure-recovery.spec.ts`
- Create: `apps/storefront/src/lib/photo/test-provider.ts`
- Modify: `apps/storefront/package.json`
- Modify: `apps/storefront/playwright.config.ts`
- Modify: `.github/workflows/phase-2a.yml`
- Modify: `docs/deployment/fotomax-phase-2-staging.md`

**Interfaces:**
- Consumes: complete commerce/photo/provider/notification/observability system.
- Produces: deterministic CI proof across API, data, worker, browser, accessibility, and failure boundaries.

- [ ] **Step 1: Add provider contract integration tests**

Run the same adapter contract suite against device, fake Google, and fake Dropbox. Verify immediate private copy, exact source metadata, duplicate idempotency, abort/timeouts, partial failure, retries, token/link disposal, and Phase 2B processing output.

Add integration coverage for notification idempotency, transfer token expiry/use, rate-limit atomicity, readiness degradation by dependency, worker heartbeat expiry, metrics increments, and log redaction under provider failures.

Run: `npm.cmd run test:integration --workspace @fotomax/medusa -- source-adapters.spec.ts notifications-observability.spec.ts`

Expected: PASS.

- [ ] **Step 2: Add a provider test mode without production fallback**

Create `source-adapters.spec.ts`, `accessibility.spec.ts`, and `failure-recovery.spec.ts` before adding the test provider, then run:

Run: `npm.cmd run e2e --workspace @fotomax/storefront -- source-adapters.spec.ts accessibility.spec.ts failure-recovery.spec.ts`

Expected: FAIL because deterministic Google/Dropbox test selection is not available yet.

When and only when `SOURCE_ADAPTER_MODE=test`, expose deterministic fake Google/Dropbox selection routes for Playwright. Reject this mode in non-test environments. Do not make fake providers a runtime fallback when real provider configuration is missing.

- [ ] **Step 3: Cover complete browser journeys**

Both `en` and `zh-HK`, desktop and mobile, must cover:

1. Device/iCloud-system-picker contract path.
2. Google popup selection, cancellation, resume, and partial failure.
3. Dropbox Chooser selection, direct import, expiry, and retry.
4. Batch edit, warning acknowledgement, quote, mixed cart, delivery, pickup, system payment, and Admin visibility.
5. Guest confirmation, account creation, captured transfer message, one-time claim, and order history.
6. Worker/storage/Medusa/network failures with preserved assets and one recovery action.
7. Stale price, inventory conflict, branch incompatibility, and expired draft without data-loss claims.

- [ ] **Step 4: Add accessibility and layout assertions**

Verify keyboard-only source selection and editor use, popup focus restoration, focus movement to errors, upload/import progress announcements, non-color status, labels and descriptions, disabled-branch reasons, reduced-motion behavior, 200 percent zoom, 320px width, and no horizontal overflow.

Add dev dependency `@axe-core/playwright@4.10.2` and use it for automated checks, then record manual keyboard/screen-reader smoke results in the deployment runbook. Automated checks do not replace the manual evidence.

- [ ] **Step 5: Run the complete CI-equivalent gate and commit Task 7**

Run: `docker compose up -d --wait`

Run: `npm.cmd run db:migrate && npm.cmd run seed:medusa && npm.cmd run seed:medusa`

Run: `npm.cmd run check`

Run: `npm.cmd run test:integration --workspace @fotomax/medusa`

Run: `npm.cmd run e2e --workspace @fotomax/storefront`

Expected: all PASS with no external Google/Dropbox network use in CI.

```bash
git add apps .github docs package-lock.json
git commit -m "test: cover Phase 2 source and recovery flows"
```

---

### Task 8: Provision Provider Test Apps and Pass the Final Public Staging Gate

**Files:**
- Create: `scripts/verify-phase-2-staging.mjs`
- Modify: `docs/deployment/fotomax-phase-2-staging.md`
- Create: `docs/verification/fotomax-phase-2.md`

**Interfaces:**
- Consumes: the complete Phase 2 system and exact staging deployment URLs.
- Produces: approved provider configuration, live Google/Dropbox proof, final deployment IDs, security/retention evidence, and release decision.

- [ ] **Step 1: Stop for explicit provider-resource approval**

Implement the final verifier first and run it against the current Phase 2B URLs recorded in `docs/verification/fotomax-phase-2b.md`.

Run: `node scripts/verify-phase-2-staging.mjs`

Expected: FAIL on Google/Dropbox readiness and source-journey checks while preserving the passing Phase 2A/2B checks. This proves the release gate distinguishes an incomplete source deployment.

Present the exact external setup and current provider pricing/quotas before creating resources:

- Google Cloud test project, Photos Picker API, OAuth web client, exact Vercel callback URI, exact origins, Picker readonly scope, and designated test users.
- Dropbox scoped app with Chooser enabled, exact Vercel staging domain, and public app key.
- `PHOTO_PROVIDER_TOKEN_KEY` and OAuth client secret stored only in Medusa Cloud staging.
- `NEXT_PUBLIC_DROPBOX_APP_KEY` and provider feature flags stored in Vercel staging.
- No production users, production domains, real notification delivery, or broad photo-library scopes.

Do not create either app, credentials, or secrets until the user explicitly approves.

- [ ] **Step 2: Configure and deploy after approval**

Create the approved test apps, set exact redirect/domain allowlists, add test users, store secrets in the proper staging host, deploy Medusa migrations/API/worker, and deploy Vercel with source flags enabled. Capture Git commit, Medusa Cloud deployment ID, Vercel deployment ID, backend URL, storefront URL, and timestamp.

Verify `GET /health`, `GET /health/ready`, Admin health, worker heartbeat, private storage, and capture provider before customer journeys.

- [ ] **Step 3: Run deployment-specific automated checks**

`scripts/verify-phase-2-staging.mjs` must require explicit `STAGING_STOREFRONT_URL` and `STAGING_MEDUSA_URL`, refuse localhost, and verify:

1. Both locale home/catalog routes use live Medusa.
2. No fixture marker or test-adapter endpoint is available.
3. API readiness and worker heartbeat belong to the newest deployment version.
4. Retail guest delivery and pickup orders complete with system payment.
5. Private media is inaccessible without an owner/Admin signed action.
6. Captured notification and order transfer complete once.
7. Accelerated retention test deletes objects and records evidence.

Run: `node scripts/verify-phase-2-staging.mjs`

Expected: PASS against exact deployment URLs.

- [ ] **Step 4: Run live Google and Dropbox customer journeys**

Using designated test accounts and synthetic/non-personal images:

1. Import from Google Photos Picker, close/reload mid-flow, resume, and confirm provider credentials clear after private copy.
2. Import from Dropbox Chooser and confirm the direct link is discarded after private copy.
3. Combine those assets with a device upload, apply batch defaults and one per-photo override, acknowledge a quality warning, quote, and add to a mixed retail/photo cart.
4. Complete delivery, then a separate pickup order, and verify inventory reservation plus production manifest in Admin.
5. Request audited asset access, move production status, capture bilingual notifications, fulfill, and prove accelerated retention cleanup.

- [ ] **Step 5: Perform final visual, accessibility, and security review**

Inspect 1440x900, 768x1024, 375x812, and 320x568 in both locales. Confirm no overlap, overflow, blank media, stale progress, inaccessible controls, console/runtime errors, or source-specific dead ends. Complete keyboard and screen-reader smoke checks.

Review logs for request correlation and absence of cookies, tokens, direct links, signed URLs, filenames, or image bytes. Confirm S3 block-public-access, exact CORS, one-day incomplete-multipart abort, and least-privilege IAM policy.

- [ ] **Step 6: Record the release decision and commit Task 8**

Write `docs/verification/fotomax-phase-2.md` with commands, test counts, deployment IDs, URLs, provider test timestamps, screenshots, Admin/order IDs using non-sensitive test data, retention evidence IDs, known baseline issues, and a clear staging pass/fail decision.

```bash
git add scripts docs
git commit -m "docs: verify complete Fotomax Phase 2 staging"
```

---

## Phase 2C and Final Phase 2 Completion Gate

- [ ] All Phase 2A and Phase 2B checks still pass.
- [ ] Device, Google Photos, and Dropbox satisfy the same source-adapter contract.
- [ ] Provider selections are copied to private storage immediately and credentials are demonstrably erased.
- [ ] Google uses only the Picker readonly scope and no refresh token.
- [ ] iCloud is represented only through device/system picker copy.
- [ ] Captured bilingual notification events and one-time order transfer work.
- [ ] Readiness, worker heartbeat, queue age, metrics, rate limits, and redacted correlation logs are verified.
- [ ] Complete retail and photo journeys pass in `en` and `zh-HK` on desktop/mobile.
- [ ] Accessibility, cross-owner security, forged-price, replay, SSRF, CSRF, and retention checks pass.
- [ ] Exact newest Medusa Cloud and Vercel deployment IDs pass the final staging verifier.
- [ ] No runtime fixture or provider-test fallback is reachable in public staging.
- [ ] The final evidence document records a staging pass decision.
- [ ] The branch is clean after the final task commit.

## Implementation References

- [Google Photos Picker REST API](https://developers.google.com/photos/picker/reference/rest)
- [Google Photos Picker sessions](https://developers.google.com/photos/picker/guides/sessions)
- [Google Photos Picker media items](https://developers.google.com/photos/picker/guides/media-items)
- [Google Photos API authorization](https://developers.google.com/photos/overview/authorization)
- [Dropbox Chooser](https://www.dropbox.com/developers/chooser)
- [Apple Photos picker](https://developer.apple.com/documentation/photosui/photospicker)
