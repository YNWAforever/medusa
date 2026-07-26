import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const verifier = readFileSync(new URL("./verify-phase-2a-staging.mjs", import.meta.url), "utf8")

test("verifies a generated private photo inside the mixed staging order", () => {
  const createPhoto = verifier.indexOf('request(medusaUrl, "/store/photo-jobs"')
  const validateUpload = verifier.lastIndexOf("validateSinglePutUpload(upload)")
  const directPut = verifier.indexOf("fetch(upload.uploadUrl")
  const waitForWorker = verifier.indexOf("waitForPhotoAsset(photoJob.id")
  const quote = verifier.indexOf("photoQuote")
  const attach = verifier.indexOf('`/store/photo-jobs/${photoJob.id}/cart`')
  const completeOrder = verifier.indexOf('`/store/carts/${cart.id}/complete`')
  assert.ok(createPhoto >= 0)
  assert.ok(validateUpload > createPhoto)
  assert.ok(directPut > validateUpload)
  assert.ok(waitForWorker > directPut)
  assert.ok(quote > waitForWorker)
  assert.ok(attach > quote)
  assert.ok(completeOrder > attach)
  assert.match(
    verifier,
    /const singlePutUploadFields = \[\s*"assetId",\s*"expiresAt",\s*"requiredHeaders",\s*"sessionId",\s*"status",\s*"strategy",\s*"uploadUrl",?\s*\]/,
  )
  assert.match(verifier, /Object\.keys\(upload\)\.sort\(\)/)
  assert.match(verifier, /upload\.strategy,\s*"single-put"/)
  assert.match(verifier, /method:\s*"PUT"/)
  assert.match(verifier, /headers:\s*upload\.requiredHeaders/)
  assert.match(verifier, /put\.headers\.get\("etag"\)/)
  assert.match(verifier, /JSON\.stringify\(\{\s*etag\s*\}\)/)
  assert.doesNotMatch(verifier, /\/parts/)
  assert.doesNotMatch(verifier, /checksumCRC32C/)
  assert.match(verifier, /randomBytes\(32\)\.toString\("base64url"\)/)
  assert.match(verifier, /phase-2b-synthetic\.jpg/)
  assert.match(verifier, /evidence\.photoVersionId/)
  assert.match(verifier, /attachedPhotoLines/)
  assert.match(verifier, /photo_job_version_id/)
  assert.match(verifier, /orderPhotoLines/)
  assert.match(verifier, /orderedPhotoJob\.status !== "ordered"/)
})
