export type PhotoJobStatus = "draft" | "uploading" | "ready" | "processing" | "completed" | "cancelled" | "expired"
export type PhotoAssetStatus = "pending" | "uploading" | "uploaded" | "failed" | "deleted"

export interface PhotoAssetView {
  id: string
  display_name: string
  expected_bytes: number
  stored_bytes?: number | null
  detected_mime_type?: string | null
  status: PhotoAssetStatus
  failure_code?: string | null
}

export interface PhotoJobView {
  id: string
  locale: "en" | "zh-HK"
  status: PhotoJobStatus
  revision: number
  assets?: PhotoAssetView[]
}

export interface PhotoUploadSessionView {
  assetId: string
  sessionId: string
  partSize: number
  status: string
  expiresAt: string
}

export interface SignedUploadPart {
  url: string
  headers?: Record<string, string>
}

export interface UploadedPart {
  partNumber: number
  etag: string
  checksumCRC32C: string
}

export type PhotoErrorCode =
  | "photo_job_not_found"
  | "photo_job_unavailable"
  | "photo_upload_expired"
  | "photo_upload_not_active"
  | "photo_file_too_large"
  | "photo_asset_limit_exceeded"
  | "photo_job_bytes_exceeded"
  | "photo_upload_failed"

export class PhotoClientError extends Error {
  constructor(public readonly code: PhotoErrorCode | string, public readonly status = 0) {
    super(code)
    this.name = "PhotoClientError"
  }
}

export type RecoveryAction = "retry" | "replace-session" | "remove" | "reload"
