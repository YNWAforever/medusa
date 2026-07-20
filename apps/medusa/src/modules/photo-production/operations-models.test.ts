import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { assertPhotoJobTransition } from "./state-machine"

describe("photo operations persistence contract", () => {
  it("stores production state and authoritative retention timestamps", () => {
    const job = readFileSync(new URL("./models/photo-job.ts", import.meta.url), "utf8")
    expect(job).toContain("production_status")
    expect(job).toContain("fulfilled_at")
    expect(job).toContain("retention_hold_until")
    expect(job).toContain("media_expires_at")
  })

  it("clears verified object keys while preserving a media deletion timestamp", () => {
    const asset = readFileSync(new URL("./models/photo-asset.ts", import.meta.url), "utf8")
    expect(asset).toMatch(/object_key: model\.text\(\)\.unique\(\)\.nullable\(\)/)
    expect(asset).toContain("media_deleted_at")
  })

  it("allows ordered fulfillment and final expiry only", () => {
    expect(() => assertPhotoJobTransition("ordered", "fulfilled")).not.toThrow()
    expect(() => assertPhotoJobTransition("fulfilled", "expired")).not.toThrow()
    expect(() => assertPhotoJobTransition("fulfilled", "ready")).toThrow("photo_state_transition_invalid")
  })
})
