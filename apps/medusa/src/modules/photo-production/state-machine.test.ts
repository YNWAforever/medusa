import { describe, expect, it } from "vitest"
import {
  assertPhotoAssetTransition,
  assertPhotoJobTransition,
  assertUploadSessionTransition,
  type PhotoAssetStatus,
  type PhotoJobStatus,
  type PhotoUploadSessionStatus,
} from "./state-machine"

function rejectedTransitionsFor<T extends string>(
  statuses: readonly T[],
  allowedTransitions: readonly (readonly [T, T])[],
): readonly (readonly [T, T])[] {
  return statuses.flatMap((from) =>
    statuses
      .filter(
        (to) =>
          !allowedTransitions.some(
            ([allowedFrom, allowedTo]) =>
              allowedFrom === from && allowedTo === to,
          ),
      )
      .map((to) => [from, to] as const),
  )
}

describe("photo production state machines", () => {
  describe("photo jobs", () => {
    const statuses = [
      "draft",
      "uploading",
      "ready",
      "failed",
      "cancelled",
      "expired",
    ] as const satisfies readonly PhotoJobStatus[]

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

    const rejectedTransitions = rejectedTransitionsFor(
      statuses,
      allowedTransitions,
    )

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
    const statuses = [
      "pending",
      "uploading",
      "uploaded",
      "failed",
      "deleted",
    ] as const satisfies readonly PhotoAssetStatus[]

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

    const rejectedTransitions = rejectedTransitionsFor(
      statuses,
      allowedTransitions,
    )

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
    const statuses = [
      "active",
      "completed",
      "aborted",
      "expired",
    ] as const satisfies readonly PhotoUploadSessionStatus[]

    const allowedTransitions = [
      ["active", "completed"],
      ["active", "aborted"],
      ["active", "expired"],
    ] as const

    const rejectedTransitions = rejectedTransitionsFor(
      statuses,
      allowedTransitions,
    )

    it.each(allowedTransitions)("allows %s -> %s", (from, to) => {
      expect(() => assertUploadSessionTransition(from, to)).not.toThrow()
    })

    it.each(rejectedTransitions)("rejects %s -> %s", (from, to) => {
      expect(() => assertUploadSessionTransition(from, to)).toThrow(
        "photo_state_transition_invalid",
      )
    })
  })
})
