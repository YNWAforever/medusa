import type { PhotoSettings } from "./settings"

export type PhotoJobStatus = "draft" | "uploading" | "ready" | "cart_attached" | "ordered" | "processing" | "failed" | "completed" | "cancelled" | "expired"
export type PhotoAssetStatus = "pending" | "uploading" | "uploaded" | "processing" | "ready" | "blocked" | "failed" | "deleted"
export type PhotoQualityBand = "good" | "caution" | "poor"
export type PhotoWarningView = string | { code: string; acknowledged?: boolean }
export interface PhotoAssetView {
  id: string
  display_name: string
  expected_bytes: number
  stored_bytes?: number | null
  detected_mime_type?: string | null
  status: PhotoAssetStatus
  failure_code?: string | null
  width?: number | null
  height?: number | null
  orientation?: number | null
  quality_band?: PhotoQualityBand | null
  estimated_ppi?: number | null
  warnings?: PhotoWarningView[] | null
  errors?: string[] | null
  processing_attempts?: number
}
export interface PhotoPrintItemView {
  asset_id: string
  finish: PhotoSettings["finish"]
  border: PhotoSettings["border"]
  crop_mode: PhotoSettings["cropMode"]
  crop: PhotoSettings["crop"]
  quantity: number
  warning_acknowledgements?: string[]
}
export interface PhotoActiveVersionView { id: string; defaults: PhotoSettings; items: PhotoPrintItemView[] }
export interface PhotoJobView {
  id: string
  locale: "en" | "zh-HK"
  status: PhotoJobStatus
  revision: number
  active_version_id?: string | null
  active_version?: PhotoActiveVersionView | null
  assets?: PhotoAssetView[]
}

type PhotoUploadSessionBase = {
  assetId: string
  sessionId: string
  status: string
  expiresAt: string
}

export type PhotoUploadSessionView =
  | PhotoUploadSessionBase & {
      strategy: "single-put"
      uploadUrl: string
      requiredHeaders: Record<string, string>
      partSize?: never
    }
  | PhotoUploadSessionBase & {
      strategy: "multipart"
      partSize: number
      uploadUrl?: never
      requiredHeaders?: never
    }

export interface SignedUploadPart { url: string; requiredHeaders: Record<string, string> }
export interface UploadedPart { partNumber: number; etag: string; checksumCRC32C: string }
export type PhotoUploadCompletion =
  | { strategy: "single-put"; etag: string }
  | { strategy: "multipart"; parts: UploadedPart[] }
export type PhotoErrorCode = "photo_job_not_found" | "photo_job_conflict" | "photo_job_unavailable" | "photo_upload_expired" | "photo_upload_not_active" | "photo_file_too_large" | "photo_asset_limit_exceeded" | "photo_job_bytes_exceeded" | "photo_upload_failed"
export class PhotoClientError extends Error { constructor(public readonly code: PhotoErrorCode | string, public readonly status = 0) { super(code); this.name = "PhotoClientError" } }
export type RecoveryAction = "retry" | "replace-session" | "remove" | "reload"
