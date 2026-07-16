# Fotomax Cloudflare MVP Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing Fotomax Medusa API, Admin, and shared background worker through a Cloudflare Worker and Container while retaining Vercel for the storefront and using Neon PostgreSQL plus Upstash Redis for staging persistence.

**Architecture:** A repository-owned Cloudflare Worker forwards every request to one stable APAC Cloudflare Container instance. The container runs the current Medusa production build on port 9000 with the shared worker mode; Neon and Upstash remain external managed data services. The Worker owns request IDs and a controlled `503` contract only, while Vercel continues to serve the Next.js storefront.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript 5.8, Vitest 4, Wrangler 4, `@cloudflare/containers`, Docker, Medusa 2.17, Neon PostgreSQL, Upstash Redis, Vercel, GitHub Actions.

## Global Constraints

- Work only in `C:\Users\laich\Documents\fotomax\.worktrees\fotomax-storefront` on branch `codex/fotomax-storefront`.
- Do not edit or stage `.superpowers/sdd/progress.md`; it contains unrelated operator state.
- Keep the public environment staging-only. Do not enable real payments, transactional email, production inventory, or a production domain.
- Cloudflare Workers Paid at USD 5/month base plus usage is approved. Do not provision Neon or Upstash, create deployment secrets, enable paid add-ons, or upgrade the Cloudflare Container size without a separate explicit approval.
- Never write the pasted Cloudflare token or Upstash Box key to a file, command argument, log, commit, or final response. Treat both as exposed, use process-local input only where applicable, and rotate both after deployment. The Upstash Box key is not a Redis credential and must not be used by Medusa.
- Use interactive `wrangler secret put` or standard input for secret values. Tracked files may contain variable names and non-secret local examples only.
- Follow TDD for every behavior change: write the focused failing test, run it and see the expected failure, implement the minimum behavior, rerun the focused test, then run the broader gate.
- Use `apply_patch` for edits. If Windows ACLs block patching an existing file, use a guarded PowerShell `ReadAllText`/`WriteAllText` replacement only after confirming the expected original text is present.
- Commit after each task and stage only the files named by that task.

## File Map

**Create**

- `apps/cloudflare/package.json` - workspace scripts and pinned Cloudflare dependencies.
- `apps/cloudflare/tsconfig.json` - Worker TypeScript settings.
- `apps/cloudflare/vitest.config.ts` - Node-based unit-test configuration for pure Worker helpers.
- `apps/cloudflare/wrangler.jsonc` - Worker, Container, Durable Object, APAC placement, and observability configuration.
- `apps/cloudflare/.dev.vars.example` - safe local variable names and dummy values.
- `apps/cloudflare/src/runtime.ts` - validated secret-to-container environment mapping.
- `apps/cloudflare/src/runtime.test.ts` - runtime contract tests.
- `apps/cloudflare/src/proxy.ts` - request-ID and unavailable-response proxy logic.
- `apps/cloudflare/src/proxy.test.ts` - proxy contract tests.
- `apps/cloudflare/src/index.ts` - Cloudflare Container class and Worker entry point.
- `Dockerfile` - multi-stage Medusa image.
- `.dockerignore` - minimal build context and secret exclusions.
- `apps/medusa/src/container-runtime.test.ts` - image start-script contract test.
- `scripts/staging-health.mjs` - retrying Medusa readiness helper.
- `scripts/staging-health.test.mjs` - readiness helper tests.

**Modify**

- `package.json` - Node 22 requirement, script-test coverage, Cloudflare build/deploy commands.
- `package-lock.json` - locked Cloudflare workspace dependencies.
- `.gitignore` - ignore local Worker variables while keeping the example.
- `apps/medusa/package.json` - explicit container start command.
- `scripts/verify-phase-2a-staging.mjs` - wait through container startup before the deployment checks.
- `.github/workflows/phase-2a.yml` - Node 22 and deterministic container-image build.
- `docs/deployment/fotomax-phase-2-staging.md` - complete Cloudflare/Neon/Upstash/Vercel runbook.
- `docs/verification/fotomax-phase-2a.md` - record the new pre-deploy and live evidence.

---

### Task 1: Add the Cloudflare Workspace and Runtime Contract

