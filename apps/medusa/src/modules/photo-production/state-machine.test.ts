import { describe, expect, it } from "vitest"
import {
  assertPhotoAssetTransition,
  assertPhotoJobTransition,
  assertUploadSessionTransition,
} from "./state-machine"

describe("photo production state machines", () => {
  describe("photo jobs", () => {
    const allowedTransitions = [
      ["draft", "uploading"],
      ["draft", "cancelled"],
      ["draft", "expired"],
      ["uploading", "ready"],
      ["uploading", "failed"],
      ["uploading", "cancelled"],
      ["uploading", "expired"],
      ["failed", "uploading"],
      ["failed", "cancelled"],
      ["failed", "expired"],
      ["ready", "uploading"],
      ["ready", "cancelled"],
      ["ready", "expired"],
    ] as const

    const rejectedTransitions = [
      ["draft", "ready"],
      ["draft", "failed"],
      ["uploading", "draft"],
      ["failed", "ready"],
      ["ready", "failed"],
      ["cancelled", "uploading"],
      ["expired", "uploading"],
    ] as const

    it.each(allowedTransitions)("allows %s -> %s", (from, to) => {
      expect(() => assertPhotoJobTransition(from, to)).not.toThrow()
    })

    it.each(rejectedTransitions)("rejects %s -> %s", (from, to) => {
      expect(() => assertPhotoJobTransition(from, to)).toThrow(
        "photo_state_transition_invalid",
      )
    })
  })

  describe("photo assets", () => {
    const allowedTransitions = [
      ["pending", "uploading"],
      ["pending", "failed"],
      ["pending", "deleted"],
      ["uploading", "uploaded"],
      ["uploading", "failed"],
      ["uploading", "deleted"],
      ["failed", "uploading"],
      ["failed", "deleted"],
      ["uploaded", "deleted"],
    ] as const

    const rejectedTransitions = [
      ["pending", "uploaded"],
      ["uploading", "pending"],
      ["failed", "uploaded"],
      ["uploaded", "uploading"],
      ["deleted", "uploading"],
    ] as const

    it.each(allowedTransitions)("allows %s -> %s", (from, to) => {
      expect(() => assertPhotoAssetTransition(from, to)).not.toThrow()
    })

    it.each(rejectedTransitions)("rejects %s -> %s", (from, to) => {
      expect(() => assertPhotoAssetTransition(from, to)).toThrow(
        "photo_state_transition_invalid",
      )
    })
  })

  describe("upload sessions", () => {
    const terminalStatuses = ["completed", "aborted", "expired"] as const

    it.each(terminalStatuses)("allows active -> %s", (to) => {
      expect(() => assertUploadSessionTransition("active", to)).not.toThrow()
    })

    it.each(terminalStatuses)("rejects %s -> active", (from) => {
      expect(() => assertUploadSessionTransition(from, "active")).toThrow(
        "photo_state_transition_invalid",
      )
    })

    it.each(terminalStatuses)("rejects %s -> completed", (from) => {
      expect(() => assertUploadSessionTransition(from, "completed")).toThrow(
        "photo_state_transition_invalid",
      )
    })
  })
})
