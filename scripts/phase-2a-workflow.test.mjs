import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const workflow = readFileSync(
  new URL("../.github/workflows/phase-2a.yml", import.meta.url),
  "utf8",
)

test("exports the seeded publishable key before the canonical check", () => {
  const secondSeed = workflow.lastIndexOf("- run: npm run seed:medusa")
  const exportKey = workflow.indexOf(
    "- run: npm run ci:export-publishable-key --workspace @fotomax/medusa",
  )
  const check = workflow.indexOf("- run: npm run check")

  assert.ok(secondSeed >= 0)
  assert.ok(exportKey > secondSeed)
  assert.ok(check > exportKey)
  assert.doesNotMatch(
    workflow,
    /MEDUSA_PUBLISHABLE_KEY:\s*\$\{\{\s*secrets\./,
  )
})
