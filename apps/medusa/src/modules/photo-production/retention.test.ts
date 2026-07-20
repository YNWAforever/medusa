import { describe, expect, it } from "vitest"

import {
  calculateMediaExpiry,
  isRetentionEligible,
  validateRetentionTestMode,
} from "./retention"

const hour = 60 * 60 * 1000
const now = new Date("2026-07-20T00:00:00.000Z")

describe("photo media retention policy", () => {
  it("expires draft media 168 hours after its last eligible activity", () => {
    expect(calculateMediaExpiry({ status: "draft", retention_class: "standard", last_activity_at: now }))
      .toEqual(new Date(now.getTime() + 168 * hour))
  })

  it("expires fulfilled media 720 hours after authoritative fulfillment", () => {
    expect(calculateMediaExpiry({ status: "fulfilled", retention_class: "standard", last_activity_at: now, fulfilled_at: now }))
      .toEqual(new Date(now.getTime() + 720 * hour))
  })

  it("never expires an ordered but unfulfilled job", () => {
    expect(calculateMediaExpiry({ status: "ordered", retention_class: "standard", last_activity_at: now })).toBeNull()
  })

  it("uses abandoned timing for cancellation unless a later hold exists", () => {
    const hold = new Date(now.getTime() + 200 * hour)
    expect(calculateMediaExpiry({ status: "cancelled", retention_class: "standard", last_activity_at: now, retention_hold_until: hold })).toEqual(hold)
  })

  it("supports staging-only accelerated expiry and rejects unsafe production mode", () => {
    expect(calculateMediaExpiry({ status: "draft", retention_class: "accelerated_test", last_activity_at: now }))
      .toEqual(new Date(now.getTime() + 15 * 60 * 1000))
    expect(calculateMediaExpiry({ status: "fulfilled", retention_class: "accelerated_test", last_activity_at: now, fulfilled_at: now }))
      .toEqual(new Date(now.getTime() + 30 * 60 * 1000))
    expect(() => validateRetentionTestMode({ NODE_ENV: "production", PHOTO_RETENTION_TEST_MODE: "true", MEDUSA_CLOUD_ENVIRONMENT_TYPE: "preview" }))
      .toThrow("photo_retention_test_mode_unsafe")
    expect(() => validateRetentionTestMode({ NODE_ENV: "production", PHOTO_RETENTION_TEST_MODE: "true", MEDUSA_CLOUD_ENVIRONMENT_TYPE: "long-lived", MEDUSA_CLOUD_ENVIRONMENT_NAME: "staging" }))
      .not.toThrow()
  })

  it("becomes eligible only at or after the calculated expiry", () => {
    const job = { status: "draft", retention_class: "standard", last_activity_at: now }
    expect(isRetentionEligible(job, new Date(now.getTime() + 168 * hour - 1))).toBe(false)
    expect(isRetentionEligible(job, new Date(now.getTime() + 168 * hour))).toBe(true)
  })
})
