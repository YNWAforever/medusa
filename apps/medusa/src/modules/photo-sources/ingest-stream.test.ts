import { createHash, randomBytes } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import { Crc32c } from "./crc32c"
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  MAX_INGEST_BYTES,
  PhotoIngestError,
  copyPhotoStream,
} from "./ingest-stream"

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  const queue = [...chunks]
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift()
      if (!next) {
        controller.close()
        return
      }
      controller.enqueue(next)
    },
  })
}

/** Emits one chunk, then stalls without closing — a hung provider. */
function stallingStream(first: Uint8Array): ReadableStream<Uint8Array> {
  let sent = false
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) return new Promise<void>(() => {})
      sent = true
      controller.enqueue(first)
      return undefined
    },
  })
}

function collect() {
  const chunks: Uint8Array[] = []
  return {
    chunks,
    sink: (chunk: Uint8Array) => {
      chunks.push(chunk)
    },
    get bytes() {
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    },
  }
}

describe("copyPhotoStream", () => {
  it("copies every byte through and reports both digests", async () => {
    const payload = randomBytes(8192)
    const chunks = [payload.subarray(0, 1000), payload.subarray(1000, 5000), payload.subarray(5000)]
    const sink = collect()

    const result = await copyPhotoStream({
      source: streamOf(chunks),
      sink: sink.sink,
    })

    expect(sink.bytes.equals(payload)).toBe(true)
    expect(result.bytes).toBe(payload.length)
    expect(result.sha256).toBe(createHash("sha256").update(payload).digest("hex"))
    expect(result.crc32c).toBe(new Crc32c().update(payload).base64())
  })

  it("handles an empty stream", async () => {
    const result = await copyPhotoStream({ source: streamOf([]), sink: () => {} })

    expect(result.bytes).toBe(0)
    expect(result.sha256).toBe(createHash("sha256").digest("hex"))
  })

  it("never buffers the whole file — chunks reach the sink as they arrive", async () => {
    const seen: number[] = []
    let observedMidStream = 0

    await copyPhotoStream({
      source: streamOf([new Uint8Array(10), new Uint8Array(20), new Uint8Array(30)]),
      sink: (chunk) => {
        seen.push(chunk.length)
        if (seen.length === 2) observedMidStream = seen.length
      },
    })

    expect(seen).toEqual([10, 20, 30])
    expect(observedMidStream).toBe(2)
  })

  it("cuts off a provider that exceeds the byte cap", async () => {
    const sink = collect()

    await expect(
      copyPhotoStream({
        source: streamOf([new Uint8Array(600), new Uint8Array(600)]),
        sink: sink.sink,
        maxBytes: 1000,
      }),
    ).rejects.toThrow("photo_source_too_large")

    // The overrunning chunk must not reach storage.
    expect(sink.bytes.length).toBe(600)
  })

  it("enforces the cap mid-stream rather than after the fact", async () => {
    let pulled = 0
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(100))
      },
    })

    await expect(
      copyPhotoStream({ source, sink: () => {}, maxBytes: 250 }),
    ).rejects.toThrow("photo_source_too_large")

    // An infinite provider is stopped, not drained.
    expect(pulled).toBeLessThan(10)
  })

  it("defaults the cap to 50 MiB and the idle timeout to 30 seconds", () => {
    expect(MAX_INGEST_BYTES).toBe(50 * 1024 * 1024)
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(30_000)
  })

  it("trips the idle timeout when a provider stops sending without closing", async () => {
    await expect(
      copyPhotoStream({
        source: stallingStream(new Uint8Array(10)),
        sink: () => {},
        idleTimeoutMs: 25,
      }),
    ).rejects.toThrow("photo_source_stalled")
  })

  it("resets the idle window on every chunk, so a slow but live transfer survives", async () => {
    let remaining = 4
    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (remaining === 0) {
          controller.close()
          return
        }
        remaining -= 1
        await new Promise((resolve) => setTimeout(resolve, 15))
        controller.enqueue(new Uint8Array(10))
      },
    })

    // Total elapsed far exceeds the window; no single gap does.
    const result = await copyPhotoStream({ source, sink: () => {}, idleTimeoutMs: 60 })

    expect(result.bytes).toBe(40)
  })

  it("stops when the caller aborts mid-transfer", async () => {
    const controller = new AbortController()
    const source = new ReadableStream<Uint8Array>({
      pull(streamController) {
        streamController.enqueue(new Uint8Array(10))
      },
    })

    const copy = copyPhotoStream({
      source,
      sink: () => controller.abort(),
      signal: controller.signal,
    })

    await expect(copy).rejects.toThrow("photo_source_aborted")
  })

  it("refuses immediately when handed an already-aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      copyPhotoStream({
        source: streamOf([new Uint8Array(10)]),
        sink: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow("photo_source_aborted")
  })

  it("cancels the provider stream on failure instead of leaving it draining", async () => {
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(500))
      },
      cancel,
    })

    await expect(
      copyPhotoStream({ source, sink: () => {}, maxBytes: 100 }),
    ).rejects.toThrow(PhotoIngestError)

    expect(cancel).toHaveBeenCalled()
  })

  it("detects a truncated transfer against the provider's stated size", async () => {
    await expect(
      copyPhotoStream({
        source: streamOf([new Uint8Array(400)]),
        sink: () => {},
        expectedBytes: 1000,
      }),
    ).rejects.toThrow("photo_source_size_mismatch")
  })

  it("accepts a transfer that matches the stated size", async () => {
    const result = await copyPhotoStream({
      source: streamOf([new Uint8Array(400), new Uint8Array(600)]),
      sink: () => {},
      expectedBytes: 1000,
    })

    expect(result.bytes).toBe(1000)
  })

  it("ignores an absent or unusable stated size", async () => {
    for (const expectedBytes of [null, undefined, Number.NaN]) {
      const result = await copyPhotoStream({
        source: streamOf([new Uint8Array(64)]),
        sink: () => {},
        expectedBytes,
      })
      expect(result.bytes).toBe(64)
    }
  })

  it("propagates a sink failure so a storage error is not silently swallowed", async () => {
    await expect(
      copyPhotoStream({
        source: streamOf([new Uint8Array(10)]),
        sink: () => {
          throw new Error("storage_unavailable")
        },
      }),
    ).rejects.toThrow("storage_unavailable")
  })

  it("propagates a provider stream error", async () => {
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("provider_reset"))
      },
    })

    await expect(copyPhotoStream({ source, sink: () => {} })).rejects.toThrow("provider_reset")
  })

  it("skips zero-length chunks without disturbing the digest", async () => {
    const payload = Buffer.from("fotomax", "ascii")
    const result = await copyPhotoStream({
      source: streamOf([new Uint8Array(0), payload, new Uint8Array(0)]),
      sink: () => {},
    })

    expect(result.sha256).toBe(createHash("sha256").update(payload).digest("hex"))
    expect(result.bytes).toBe(payload.length)
  })
})