**Files:**
- Create: `apps/cloudflare/package.json`
- Create: `apps/cloudflare/tsconfig.json`
- Create: `apps/cloudflare/vitest.config.ts`
- Create: `apps/cloudflare/.dev.vars.example`
- Create: `apps/cloudflare/src/runtime.test.ts`
- Create: `apps/cloudflare/src/runtime.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Raise the repository runtime floor and scaffold the workspace**

In root `package.json`, change `engines.node` to `>=22`, append the Cloudflare workspace to the root build, and add script-test and Cloudflare operator commands:

```json
{
  "scripts": {
    "test": "npm run test --workspaces --if-present && npm run test:scripts",
    "test:scripts": "node --test scripts/*.test.mjs",
    "build": "npm run build --workspace @fotomax/storefront && npm run build --workspace @fotomax/medusa && npm run build --workspace @fotomax/cloudflare",
    "cloudflare:whoami": "npm run whoami --workspace @fotomax/cloudflare",
    "cloudflare:container:build": "npm run container:build --workspace @fotomax/cloudflare",
    "cloudflare:deploy": "npm run deploy --workspace @fotomax/cloudflare"
  },
  "engines": {
    "node": ">=22"
  }
}
```

Preserve all existing scripts not shown above.

Create `apps/cloudflare/package.json`:

```json
{
  "name": "@fotomax/cloudflare",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "whoami": "wrangler whoami",
    "secret:put": "wrangler secret put",
    "container:build": "wrangler containers build ../.. --tag fotomax-medusa:ci",
    "container:list": "wrangler containers list"
  },
  "dependencies": {
    "@cloudflare/containers": "0.3.7"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "5.20260713.1",
    "typescript": "5.8.3",
    "vitest": "4.1.10",
    "wrangler": "4.110.0"
  }
}
```

Create `apps/cloudflare/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

Create `apps/cloudflare/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
```

Run:

```powershell
npm.cmd install
```

Expected: `package-lock.json` records the new workspace and exact versions; npm reports no engine warning under Node 22.

- [ ] **Step 2: Write failing runtime-contract tests**

Create `apps/cloudflare/src/runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildContainerEnv, type RuntimeSecrets } from "./runtime"

const secrets: RuntimeSecrets = {
  DATABASE_URL: "postgres://staging-db",
  REDIS_URL: "rediss://staging-redis",
  STORE_CORS: "https://staging.fotomax.example",
  ADMIN_CORS: "https://fotomax-medusa.example.workers.dev",
  AUTH_CORS:
    "https://staging.fotomax.example,https://fotomax-medusa.example.workers.dev",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
}

describe("buildContainerEnv", () => {
  it("maps validated secrets and fixed Medusa settings", () => {
    expect(buildContainerEnv(secrets)).toEqual({
      ...secrets,
      NODE_ENV: "production",
      PORT: "9000",
      MEDUSA_WORKER_MODE: "shared",
      DISABLE_MEDUSA_ADMIN: "false",
    })
  })

  it.each(Object.keys(secrets) as Array<keyof RuntimeSecrets>)(
    "rejects a blank %s without exposing its value",
    (name) => {
      expect(() =>
        buildContainerEnv({ ...secrets, [name]: "   " }),
      ).toThrow(`Missing Cloudflare secret: ${name}`)
    },
  )
})
```

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- --run src/runtime.test.ts
```

Expected: FAIL because `src/runtime.ts` does not exist.

- [ ] **Step 3: Implement the validated container environment**

Create `apps/cloudflare/src/runtime.ts`:

```ts
const secretNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
] as const

type SecretName = (typeof secretNames)[number]

export type RuntimeSecrets = Record<SecretName, string>

export function buildContainerEnv(source: RuntimeSecrets): Record<string, string> {
  const secrets = Object.fromEntries(
    secretNames.map((name) => {
      const value = source[name]?.trim()

      if (!value) {
        throw new Error(`Missing Cloudflare secret: ${name}`)
      }

      return [name, value]
    }),
  ) as RuntimeSecrets

  return {
    ...secrets,
    NODE_ENV: "production",
    PORT: "9000",
    MEDUSA_WORKER_MODE: "shared",
    DISABLE_MEDUSA_ADMIN: "false",
  }
}
```

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- --run src/runtime.test.ts
npm.cmd run typecheck --workspace @fotomax/cloudflare
```

Expected: both commands pass.

- [ ] **Step 4: Add local secret hygiene**

Append to `.gitignore`:

```gitignore
# Cloudflare local secrets
.dev.vars*
!.dev.vars.example
```

Create `apps/cloudflare/.dev.vars.example` with local-only dummy values:

```dotenv
DATABASE_URL=postgres://fotomax:local-only@127.0.0.1:5432/fotomax
REDIS_URL=redis://127.0.0.1:6379
STORE_CORS=http://127.0.0.1:3000
ADMIN_CORS=http://127.0.0.1:8787
AUTH_CORS=http://127.0.0.1:3000,http://127.0.0.1:8787
JWT_SECRET=local-only-jwt
COOKIE_SECRET=local-only-cookie
```

Run:

```powershell
git check-ignore apps/cloudflare/.dev.vars
git check-ignore -v apps/cloudflare/.dev.vars.example
git diff --check
```

Expected: the first command identifies `.dev.vars` as ignored; the example is not ignored; the diff check passes.

