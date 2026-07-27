/**
 * CRC-32C (Castagnoli), the checksum S3 uses for integrity on uploaded parts.
 *
 * Phase 2B only ever received a CRC32C computed by the browser. Server-side
 * ingestion has no client to ask, so we compute it while the bytes stream past.
 */
const POLYNOMIAL = 0x82f63b78

const TABLE = buildTable()

function buildTable(): Uint32Array {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let crc = index
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ POLYNOMIAL : crc >>> 1
    }
    table[index] = crc >>> 0
  }

  return table
}

export class Crc32c {
  #state = 0xffffffff

  update(chunk: Uint8Array): this {
    let state = this.#state

    for (let index = 0; index < chunk.length; index += 1) {
      state = (state >>> 8) ^ TABLE[(state ^ chunk[index]) & 0xff]
    }

    this.#state = state >>> 0
    return this
  }

  /** The finalized checksum as an unsigned 32-bit integer. */
  get value(): number {
    return (this.#state ^ 0xffffffff) >>> 0
  }

  /** Big-endian four bytes, base64 — the encoding S3 expects. */
  base64(): string {
    const bytes = Buffer.alloc(4)
    bytes.writeUInt32BE(this.value, 0)
    return bytes.toString("base64")
  }

  hex(): string {
    return this.value.toString(16).padStart(8, "0")
  }
}

export function crc32c(input: Uint8Array): number {
  return new Crc32c().update(input).value
}
