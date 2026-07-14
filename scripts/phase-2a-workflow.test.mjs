import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(
  new URL("../.github/workflows/phase-2a.yml", import.meta.url),
  "utf8",
)

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