- [ ] **Step 5: Commit Task 1**

```powershell
git add package.json package-lock.json .gitignore apps/cloudflare/package.json apps/cloudflare/tsconfig.json apps/cloudflare/vitest.config.ts apps/cloudflare/.dev.vars.example apps/cloudflare/src/runtime.ts apps/cloudflare/src/runtime.test.ts
git commit -m "feat: add Cloudflare runtime workspace"
```

Expected: commit succeeds and `.superpowers/sdd/progress.md` remains unstaged.

---

### Task 2: Implement the Thin Worker Proxy and Container Binding

**Files:**
- Create: `apps/cloudflare/src/proxy.test.ts`
- Create: `apps/cloudflare/src/proxy.ts`
- Create: `apps/cloudflare/src/index.ts`
- Create: `apps/cloudflare/wrangler.jsonc`

- [ ] **Step 1: Write failing proxy-contract tests**

Create `apps/cloudflare/src/proxy.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { proxyToMedusa } from "./proxy"

describe("proxyToMedusa", () => {
  it("forwards method, URL, body, and a generated request ID", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST")
      expect(request.url).toBe("https://api.example/store/carts")
      expect(await request.text()).toBe('{"region_id":"reg_1"}')
      expect(request.headers.get("x-request-id")).toBe("request-123")
      return Response.json({ id: "cart_1" }, { status: 201 })
    })

    const response = await proxyToMedusa(
      new Request("https://api.example/store/carts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"region_id":"reg_1"}',
      }),
      () => ({ fetch }),
      () => "request-123",
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("request-123")
    expect(await response.json()).toEqual({ id: "cart_1" })
  })

  it("preserves an incoming request ID", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get("x-request-id")).toBe("client-request")
      return new Response(null, { status: 204 })
    })

    const response = await proxyToMedusa(
      new Request("https://api.example/health", {
        headers: { "x-request-id": "client-request" },
      }),
      () => ({ fetch }),
    )

    expect(response.headers.get("x-request-id")).toBe("client-request")
  })

  it("returns a stable secret-free 503 when the container is unavailable", async () => {
    const response = await proxyToMedusa(
      new Request("https://api.example/store/products"),
      () => ({
        fetch: async () => {
          throw new Error("redis-password-must-not-leak")
        },
      }),
      () => "request-503",
      () => {},
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("request-503")
    expect(await response.json()).toEqual({
      code: "MEDUSA_UNAVAILABLE",
      request_id: "request-503",
    })
  })

  it("logs only safe request metadata without query strings or headers", async () => {
    const logEvent = vi.fn()
    const times = [100, 125]

    await proxyToMedusa(
      new Request("https://api.example/store/products?token=must-not-log", {
        headers: { authorization: "must-not-log" },
      }),
      () => ({ fetch: async () => new Response(null, { status: 204 }) }),
      () => "request-log",
      logEvent,
      () => times.shift() ?? 125,
    )

    expect(logEvent).toHaveBeenCalledWith({
      request_id: "request-log",
      method: "GET",
      pathname: "/store/products",
      status: 204,
      duration_ms: 25,
    })
  })
})
```

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- --run src/proxy.test.ts
```

Expected: FAIL because `src/proxy.ts` does not exist.

- [ ] **Step 2: Implement the proxy behavior**

Create `apps/cloudflare/src/proxy.ts`:

```ts
export interface ContainerStub {
  fetch(request: Request): Promise<Response>
}

export type ResolveContainer = () => ContainerStub

export interface ProxyLogEvent {
  request_id: string
  method: string
  pathname: string
  status: number
  duration_ms: number
}

