# Fotomax Storefront SDD Progress

Branch: codex/fotomax-storefront
Plan: docs/superpowers/plans/2026-07-10-fotomax-commerce-storefront-foundation.md

Task 1: complete (commits 1da7f98..56b0032, review clean)
Task 2: complete (commits 56b0032..7532ff2, review clean)
Task 3: complete (commits 783e163..bc1f6b2, review clean; browser-wide checks scheduled for Task 8; prior not-found import debt resolved in Task 6)
Task 4: complete (commits 8868fe7..5cfbfc4, review clean; desktop/mobile browser evidence scheduled for Task 8)
Task 5: complete (commits e94b430, 31bab0c, cbdff57; review clean; browser focus/geometry scheduled for Task 8; shared customer-copy correction 6dbbf10 review clean)
Task 6: complete (commits adbc520, 207f7e9, 6345edf; review clean; live clicks, focus movement, and overlay geometry scheduled for Task 8)
Task 7: complete (commits 0f94a5b, 553e16f, 3381d37, 4da338f; review clean; backend/Admin build and 18 tests pass; live seed reaches expected local DB refusal; audit residual 0 critical, 8 high, 93 moderate)
Task 8: complete (commits 1c96792, 890b1b0, e2de025; final-review continuation adds SSR language coverage, empty-state recovery, strict workflow seed DTOs, and root Medusa/Admin build coverage; 86 unit tests, 18 Playwright journeys, clean-start server ownership, and both production builds pass)

## Phase 2B Upload Foundation

Branch: `codex/fotomax-phase-2b-upload-foundation`
Plan: `docs/superpowers/plans/2026-07-18-fotomax-phase-2b-upload-foundation.md`

Task 1: complete (commits `c9e1774`, `8127dee`, `8521c94`, `faf7d90`; photo domain and exhaustive transition coverage)
Task 2: complete (commits `5697653`..`e936f25`; secure guest/customer ownership and review hardening)
Task 3: complete (commits `3ab1680`, `4afbfc5`; private storage and checksum binding)
Task 4: complete (commits `aba2c11`..`7d070b9`; resumable multipart API and lifecycle hardening, independent review approved)
Task 5: complete (commits `c441a09`..`68ef45a`; bilingual upload workspace, reload recovery, durable removal, no-store responses, independent review approved)
Task 6: complete (cleanup job, real-service integration specification, mocked desktop/mobile E2E, production compile, verification evidence, and independent-review fixes for cleanup fairness, active cancellation, and scoped idempotency; real-service execution unavailable because Docker/PostgreSQL/Redis/MinIO were not running)

## Phase 2B Photo Production

Branches: `codex/fotomax-phase-2b-image-processing`, `codex/fotomax-phase-2b-versions-quotes`
Plan: `docs/superpowers/plans/2026-07-11-fotomax-phase-2b-photo-production.md`

Task 5: complete (`31ed286` plus review hardening; private image processing, transient retry/dead-letter handling, concurrency-safe state updates, encrypted previews, audited admin retry, 499 unit tests, and both typechecks pass; live PostgreSQL/Redis/S3 smoke test remains environment-blocked)

Task 6: complete (immutable print versions, normalized crop/override and quality acknowledgement rules, optimistic revision/idempotency handling, live HKD variant pricing, atomic 15-minute quotes, deterministic manifests, price-change replacement versions, owner-scoped Store APIs, and same-origin BFF routes; 320 Medusa and 213 storefront tests plus both typechecks pass; live migration generation/execution remains infrastructure-blocked)

Task 7: complete (batch-first responsive photo editor, active-version recovery, processor polling, serialized 750 ms autosave, conflict/retry handling, safe asset/version projection, quote review, 243 storefront and 324 Medusa tests, both typechecks and production build pass; desktop/mobile visual checks clean)

Task 8: complete (grouped quoted photo versions attach to locked Medusa carts with live price/capability validation; explicit cart/order/order-line links, checkout validation, immutable order freeze, cancellation retention, same-origin storefront BFF, grouped drawer/cart UI, and delegated group removal; review fixed generated relation keys, cancellation event spelling, retry-safe link creation, typed conflicts, and GraphQL-safe fixed-4R schema; 348 Medusa and 247 storefront tests, both typechecks, and both production builds pass)

Task 9: complete (dense Medusa Admin production and branch operations; URL-free manifests, guarded status transitions, transient dead-letter retry, reasoned five-minute original access with audit records, stock-location capability links, staging-only accelerated retention action, fulfillment expiry, hourly locked and verified object deletion, and evidence-only retained records; exact 14-test Task 9 suite, full 367-test Medusa suite, Medusa typecheck, backend build, Admin build, compiled labels, and all nine Admin route artifacts pass; live PostgreSQL/Redis/S3 execution remains scheduled for Task 10)
