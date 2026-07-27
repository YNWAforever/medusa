import { describe, expect, it } from "vitest";
import { assertPhotoAssetTransition } from "./state-machine";

describe("Task 5 photo asset transitions", () => {
  it.each([
    ["uploaded", "processing"],
    ["failed", "processing"],
    ["processing", "ready"],
    ["processing", "blocked"],
    ["processing", "failed"],
    ["processing", "deleted"],
    ["ready", "deleted"],
    ["blocked", "deleted"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(() => assertPhotoAssetTransition(from, to)).not.toThrow();
  });

  it.each([
    ["ready", "processing"],
    ["blocked", "processing"],
    ["deleted", "processing"],
    ["deleted", "ready"],
  ] as const)("rejects terminal %s -> %s", (from, to) => {
    expect(() => assertPhotoAssetTransition(from, to)).toThrow(
      "photo_state_transition_invalid",
    );
  });
});