export async function proxyToMedusa(
  request: Request,
  resolveContainer: ResolveContainer,
  createRequestId: () => string = () => crypto.randomUUID(),
  logEvent: (event: ProxyLogEvent) => void = (event) =>
    console.log("medusa_proxy_request", event),
  now: () => number = () => Date.now(),
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.trim() || createRequestId()
  const startedAt = now()
  const requestUrl = new URL(request.url)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)

  try {
    const response = await resolveContainer().fetch(
      new Request(request, { headers: requestHeaders }),
    )
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set("x-request-id", requestId)
    logEvent({
      request_id: requestId,
      method: request.method,
      pathname: requestUrl.pathname,
      status: response.status,
      duration_ms: now() - startedAt,
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch {
    logEvent({
      request_id: requestId,
      method: request.method,
      pathname: requestUrl.pathname,
      status: 503,
      duration_ms: now() - startedAt,
    })
    return Response.json(
      { code: "MEDUSA_UNAVAILABLE", request_id: requestId },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    )
  }
}
```

Run:

```powershell
npm.cmd test --workspace @fotomax/cloudflare -- --run src/proxy.test.ts
```

Expected: four tests pass.

- [ ] **Step 3: Define the Container class and stable staging identity**

Create `apps/cloudflare/src/index.ts`:

```ts
import { Container, getContainer } from "@cloudflare/containers"
import { env as workerEnv } from "cloudflare:workers"

import { proxyToMedusa } from "./proxy"
import { buildContainerEnv, type RuntimeSecrets } from "./runtime"

export type CloudflareBindings = RuntimeSecrets & {
  FOTOMAX_MEDUSA: DurableObjectNamespace
}

const runtimeEnv = workerEnv as unknown as RuntimeSecrets

export class FotomaxMedusaContainer extends Container {
  defaultPort = 9000
  sleepAfter = "10m"
  enableInternet = true
  envVars = buildContainerEnv(runtimeEnv)

  override onStart(): void {
    console.log("medusa_container_started")
  }

  override onStop(stopParams: { exitCode: number; reason: string }): void {
    console.log("medusa_container_stopped", stopParams)
  }

  override onError(error: unknown): void {
    console.error("medusa_container_error", {
      error_type: error instanceof Error ? error.name : typeof error,
    })
  }
}

export default {
  fetch(request: Request, env: CloudflareBindings): Promise<Response> {
    return proxyToMedusa(request, () =>
      getContainer(env.FOTOMAX_MEDUSA, "fotomax-medusa-staging"),
    )
  },
} satisfies ExportedHandler<CloudflareBindings>
```

If the installed `@cloudflare/containers` type declarations use a narrower lifecycle callback signature, conform to that exact declaration without changing the observable log event names or including secret/request data.

- [ ] **Step 4: Add the Wrangler configuration**

Create `apps/cloudflare/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "fotomax-medusa-staging",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-13",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true
  },
  "containers": [
    {
      "class_name": "FotomaxMedusaContainer",
      "image": "../../Dockerfile",
      "max_instances": 1,
      "instance_type": "basic",
      "constraints": {
        "regions": ["APAC"]
      }
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "FOTOMAX_MEDUSA",
        "class_name": "FotomaxMedusaContainer"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["FotomaxMedusaContainer"]
    }
  ],
  "dev": {
    "port": 8787,
    "enable_containers": false
  }
}
```

The `basic` instance, one-instance cap, APAC constraint, and 10-minute sleep policy are budget controls. Do not silently upgrade them.

- [ ] **Step 5: Verify and commit Task 2**

```powershell
npm.cmd run typecheck --workspace @fotomax/cloudflare
npm.cmd test --workspace @fotomax/cloudflare
npm.cmd exec --workspace @fotomax/cloudflare wrangler -- deploy --dry-run
git diff --check
git add apps/cloudflare/src/proxy.ts apps/cloudflare/src/proxy.test.ts apps/cloudflare/src/index.ts apps/cloudflare/wrangler.jsonc
git commit -m "feat: proxy Medusa through Cloudflare"
```

Expected: tests and typecheck pass; Wrangler validates and bundles the Worker without deploying or requiring secrets; commit succeeds.

---

### Task 3: Build a Production Medusa Container Image

**Files:**
- Create: `apps/medusa/src/container-runtime.test.ts`
- Modify: `apps/medusa/package.json`
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write the failing container start-contract test**

Create `apps/medusa/src/container-runtime.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

describe("Medusa container runtime", () => {
  it("binds the production server to every container interface on port 9000", () => {
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url))
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts["start:container"]).toBe(
      "medusa start --host 0.0.0.0 --port 9000",
    )
  })
})
```

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- --run src/container-runtime.test.ts
```

Expected: FAIL because `start:container` is undefined.

- [ ] **Step 2: Add the explicit container start command**

Add to `apps/medusa/package.json` scripts:

```json
"start:container": "medusa start --host 0.0.0.0 --port 9000"
```

Run:

```powershell
npm.cmd test --workspace @fotomax/medusa -- --run src/container-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add the multi-stage Docker image**

Create root `Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS build

WORKDIR /server

COPY package.json package-lock.json ./
COPY apps/medusa/package.json apps/medusa/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @fotomax/medusa --include-workspace-root

COPY tsconfig.base.json ./
COPY apps/medusa apps/medusa
COPY packages/shared packages/shared
RUN npm run build --workspace @fotomax/medusa

RUN mkdir -p /server/apps/medusa/packages \
  && cp -R /server/packages/shared /server/apps/medusa/packages/shared

WORKDIR /server/apps/medusa/.medusa/server
RUN npm install --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /server

COPY --from=build /server/apps/medusa/.medusa/server ./

