# Fotomax Modernization — Project Instructions

Bilingual (zh-HK default, en) Hong Kong photo-commerce storefront on MedusaJS.
npm-workspaces monorepo. Node >= 22.

## Workspaces

| Path | Package | Role |
|---|---|---|
| `apps/storefront` | `@fotomax/storefront` | Next.js 16 (App Router, React 19). Public site **and** the BFF under `app/api/`. |
| `apps/medusa` | `@fotomax/medusa` | MedusaJS 2.17.2 backend, custom modules, seeds. |
| `apps/cloudflare` | `@fotomax/cloudflare` | Worker that proxies to Medusa running in a Cloudflare Container. |
| `packages/shared` | `@fotomax/shared` | Locales, copy dictionary, catalog fixtures. |

## Build & Run

```bash
npm run setup:local   # docker compose up postgres+redis, migrate, seed
npm run dev           # storefront only
npm run dev:medusa    # backend only
npm run check         # typecheck && test && build  — the canonical gate
```

**The storefront build requires a running, reachable Medusa backend.** `app/[locale]/layout.tsx`
calls `getCatalogView()`, so every localized page hits Medusa during prerender. `npm run build`
on a cold checkout fails with `ECONNREFUSED`. Start Medusa and export the env below first —
this is what `.github/workflows/phase-2a.yml` does before `npm run check`.

Required storefront env: `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`,
`STOREFRONT_SESSION_SECRET` — see `apps/storefront/.env.example`.

## Medusa Admin

Served at `/app`; `/admin/*` is authenticated by the framework as a `user` actor.
No admin exists until you bootstrap one — nothing else in the pipeline creates it:

```bash
FOTOMAX_ADMIN_EMAIL=... FOTOMAX_ADMIN_PASSWORD=... npm run admin:create
```

On the Cloudflare Worker, `/app`, `/admin/*`, and `/auth/user/*` sit behind an
edge gate (`ADMIN_GATE_SECRET`, header `x-fotomax-admin-gate`) and return an
opaque 404 without it. The gate fails closed for admin paths only — store traffic
is never blocked by a missing secret.

## Testing

- Unit: `npm test` — Vitest per workspace + `node --test scripts/*.test.mjs`. No backend needed.
- Integration (needs Postgres): `npm run test:integration --workspace @fotomax/medusa`
- E2E (needs Medusa + storefront): `npm run e2e --workspace @fotomax/storefront`
- Naming: `*.test.ts` / `*.test.tsx` colocated beside source; `*.spec.ts` for Playwright and
  Medusa HTTP integration only. Vitest configs exclude `e2e/**`.
- Coverage is high and expected to stay that way — nearly every `src/` module has a sibling test.

## Code Style

- kebab-case filenames; named exports; 2-space indent; no semicolons.
- Server-only modules start with `import "server-only"` — keep that boundary intact.
- **Adapter + injected-SDK pattern.** Route handlers stay thin; logic lives in
  `src/lib/medusa/*.ts` behind `createXAdapter(sdk)`. This is why unit tests run with no backend —
  preserve it when adding endpoints.
- **Typed error codes, never raw errors.** Throw `CartError` / `CheckoutError` carrying a string
  `code`; the route handler maps code → HTTP status and responds `{ error: { code } }`.
  Never leak Medusa internals or stack traces to the client.
- Validate request bodies with a `parseXInput()` that returns typed input or throws a typed error.
- Money is HKD **minor units** (integer cents). Do not introduce floats.
- Bilingual copy belongs in `packages/shared/src/i18n.ts`; keep en and zh-HK adjacent.

## Request Lifecycle

```
browser → app/api/<route>/route.ts        (cookies: fm_cart_id, fm_customer_token)
        → src/lib/medusa/<domain>.ts      (adapter: validate, map, typed errors)
        → @medusajs/js-sdk                (publishable key + optional JWT)
        → Medusa backend                  (Cloudflare Worker → Container in staging)
```

## Conventions

- Commits: Conventional Commits — `fix:`, `feat:`, `docs:`, `test:`, `chore:`. Imperative, lowercase.
- Branches: `codex/fotomax-<topic>`. Work lands on `codex/fotomax-foundation` via PR.
  `main` is stale (3 commits) — do not target it.
- This repo is a **fork of medusajs/medusa** carrying ~2000 upstream branches. Only
  `codex/fotomax-*` refs are ours. Never push to or branch from upstream refs.
- Plans/specs live in `docs/superpowers/`; verification evidence in `docs/verification/`.

## Gotchas

- `apps/medusa/src/runtime-env.ts` falls back to insecure local defaults (JWT/cookie secrets,
  permissive CORS) whenever `NODE_ENV` is unset, `development`, or `test`. Production must set
  `NODE_ENV=production` or it boots with known secrets. `DISABLE_MEDUSA_ADMIN` is the exception —
  it is required and must be exactly `true`/`false` outside local dev.
- Medusa is invoked via `node ./medusa-cli.cjs`, not the `medusa` binary, everywhere except the
  container image. The image contains only `.medusa/server`, so seeds and `admin:create` run from
  a workstation against the same database.
- There is **no automatic migration on deploy**. Run `npm run db:migrate` before shipping code
  that needs a new column.
- The catalog has no seed-data fallback: if Medusa is down, every localized route throws and
  `app/global-error.tsx` renders. This is deliberate — see the Phase 1 spec amendment.
- Logging in calls Medusa `transferCart`, which permanently binds the cart to that customer.
  Anything that ends a session must clear `fm_cart_id` too (`clearSessionCookies`).
