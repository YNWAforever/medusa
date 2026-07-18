export interface PhotoObjectStorage {
  startMultipartUpload(input: { key: string; contentType: string }): Promise<{ uploadId: string }>
  signUploadPart(input: {
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<{
    url: string
    expiresAt: string
    requiredHeaders: Record<string, string>
  }>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{ partNumber: number; etag: string; checksumCRC32C: string }>
  }): Promise<{ etag: string; checksumCRC32C: string }>
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>
  headPrivateObject(key: string): Promise<{
    bytes: number
    contentType: string
    checksumCRC32C: string
  }>
  readPrivateObjectPrefix(key: string, maxBytes: number): Promise<Uint8Array>
  deletePrivateObjects(keys: string[]): Promise<void>
}

export interface PhotoStorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export class PhotoStorageError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "PhotoStorageError"
    this.code = code
  }
}
