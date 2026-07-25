import { Readable } from "node:stream"

export type PhotoStorageProvider = "s3" | "vercel-blob"
export type PhotoUploadStrategy = "multipart" | "single-put"

export interface PhotoObjectRef {
  provider: PhotoStorageProvider
  key: string
}

export interface PhotoDirectUploadGrant {
  provider: PhotoStorageProvider
  url: string
  expiresAt: string
  requiredHeaders: Record<string, string>
}

export interface PhotoObjectInfo {
  bytes: number
  contentType: string
  etag: string
}

export interface PhotoStorageAdapter {
  createDirectUpload(input: {
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant>
  inspect(key: string): Promise<PhotoObjectInfo>
  readPrefix(key: string, maxBytes: number): Promise<Uint8Array>
  read(key: string): Promise<Readable>
  writePreview(input: {
    key: string
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }>
  signRead(key: string, expiresIn: number): Promise<{
    url: string
    expiresAt: string
  }>
  delete(keys: string[]): Promise<void>
}

export interface LegacyMultipartStorage {
  startMultipartUpload(input: {
    key: string
    contentType: string
  }): Promise<{ uploadId: string }>
  signUploadPart(input: {
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant>
  completeMultipartUpload(input: {
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string }>
  abortMultipartUpload(input: {
    key: string
    uploadId: string
  }): Promise<void>
}

export interface LegacyPhotoObjectStorage {
  startMultipartUpload(input: { key: string; contentType: string }): Promise<{ uploadId: string }>
  signUploadPart(input: { key: string; uploadId: string; partNumber: number; checksumCRC32C: string; expiresIn?: number }): Promise<{ url: string; expiresAt: string; requiredHeaders: Record<string, string> }>
  completeMultipartUpload(input: { key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string; checksumCRC32C: string }> }): Promise<{ etag: string; checksumCRC32C: string }>
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>
  headPrivateObject(key: string): Promise<{ bytes: number; contentType: string; checksumCRC32C: string }>
  readPrivateObjectPrefix(key: string, maxBytes: number): Promise<Uint8Array>
  readPrivateObject(key: string): Promise<Readable>
  writePrivatePreview(input: { key: string; bytes: Buffer; contentType: "image/jpeg" }): Promise<void>
  signPrivateRead(key: string, expiresIn?: number): Promise<{ url: string; expiresAt: string }>
  signPrivateOriginalRead(key: string, expiresIn?: number): Promise<{ url: string; expiresAt: string }>
  deletePrivateObjects(keys: string[]): Promise<void>
}

export interface PhotoObjectStorage {
  readonly defaultProvider: PhotoStorageProvider
  createDirectUpload(input: {
    provider: PhotoStorageProvider
    key: string
    contentType: string
    maxBytes: number
    expiresIn: number
  }): Promise<PhotoDirectUploadGrant>
  inspect(ref: PhotoObjectRef): Promise<PhotoObjectInfo>
  readPrefix(ref: PhotoObjectRef, maxBytes: number): Promise<Uint8Array>
  read(ref: PhotoObjectRef): Promise<Readable>
  writePreview(input: {
    ref: PhotoObjectRef
    bytes: Buffer
    contentType: "image/jpeg"
  }): Promise<{ etag: string }>
  signRead(
    ref: PhotoObjectRef,
    expiresIn: number,
  ): Promise<{ url: string; expiresAt: string }>
  delete(refs: PhotoObjectRef[]): Promise<void>
  startLegacyMultipart(input: {
    provider: "s3"
    key: string
    contentType: string
  }): Promise<{ uploadId: string }>
  signLegacyPart(input: {
    provider: "s3"
    key: string
    uploadId: string
    partNumber: number
    checksumCRC32C: string
    expiresIn?: number
  }): Promise<PhotoDirectUploadGrant>
  completeLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
    parts: Array<{
      partNumber: number
      etag: string
      checksumCRC32C: string
    }>
  }): Promise<{ etag: string }>
  abortLegacyMultipart(input: {
    provider: "s3"
    key: string
    uploadId: string
  }): Promise<void>
}

export interface PhotoS3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  serverSideEncryption?: boolean
}

export interface PhotoStorageConfig extends PhotoS3Config {}

export interface PhotoStorageRuntimeConfig {
  defaultProvider: PhotoStorageProvider
  s3?: PhotoS3Config
  vercelBlob?: { token: string }
}

export class PhotoStorageError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "PhotoStorageError"
    this.code = code
  }
}
