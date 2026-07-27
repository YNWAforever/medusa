# Fotomax Medusa Backend

This app is the Medusa boundary for the Fotomax storefront foundation.

## Local Commands

- `npm run dev --workspace @fotomax/medusa` starts Medusa at `http://localhost:9000`.
- `npm run test --workspace @fotomax/medusa` validates the generated Fotomax payload without PostgreSQL.
- `npm run typecheck --workspace @fotomax/medusa` checks the backend config and seed script.
- `npm run build --workspace @fotomax/medusa` compiles the Medusa application skeleton.
- `npm run seed --workspace @fotomax/medusa` starts Medusa and writes the Fotomax reference data to the configured database.
- `npm run create-admin --workspace @fotomax/medusa` creates the initial Medusa Admin operator (see below).

The seed command executes Medusa's region, collection, and product creation workflows. It requires a reachable PostgreSQL database and the Medusa environment below. Shared product options are expanded into priced variants, and products are linked to the collection IDs returned by Medusa. It also owns the stock locations, pickup branches, shipping options, and the storefront publishable key. Phase 1 service entries are deliberately excluded because they do not yet have a Medusa model.

The seed reconciles: it is safe to re-run against an already-seeded database, and CI deliberately runs it twice to prove that. Passing payload tests prove DTO construction and workflow ordering; they do not prove that a database write completed.

## Medusa Admin

The dashboard is served by this app at `/app`, and `/admin/*` is authenticated by
the framework as a `user` actor. Nothing creates that user automatically, so a
fresh database has no way to sign in until you bootstrap one:

```bash
FOTOMAX_ADMIN_EMAIL=ops@example.com FOTOMAX_ADMIN_PASSWORD='<strong-password>' npm run admin:create
```

Credentials are read from the environment rather than argv so they stay out of
shell history and the process list. The script is safe to re-run — an existing
user is reported and left untouched.

`DISABLE_MEDUSA_ADMIN` must be exactly `true` or `false`, and it is **required**
outside local development; a missing value used to mean "enabled", which silently
exposed the dashboard. On the Cloudflare staging Worker the dashboard, `/admin/*`,
and `/auth/user/*` additionally sit behind an edge gate — see
`docs/deployment/fotomax-phase-2-staging.md`.

## Required Local Environment

Create `apps/medusa/.env` with local development values:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fotomax_medusa
STORE_CORS=http://localhost:3000,http://localhost:8000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000,http://localhost:3000,http://localhost:8000
JWT_SECRET=fotomax-local-jwt-secret
COOKIE_SECRET=fotomax-local-cookie-secret
```

The runtime resolver's fallback JWT and cookie secrets are local-only conveniences. Non-local startup requires strong environment-provided secrets as described below. This skeleton is not production-ready and does not provision a database or rotate secrets.

## Runtime Configuration Policy

Localhost CORS values and the fallback JWT/cookie secrets are available only when `NODE_ENV` is unset, `development`, or `test`. Explicit non-empty values still override those defaults locally.

For every other environment name, including `preview`, `staging`, and `production`, startup fails immediately unless all of these variables contain non-whitespace values:

- `STORE_CORS`
- `ADMIN_CORS`
- `AUTH_CORS`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `DISABLE_MEDUSA_ADMIN` (must be `true` or `false`)

This prevents local credentials or localhost origins from silently reaching a deployed environment.

Medusa CLI execution initializes the application and the seed performs database writes, so it requires a reachable PostgreSQL database. The payload and workflow tests remain the database-independent validation path; a local connection-refusal probe is not persistence evidence.

Use the workspace npm scripts instead of invoking `medusa` directly. The scripts use the app-owned `medusa-cli.cjs` launcher so the hoisted CLI can resolve this workspace's TypeScript tooling in the monorepo.
