# Fotomax Medusa Backend

This app is the Medusa boundary for the Fotomax storefront foundation.

## Local Commands

- `npm run dev --workspace @fotomax/medusa` starts Medusa at `http://localhost:9000`.
- `npm run test --workspace @fotomax/medusa` validates the generated Fotomax payload without PostgreSQL.
- `npm run typecheck --workspace @fotomax/medusa` checks the backend config and seed script.
- `npm run build --workspace @fotomax/medusa` compiles the Medusa application skeleton.
- `npm run seed --workspace @fotomax/medusa` starts Medusa and writes the Fotomax region, collections, and products to the configured database.

The seed command executes Medusa's region, collection, and product creation workflows. It requires a reachable PostgreSQL database and the Medusa environment below. Shared product options are expanded into priced variants, and products are linked to the collection IDs returned by Medusa. Phase 1 service entries are deliberately excluded because they do not yet have a Medusa model.

The seed is not idempotent. Re-running it against an already-seeded database may create duplicates or fail on conflicting handles or SKUs. Until an explicit repeat-run strategy is implemented, run it only against the intended empty or disposable local database. Passing payload tests proves DTO construction and workflow ordering; it does not prove that a database write completed.

## Required Local Environment

Create `apps/medusa/.env` with local development values:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fotomax_medusa
STORE_CORS=http://localhost:3000,http://localhost:8000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000,http://localhost:3000,http://localhost:8000
JWT_SECRET=fotomax-local-jwt-secret
COOKIE_SECRET=fotomax-local-cookie-secret
MEDUSA_STOREFRONT_URL=http://localhost:3000
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
- `MEDUSA_STOREFRONT_URL`

The Admin storefront URL is compiled into the Medusa Admin bundle through admin.storefrontUrl. Rebuild the Admin bundle after changing MEDUSA_STOREFRONT_URL; changing the runtime variable alone does not change an already-built Admin asset.

This prevents local credentials or localhost origins from silently reaching a deployed environment.

Medusa CLI execution initializes the application and the seed performs database writes, so it requires a reachable PostgreSQL database. The payload and workflow tests remain the database-independent validation path; a local connection-refusal probe is not persistence evidence.

Use the workspace npm scripts instead of invoking `medusa` directly. The scripts use the app-owned `medusa-cli.cjs` launcher so the hoisted CLI can resolve this workspace's TypeScript tooling in the monorepo.