EXPOSE 9000
CMD ["npm", "run", "start:container"]
```

Create root `.dockerignore`:

```dockerignore
.git
.worktrees
.superpowers
node_modules
**/node_modules
**/.next
**/.medusa
coverage
test-results
playwright-report
.env
.env.*
!**/.env.example
npm-debug.log*
```

- [ ] **Step 4: Build and smoke-test the image locally**

Start the existing local PostgreSQL and Redis services, then run:

```powershell
npm.cmd run infra:up
npm.cmd run db:migrate
npm.cmd run seed:medusa
npm.cmd run cloudflare:container:build
docker run --rm -d --name fotomax-medusa-container -p 9001:9000 `
  -e DATABASE_URL=postgres://fotomax:fotomax_local_only@host.docker.internal:5432/fotomax `
  -e REDIS_URL=redis://host.docker.internal:6379 `
  -e STORE_CORS=http://127.0.0.1:3100 `
  -e ADMIN_CORS=http://127.0.0.1:9001 `
  -e AUTH_CORS=http://127.0.0.1:3100,http://127.0.0.1:9001 `
  -e JWT_SECRET=fotomax-container-local-jwt `
  -e COOKIE_SECRET=fotomax-container-local-cookie `
  -e MEDUSA_WORKER_MODE=shared `
  fotomax-medusa:ci
```

Poll readiness without assuming an instant start:

```powershell
1..30 | ForEach-Object {
  try {
    $response = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9001/health
    if ($response.StatusCode -eq 200) { return }
  } catch {}
  Start-Sleep -Seconds 2
}
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9001/health
docker logs fotomax-medusa-container
docker stop fotomax-medusa-container
```

Expected: the final health request returns `200`; logs show normal startup and no missing package or Redis module errors. Ensure the container is stopped even if the smoke test fails. If Docker is unavailable locally, do not claim this step passed; use Task 5 CI evidence before deployment.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/medusa/package.json apps/medusa/src/container-runtime.test.ts Dockerfile .dockerignore
git commit -m "feat: package Medusa for Cloudflare Containers"
```

Expected: commit succeeds and the SDD progress file remains unstaged.

---

### Task 4: Make Staging Verification Cold-Start Aware

**Files:**
- Create: `scripts/staging-health.test.mjs`
- Create: `scripts/staging-health.mjs`
- Modify: `scripts/verify-phase-2a-staging.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing readiness-retry tests**

Create `scripts/staging-health.test.mjs`:

```js
import assert from "node:assert/strict"
import test from "node:test"

import { waitForHealthyBackend } from "./staging-health.mjs"

test("returns immediately when Medusa is healthy", async () => {
  const calls = []
  const result = await waitForHealthyBackend("https://api.example", {
    fetchImpl: async (url) => {
      calls.push(url)
      return new Response("OK", { status: 200 })
    },
    sleep: async () => {},
  })

  assert.deepEqual(result, { attempt: 1, status: 200 })
  assert.deepEqual(calls, ["https://api.example/health"])
})

test("retries a container 503 and then succeeds", async () => {
  const statuses = [503, 503, 200]
  const sleeps = []
  const result = await waitForHealthyBackend("https://api.example/", {
    attempts: 3,
    delayMs: 25,
    fetchImpl: async () => new Response(null, { status: statuses.shift() }),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.deepEqual(result, { attempt: 3, status: 200 })
  assert.deepEqual(sleeps, [25, 25])
})

test("reports the final status after exhausting attempts", async () => {
  await assert.rejects(
    waitForHealthyBackend("https://api.example", {
      attempts: 2,
      delayMs: 0,
      fetchImpl: async () => new Response(null, { status: 503 }),
      sleep: async () => {},
    }),
    /Medusa health check failed after 2 attempts: GET \/health returned 503/,
  )
})
```

Run:

```powershell
npm.cmd run test:scripts
```

Expected: FAIL because `scripts/staging-health.mjs` does not exist.

- [ ] **Step 2: Implement the readiness helper**

Create `scripts/staging-health.mjs`:

