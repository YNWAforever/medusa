import { describe, expect, it } from "vitest"

import { PhotoSourceRegistry } from "./service"
import { PhotoSourceError, type PhotoSourceAdapter, type PhotoSourceType } from "./types"

function stub(sourceType: PhotoSourceType): PhotoSourceAdapter {
  return {
    sourceType,
    async startSelection() {
      return {
        importSessionId: "s",
        expiresAt: new Date().toISOString(),
        customerAction: { kind: "none" },
      }
    },
    async listSelectedItems() {
      return []
    },
    async openItemStream() {
      return new ReadableStream<Uint8Array>()
    },
    async dispose() {},
  }
}

describe("PhotoSourceRegistry", () => {
  it("resolves a registered adapter by source type", () => {
    const device = stub("device")
    const registry = new PhotoSourceRegistry([device])

    expect(registry.get("device")).toBe(device)
    expect(registry.has("device")).toBe(true)
  })

  it("lists what is available in a stable order", () => {
    const registry = new PhotoSourceRegistry([stub("google_photos"), stub("device")])

    expect(registry.available).toEqual(["device", "google_photos"])
  })

  it("reports an unregistered provider as unavailable rather than not-built", () => {
    const registry = new PhotoSourceRegistry([stub("device")])

    // Probing must not reveal whether Dropbox exists but is disabled here.
    expect(() => registry.get("dropbox")).toThrow(PhotoSourceError)
    expect(() => registry.get("dropbox")).toThrow("photo_source_unavailable")
    expect(registry.has("dropbox")).toBe(false)
  })

  it("treats an unknown string the same as a known-but-absent provider", () => {
    const registry = new PhotoSourceRegistry([stub("device")])

    expect(() => registry.get("myspace")).toThrow("photo_source_unavailable")
  })

  it("refuses two adapters claiming the same source type", () => {
    expect(() => new PhotoSourceRegistry([stub("device"), stub("device")])).toThrow(
      "Duplicate photo source adapter: device",
    )
  })

  it("is empty by default", () => {
    expect(new PhotoSourceRegistry().available).toEqual([])
  })
})
