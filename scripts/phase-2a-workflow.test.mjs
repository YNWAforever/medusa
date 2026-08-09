import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(
  new URL("../.github/workflows/phase-2a.yml", import.meta.url),
  "utf8",
)
const compose = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8")

test("runs the canonical check against a healthy seeded Medusa backend", () => {
  const secondSeed = workflow.lastIndexOf("- run: npm run seed:medusa")
  const exportKey = workflow.indexOf(
    "- run: npm run ci:export-publishable-key --workspace @fotomax/medusa",
  )
  const prebuild = workflow.indexOf(
    "npm run build --workspace @fotomax/medusa",
  )
  const start = workflow.indexOf(
    "NODE_ENV=development npm run dev --workspace @fotomax/medusa",
  )
  const waitForHealth = workflow.indexOf("waitForHealthyBackend")
  const check = workflow.indexOf("npm run check")

  assert.ok(secondSeed >= 0)
  assert.ok(exportKey > secondSeed)
  assert.ok(prebuild > exportKey)
  assert.ok(start > prebuild)
  assert.ok(waitForHealth > start)
  assert.ok(check > waitForHealth)
  assert.match(workflow, /trap cleanup EXIT/)
  assert.match(workflow, /setsid bash -c/)
  assert.match(workflow, /kill -- -"\$medusa_pid"/)
  assert.match(workflow, /\$RUNNER_TEMP\/medusa\.log/)
  assert.doesNotMatch(
    workflow,
    /npm run start --workspace @fotomax\/medusa/,
  )
  assert.doesNotMatch(workflow, /\.medusa\/server.*medusa start/)
  assert.doesNotMatch(
    workflow,
    /MEDUSA_PUBLISHABLE_KEY:\s*\$\{\{\s*secrets\./,
  )
})

test("gates pull requests and the integration branch, not just the feature branch", () => {
  assert.match(workflow, /^\s*pull_request:\s*$/m)

  // Accept either the inline `branches: [a, b]` form or a YAML list, so the
  // assertion survives reformatting when a branch is added.
  const branches = workflow.slice(workflow.indexOf("branches:"), workflow.indexOf("jobs:"))
  for (const branch of ["codex/fotomax-foundation", "codex/fotomax-storefront"]) {
    assert.ok(branches.includes(branch), `push trigger is missing ${branch}`)
  }
})

test("bounds runtime, concurrency, and token scope", () => {
  assert.match(workflow, /^\s*timeout-minutes:\s*\d+\s*$/m)
  assert.match(workflow, /^concurrency:\s*$/m)
  assert.match(workflow, /cancel-in-progress:\s*true/)
  assert.match(workflow, /^permissions:\s*$/m)
  assert.match(workflow, /contents:\s*read/)
})

test("builds the container offline before the Wrangler deployment dry-run", () => {
  const containerBuild = workflow.indexOf(
    "- run: npm run cloudflare:container:build:ci",
  )
  const wranglerDryRun = workflow.indexOf(
    "- run: npm exec --workspace @fotomax/cloudflare wrangler -- deploy --dry-run",
  )

  assert.ok(containerBuild >= 0)
  assert.ok(wranglerDryRun > containerBuild)
  assert.doesNotMatch(
    workflow,
    /^\s*- run: npm run cloudflare:container:build\r?$/m,
  )
})

test("runs Phase 2B photo verification against private S3-compatible storage", () => {
  assert.match(workflow, /minio\/minio:/)
  assert.match(workflow, /mc anonymous set none/)
  assert.match(workflow, /PHOTO_STORAGE_PROVIDER: "s3"/)
  assert.match(workflow, /PHOTO_STORAGE_ENDPOINT: http:\/\/localhost:9002/)
  assert.match(workflow, /PHOTO_STORAGE_BUCKET: fotomax-photo-private/)
  assert.match(workflow, /PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false"/)
  assert.match(
    workflow,
    /MINIO_API_CORS_ALLOW_ORIGIN=http:\/\/127\.0\.0\.1:3100,http:\/\/localhost:3100/,
  )
  assert.match(
    workflow,
    /^\s*- run: npm run test:integration --workspace @fotomax\/medusa\s*$/m,
  )
  assert.doesNotMatch(
    workflow,
    /test:integration --workspace @fotomax\/medusa -- photo-production\.spec\.ts photo-security\.spec\.ts/,
  )
  assert.match(compose, /PHOTO_STORAGE_PROVIDER: "s3"/)
  assert.match(compose, /minio\/minio:/)
  assert.match(compose, /mc anonymous set none/)
  assert.match(
    compose,
    /MINIO_API_CORS_ALLOW_ORIGIN: http:\/\/127\.0\.0\.1:3100,http:\/\/localhost:3100/,
  )
})