```js
const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function waitForHealthyBackend(
  baseUrl,
  {
    fetchImpl = fetch,
    attempts = 30,
    delayMs = 2_000,
    sleep = defaultSleep,
  } = {},
) {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`
  let lastError = new Error("health check did not run")

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(healthUrl, {
        headers: { accept: "text/plain" },
      })

      if (response.ok) {
        return { attempt, status: response.status }
      }

      lastError = new Error(`GET /health returned ${response.status}`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("unknown network error")
    }

    if (attempt < attempts) {
      await sleep(delayMs)
    }
  }

  throw new Error(
    `Medusa health check failed after ${attempts} attempts: ${lastError.message}`,
  )
}
```

Run:

```powershell
npm.cmd run test:scripts
```

Expected: all readiness tests pass.

- [ ] **Step 3: Integrate readiness into the deployment verifier**

At the top of `scripts/verify-phase-2a-staging.mjs`, add:

```js
import { waitForHealthyBackend } from "./staging-health.mjs"
```

Replace the existing one-shot line:

```js
await request(medusaUrl, "/health", { headers: { accept: "text/plain" } })
```

with:

```js
const health = await waitForHealthyBackend(medusaUrl)
console.log(`Medusa healthy after ${health.attempt} attempt(s)`)
```

Keep every catalog, cart, checkout, account, and storefront assertion unchanged.

Run:

```powershell
npm.cmd run test:scripts
node --check scripts/verify-phase-2a-staging.mjs
git diff --check
```

Expected: tests pass and the verifier parses.

- [ ] **Step 4: Commit Task 4**

```powershell
git add package.json scripts/staging-health.mjs scripts/staging-health.test.mjs scripts/verify-phase-2a-staging.mjs
git commit -m "test: tolerate Cloudflare container cold starts"
```

---

### Task 5: Wire CI and the Operator Runbook

**Files:**
- Modify: `.github/workflows/phase-2a.yml`
- Modify: `docs/deployment/fotomax-phase-2-staging.md`
- Modify: `docs/verification/fotomax-phase-2a.md`

- [ ] **Step 1: Make CI verify the supported runtime and image**

In `.github/workflows/phase-2a.yml`, change `actions/setup-node` to Node 22:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
```

Add the deterministic image build after `npm run check` and before Medusa integration tests:

```yaml
      - run: npm run cloudflare:container:build
```

The image build must not require Cloudflare authentication or deploy anything. Keep PostgreSQL, Redis, migration, double seed, integration, and Playwright steps unchanged.

- [ ] **Step 2: Replace the generic backend deployment section with the exact Cloudflare flow**

Update `docs/deployment/fotomax-phase-2-staging.md` to document this order:

1. Run `npm.cmd ci` and the full verification gate under Node 22.
2. Validate Cloudflare authentication using `npm.cmd run cloudflare:whoami` with `CLOUDFLARE_API_TOKEN` set only in the current process.
3. Stop for the explicit provisioning/secret approval in Task 7.
4. Provision one Neon staging database in Singapore or the nearest mutually available APAC region.
5. Provision one Upstash Redis database in Singapore/APAC and obtain its native TLS Redis connection string. Explicitly state that REST and Box credentials are invalid for `REDIS_URL`.
6. Generate unique 48-byte random values for `JWT_SECRET`, `COOKIE_SECRET`, and `STOREFRONT_SESSION_SECRET`.
7. Run Medusa migrations and the reference seed twice against Neon/Upstash.
8. Put the seven Cloudflare Worker secrets interactively:

```powershell
npm.cmd run secret:put --workspace @fotomax/cloudflare -- DATABASE_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- REDIS_URL
npm.cmd run secret:put --workspace @fotomax/cloudflare -- STORE_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- ADMIN_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- AUTH_CORS
npm.cmd run secret:put --workspace @fotomax/cloudflare -- JWT_SECRET
npm.cmd run secret:put --workspace @fotomax/cloudflare -- COOKIE_SECRET
```

9. Deploy with `npm.cmd run cloudflare:deploy`, record the Worker URL and deployment identifier, then run `npm.cmd run container:list --workspace @fotomax/cloudflare`.
10. Set Vercel staging `MEDUSA_BACKEND_URL`, `MEDUSA_PUBLISHABLE_KEY`, and `STOREFRONT_SESSION_SECRET`, then redeploy the existing storefront project.
11. Run the deployment verifier against the exact Worker and Vercel URLs.
12. Rotate the Cloudflare token and pasted Upstash Box credential after deployment.

Also include rollback instructions: restore the previous Cloudflare Worker deployment and previous Vercel deployment; never reverse an already-applied Medusa migration during application rollback.

- [ ] **Step 3: Add a deploy-evidence template with no secret values**

Update `docs/verification/fotomax-phase-2a.md` with a `Cloudflare MVP staging` section that records only:

```text
Git commit:
GitHub Actions run:
Cloudflare Worker URL:
Cloudflare deployment ID:
Cloudflare container status:
Vercel deployment URL:
Vercel deployment ID:
Backend health result:
Staging verifier result:
Desktop browser result:
Mobile browser result:
Credential rotation confirmed:
```

Do not add account tokens, database URLs, Redis URLs, publishable keys, cookies, customer data, or secret values.

- [ ] **Step 4: Run documentation and configuration checks**

```powershell
npm.cmd run typecheck --workspace @fotomax/cloudflare
npm.cmd test --workspace @fotomax/cloudflare
npm.cmd run test:scripts
npm.cmd exec --workspace @fotomax/cloudflare wrangler -- deploy --dry-run
git diff --check
```

