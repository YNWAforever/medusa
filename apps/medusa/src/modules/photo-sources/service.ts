import { PhotoSourceError, type PhotoSourceAdapter, type PhotoSourceType } from "./types"

/**
 * The single place callers resolve a source.
 *
 * Route handlers and workflows ask for a `PhotoSourceType` and get back the
 * contract — they never import a provider adapter directly, so adding Google or
 * Dropbox later changes registration and nothing else.
 */
export class PhotoSourceRegistry {
  readonly #adapters = new Map<PhotoSourceType, PhotoSourceAdapter>()

  constructor(adapters: readonly PhotoSourceAdapter[] = []) {
    for (const adapter of adapters) {
      if (this.#adapters.has(adapter.sourceType)) {
        throw new Error(`Duplicate photo source adapter: ${adapter.sourceType}`)
      }
      this.#adapters.set(adapter.sourceType, adapter)
    }
  }

  get available(): PhotoSourceType[] {
    return [...this.#adapters.keys()].sort()
  }

  has(sourceType: string): sourceType is PhotoSourceType {
    return this.#adapters.has(sourceType as PhotoSourceType)
  }

  get(sourceType: string): PhotoSourceAdapter {
    const adapter = this.#adapters.get(sourceType as PhotoSourceType)

    if (!adapter) {
      // Deliberately the same code an unconfigured provider returns, so probing
      // cannot distinguish "not built" from "not enabled here".
      throw new PhotoSourceError("photo_source_unavailable")
    }

    return adapter
  }
}
