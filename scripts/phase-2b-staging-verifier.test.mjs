import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const verifier = readFileSync(new URL("./verify-phase-2a-staging.mjs", import.meta.url), "utf8")

test("verifies a generated private photo inside the mixed staging order", () => {
  const createPhoto = verifier.indexOf('request(medusaUrl, "/store/photo-jobs"')
  const directPut = verifier.indexOf('fetch(part.url, { method: "PUT"')
  const waitForWorker = verifier.indexOf("waitForPhotoAsset(photoJob.id")
  const quote = verifier.indexOf("photoQuote")
  const attach = verifier.indexOf('`/store/photo-jobs/${photoJob.id}/cart`')
  const completeOrder = verifier.indexOf('`/store/carts/${cart.id}/complete`')
  assert.ok(createPhoto >= 0)
  assert.ok(directPut > createPhoto)
  assert.ok(waitForWorker > directPut)
  assert.ok(quote > waitForWorker)
  assert.ok(attach > quote)
  assert.ok(completeOrder > attach)
  assert.match(verifier, /randomBytes\(32\)\.toString\("base64url"\)/)
  assert.match(verifier, /phase-2b-synthetic\.jpg/)
  assert.match(verifier, /evidence\.photoVersionId/)
  assert.match(verifier, /attachedPhotoLines/)
  assert.match(verifier, /photo_job_version_id/)
  assert.match(verifier, /orderPhotoLines/)
  assert.match(verifier, /orderedPhotoJob\.status !== "ordered"/)
})