Expected: all commands pass; the dry run validates the Container and Durable Object configuration without deploying.

- [ ] **Step 5: Commit Task 5**

```powershell
git add .github/workflows/phase-2a.yml docs/deployment/fotomax-phase-2-staging.md docs/verification/fotomax-phase-2a.md
git commit -m "docs: add Cloudflare MVP release runbook"
```

---

### Task 6: Complete the Pre-Deployment Verification Gate

**Files:**
- Modify only if a test exposes a defect in the files owned by Tasks 1-5.

- [ ] **Step 1: Run focused checks**

```powershell
npm.cmd run typecheck --workspace @fotomax/cloudflare
npm.cmd test --workspace @fotomax/cloudflare
npm.cmd test --workspace @fotomax/medusa -- --run src/container-runtime.test.ts
npm.cmd run test:scripts
npm.cmd exec --workspace @fotomax/cloudflare wrangler -- deploy --dry-run
```

Expected: all pass.

- [ ] **Step 2: Run the repository gate**

```powershell
npm.cmd run check
npm.cmd run test:integration --workspace @fotomax/medusa
npm.cmd run e2e --workspace @fotomax/storefront -- --list
```

Expected: typechecks, unit tests, storefront build, Medusa build, Worker bundle, Medusa integration tests, and the expected desktop/mobile Playwright matrix pass/discover successfully.

- [ ] **Step 3: Build and smoke-test the container**

```powershell
npm.cmd run cloudflare:container:build
```

Repeat the Task 3 local `/health` smoke test. If local Docker is unavailable, push the branch and require the GitHub Actions image-build step to pass before Task 7. Do not deploy an image that has not been built successfully by either local Docker or CI.

- [ ] **Step 4: Review the complete diff and secret hygiene**

```powershell
git status --short
git diff --check
git diff --stat HEAD~4..HEAD
git grep -n -I -E "(cfat_|box_[0-9a-f]{20,}|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@|rediss?://[^[:space:]]+:[^[:space:]]+@)" -- . ":(exclude)package-lock.json"
```

Expected: only `.superpowers/sdd/progress.md` is intentionally dirty; the secret scan returns no real credentials. Safe local example URLs may be narrowed/excluded only after manual inspection confirms they contain dummy values.

- [ ] **Step 5: Record verification evidence**

Update `docs/verification/fotomax-phase-2a.md` with the exact commands, pass/fail result, test counts, and CI run URL. Do not invent evidence for unavailable checks.

If this evidence edit is required, commit it separately:

```powershell
git add docs/verification/fotomax-phase-2a.md
git commit -m "docs: record Cloudflare predeploy verification"
```

---

### Task 7: Approval Gate, Provision Data Services, and Configure Secrets

**Files:**
- No tracked files unless the runbook is corrected based on observed provider behavior.

- [ ] **Step 1: Stop and request explicit approval**

Request this exact scope before any provider resource or staging secret is created:

```text
Approve free-tier Neon and Upstash staging resource provisioning and creation of the Cloudflare/Vercel staging secrets. Any paid upgrade remains separately approval-gated.
```

Do not infer this approval from the existing Cloudflare Workers Paid approval.

- [ ] **Step 2: Validate provider access without exposing credentials**

Set the Cloudflare API token only in the current PowerShell process and run:

```powershell
npm.cmd run cloudflare:whoami
```

Expected: the intended Cloudflare account is shown. Never echo the token.

Authenticate Neon through its official CLI/browser flow. Authenticate Upstash with a developer API credential through its official CLI flow. If only the pasted Box key is available, stop and request the proper Upstash developer credentials; do not attempt to convert or use the Box key.

- [ ] **Step 3: Provision one staging PostgreSQL database and one Redis database**

Use the provider CLIs to create or select:

- Neon project/database: `fotomax-staging`, Singapore/APAC where available, pooled TLS connection string for application traffic.
- Upstash Redis database: `fotomax-staging`, Singapore/APAC where available, native TLS Redis endpoint assembled as `rediss://default:<URL-encoded-password>@<endpoint>:<port>`.

Keep both values in process memory or provider secret stores only. Do not write `.env` files containing the live staging values.

- [ ] **Step 4: Generate staging secrets in memory**

Use cryptographically secure random bytes without printing them:

