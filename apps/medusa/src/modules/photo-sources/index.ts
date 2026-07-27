/**
 * Phase 2C provider-neutral photo ingestion.
 *
 * Not registered as a Medusa module yet: it owns no models until the import
 * session lands, and the adapters are plain injected services. Registration in
 * medusa-config.ts happens with the session table.
 */
export {
  PhotoSourceError,
  sourceIdempotencyKey,
  type NormalizedPhotoSourceItem,
  type PhotoSourceAdapter,
  type PhotoSourceErrorCode,
  type PhotoSourceType,
  type SourceSessionStart,
} from "./types"

export {
  CURRENT_KEY_VERSION,
  PROVIDER_TOKEN_KEY_ENV,
  ProviderTokenVault,
  type SealedProviderSecret,
  type TokenVaultContext,
} from "./token-vault"

export {
  DevicePhotoSourceAdapter,
  InMemoryPhotoSourceSessionStore,
  deviceImportSessionId,
  devicePhotoJobId,
  type DeviceAdapterDependencies,
  type DevicePhotoAssetRecord,
  type PhotoSourceSessionRecord,
  type PhotoSourceSessionStore,
} from "./device-adapter"

export { Crc32c, crc32c } from "./crc32c"

export {
  DEFAULT_IDLE_TIMEOUT_MS,
  MAX_INGEST_BYTES,
  PhotoIngestError,
  copyPhotoStream,
  type CopyPhotoStreamInput,
  type PhotoIngestFailureCode,
  type PhotoIngestResult,
} from "./ingest-stream"

export { PhotoSourceRegistry } from "./service"
