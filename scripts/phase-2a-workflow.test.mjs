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
    "npm run start --workspace @fotomax/medusa",
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
  assert.match(workflow, /kill "\$medusa_pid"/)
  assert.match(workflow, /\$RUNNER_TEMP\/medusa\.log/)
  assert.doesNotMatch(
    workflow,
    /MEDUSA_PUBLISHABLE_KEY:\s*\$\{\{\s*secrets\./,
  )
})