```powershell
$jwtSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$cookieSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$storefrontSessionSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Set CORS values to the exact Vercel staging and Cloudflare Worker origins. Do not use `*`.

- [ ] **Step 5: Migrate and seed the staging database**

With the staging URLs and secrets set only in the current process, run:

```powershell
npm.cmd run db:migrate
npm.cmd run seed:medusa
npm.cmd run seed:medusa
```

Expected: migration succeeds; both seed runs succeed and converge on the same reference data. Capture the seeded publishable key in a secret variable without logging it in tracked evidence.

- [ ] **Step 6: Put Worker secrets through standard input**

Use the seven commands from the runbook. For generated secrets, pipe only the in-memory values to Wrangler, for example:

```powershell
$jwtSecret | npm.cmd run secret:put --workspace @fotomax/cloudflare -- JWT_SECRET
$cookieSecret | npm.cmd run secret:put --workspace @fotomax/cloudflare -- COOKIE_SECRET
```

Apply the same standard-input pattern to `DATABASE_URL` and `REDIS_URL`. Verify only the secret names, never their values.

---

### Task 8: Deploy Cloudflare, Repoint Vercel, and Verify the MVP

**Files:**
- Modify: `docs/verification/fotomax-phase-2a.md`
- Modify only if live evidence exposes a defect in the Worker, image, verifier, or runbook.

- [ ] **Step 1: Deploy the Worker and Container**

```powershell
npm.cmd run cloudflare:deploy
npm.cmd run container:list --workspace @fotomax/cloudflare
```

Expected: Wrangler reports the `fotomax-medusa-staging` Worker URL and deployment/version identifier; the one APAC `basic` container becomes healthy. First deployment may take several minutes while Cloudflare builds and distributes the image.

- [ ] **Step 2: Verify the backend directly**

Run the cold-start-aware health helper through the full staging verifier using the exact Worker URL. Confirm:

- `/health` reaches `200` after any startup delay.
- unavailable startup responses use the stable JSON `503` contract and include `x-request-id`.
- `/store/products` returns the seeded live catalog.
- `/app` serves Medusa Admin from the same Worker origin.
- Worker logs show request/container events without cookies, authorization headers, addresses, or secret values.

If `basic` is out of memory, capture evidence and stop for approval before changing `instance_type`.

- [ ] **Step 3: Configure and redeploy the existing Vercel storefront**

Set the existing staging project's variables from process-local variables using the Vercel CLI's standard-input workflow:

```powershell
$cloudflareWorkerOrigin | npx.cmd vercel env add MEDUSA_BACKEND_URL preview --force
$publishableKey | npx.cmd vercel env add MEDUSA_PUBLISHABLE_KEY preview --force
$storefrontSessionSecret | npx.cmd vercel env add STOREFRONT_SESSION_SECRET preview --force
npx.cmd vercel
```

Confirm the repository is linked to the intended existing Vercel project before running these commands. If the staging deployment uses a named preview branch, supply that branch to `vercel env add`; do not write the actual values to the terminal. Capture the exact Vercel deployment URL and identifier.

- [ ] **Step 4: Run deployment-specific and browser verification**

Run the existing deployment verifier against the exact Cloudflare and Vercel URLs. Then verify desktop and mobile journeys:

- both storefront locales render live Medusa products;
- delivery and pickup checkout complete with the system payment provider;
- cancellation releases inventory;
- optional account login and order history preserve customer isolation;
- Medusa Admin displays the staging order;
- no uncaught exceptions, failed product media, console errors, or horizontal overflow occur.

Use the repository's existing Playwright matrix and browser verification workflow. Capture screenshots only when they add evidence; never capture secrets or customer data.

- [ ] **Step 5: Record live evidence and commit it**

Fill every applicable field in the `Cloudflare MVP staging` evidence section. Record provider deployment IDs and URLs, not grouped historical logs.

```powershell
git add docs/verification/fotomax-phase-2a.md
git commit -m "docs: record Cloudflare staging deployment"
```

- [ ] **Step 6: Rotate exposed credentials and close the release**

Rotate the Cloudflare API token and the pasted Upstash Box credential. Confirm rotation in the evidence document without recording old or new values. Clear process-local secret variables:

```powershell
$jwtSecret = $null
$cookieSecret = $null
$storefrontSessionSecret = $null
$env:CLOUDFLARE_API_TOKEN = $null
```

Run a final `git status --short` and secret scan. The only permitted unrelated dirty file remains `.superpowers/sdd/progress.md`.

## Completion Criteria

- Cloudflare Worker and Container configuration is tracked, pinned, tested, and reproducibly image-built under Node 22.
- The Worker forwards all Medusa API/Admin traffic, adds a request ID, and returns a controlled secret-free `503` during container unavailability.
- Medusa starts inside the image on `0.0.0.0:9000` with Admin enabled and shared worker mode.
- Neon migrations and double seed succeed; Upstash is connected through native TLS Redis.
- The Vercel storefront points at the exact Cloudflare deployment and never falls back to fixtures.
- The existing Phase 2A customer and Admin journeys pass on desktop and mobile.
- Deployment IDs, exact test URLs, and verification results are recorded without secrets.
- Pasted provider credentials are rotated, and no paid provider change beyond the approved Cloudflare Workers plan was made.
