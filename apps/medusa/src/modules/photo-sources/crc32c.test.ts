import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { Crc32c, crc32c } from "./crc32c"

describe("crc32c", () => {
  // Published CRC-32C check values. RFC 3720 B.4 supplies the 32-byte vectors;
  // 0xE3069283 over "123456789" is the standard check constant.
  it.each([
    ["the empty input", new Uint8Array(0), 0x00000000],
    ["the standard check string", Buffer.from("123456789", "ascii"), 0xe3069283],
    ["32 zero bytes", new Uint8Array(32), 0x8a9136aa],
    ["32 0xFF bytes", new Uint8Array(32).fill(0xff), 0x62a8ab43],
  ])("matches the published vector for %s", (_label, input, expected) => {
    expect(crc32c(input)).toBe(expected)
  })

  it("matches the published vector for the incrementing 0..31 sequence", () => {
    const input = new Uint8Array(32)
    for (let index = 0; index < 32; index += 1) input[index] = index

    expect(crc32c(input)).toBe(0x46dd794e)
  })

  it("produces the same digest whatever the chunk boundaries", () => {
    const payload = randomBytes(4096)
    const whole = new Crc32c().update(payload).value

    for (const size of [1, 7, 64, 1000, 4095]) {
      const chunked = new Crc32c()
      for (let offset = 0; offset < payload.length; offset += size) {
        chunked.update(payload.subarray(offset, offset + size))
      }
      expect(chunked.value, `chunk size ${size}`).toBe(whole)
    }
  })

  it("is unaffected by empty updates", () => {
    const payload = Buffer.from("fotomax", "ascii")
    const padded = new Crc32c()
      .update(new Uint8Array(0))
      .update(payload)
      .update(new Uint8Array(0))

    expect(padded.value).toBe(crc32c(payload))
  })

  it("detects a single flipped bit", () => {
    const payload = randomBytes(256)
    const mutated = Buffer.from(payload)
    mutated[128] ^= 0x01

    expect(crc32c(mutated)).not.toBe(crc32c(payload))
  })

  it("stays within unsigned 32-bit range", () => {
    for (let index = 0; index < 64; index += 1) {
      const value = crc32c(randomBytes(index))
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it("encodes base64 as four big-endian bytes, the way S3 expects", () => {
    const digest = new Crc32c().update(Buffer.from("123456789", "ascii"))
    const decoded = Buffer.from(digest.base64(), "base64")

    expect(decoded).toHaveLength(4)
    expect(decoded.readUInt32BE(0)).toBe(0xe3069283)
    expect(digest.hex()).toBe("e3069283")
  })
})
