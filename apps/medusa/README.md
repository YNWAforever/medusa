# Fotomax Medusa Backend

This app is the Medusa boundary for the Fotomax storefront foundation.

## Local Commands

- `npm run dev --workspace @fotomax/medusa` starts Medusa at `http://localhost:9000`.
- `npm run test --workspace @fotomax/medusa` validates the generated Fotomax payload without PostgreSQL.
- `npm run typecheck --workspace @fotomax/medusa` checks the backend config and seed script.
- `npm run build --workspace @fotomax/medusa` compiles the Medusa application skeleton.
- `npm run seed --workspace @fotomax/medusa` starts the Medusa runtime, prepares the payload, and logs its record counts.

The seed command currently prepares data for inspection only. It does not insert collections, products, regions, or services into PostgreSQL. A live database import workflow remains deferred; a successful payload test or seed log must not be treated as proof that catalog records were persisted.

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

This prevents local credentials or localhost origins from silently reaching a deployed environment.

Medusa CLI execution initializes the application and therefore requires a reachable PostgreSQL database even though this Phase 1 script only prepares the payload. The payload test remains the database-independent validation path.

Use the workspace npm scripts instead of invoking `medusa` directly. The scripts use the app-owned `medusa-cli.cjs` launcher so the hoisted CLI can resolve this workspace's TypeScript tooling in the monorepo.
