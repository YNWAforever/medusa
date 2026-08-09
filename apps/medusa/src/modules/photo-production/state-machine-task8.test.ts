import { describe, expect, it } from "vitest"
import { assertPhotoJobTransition, type PhotoJobStatus } from "./state-machine"

const status = (value: string) => value as PhotoJobStatus

describe("Task 8 photo job transitions", () => {
  it.each([
    ["ready", "cart_attached"],
    ["cart_attached", "ready"],
    ["cart_attached", "ordered"],
    ["ordered", "cancelled"],
  ])("allows %s -> %s", (from, to) => {
    expect(() => assertPhotoJobTransition(status(from), status(to))).not.toThrow()
  })

  it.each([
    ["ordered", "ready"],
    ["ordered", "cart_attached"],
    ["cancelled", "ordered"],
  ])("rejects immutable %s -> %s", (from, to) => {
    expect(() => assertPhotoJobTransition(status(from), status(to))).toThrow(
      "photo_state_transition_invalid",
    )
  })
})