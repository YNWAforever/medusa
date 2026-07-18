import {
  PhotoClientError,
  type PhotoAssetView,
  type PhotoJobView,
  type PhotoUploadSessionView,
  type UploadedPart,
} from "./contracts";
import type { PhotoClient } from "./client";
export const MAX_PHOTO_FILES = 500;
export const MAX_PHOTO_JOB_BYTES = 10 * 1024 ** 3;
export const MAX_PHOTO_FILE_BYTES = 50 * 1024 ** 2;
export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
}
export interface UploadResult {
  assetId: string;
  sessionId: string;
}
export interface UploadCallbacks {
  onProgress?: (progress: UploadProgress) => void;
  onSession?: (session: PhotoUploadSessionView) => void;
  signal?: AbortSignal;
}
export interface RestoredUpload {
  id: string;
  name: string;
  bytes: number;
  status: "uploaded" | "failed";
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function crc32cBase64(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0x82f63b78 & -(crc & 1));
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  return base64(
    Uint8Array.from([
      (crc >>> 24) & 255,
      (crc >>> 16) & 255,
      (crc >>> 8) & 255,
      crc & 255,
    ]),
  );
}
export function validateSelection(
  files: readonly File[],
  existing: readonly Pick<PhotoAssetView, "expected_bytes" | "status">[] = [],
): void {
  const active = existing.filter((asset) => asset.status !== "deleted");
  if (active.length + files.length > MAX_PHOTO_FILES)
    throw new PhotoClientError("photo_asset_limit_exceeded");
  if (files.some((file) => file.size > MAX_PHOTO_FILE_BYTES))
    throw new PhotoClientError("photo_file_too_large");
  const total =
    active.reduce((sum, asset) => sum + asset.expected_bytes, 0) +
    files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_PHOTO_JOB_BYTES)
    throw new PhotoClientError("photo_job_bytes_exceeded");
}
export function restoreUploads(job: PhotoJobView): RestoredUpload[] {
  return (job.assets ?? [])
    .filter((asset) => asset.status === "uploaded" || asset.status === "failed")
    .map((asset) => ({
      id: asset.id,
      name: asset.display_name,
      bytes: asset.expected_bytes,
      status: asset.status as "uploaded" | "failed",
    }));
}
async function retry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      if (
        error instanceof PhotoClientError &&
        error.status > 0 &&
        error.status < 500 &&
        error.status !== 429
      )
        throw error;
    }
  }
  throw last;
}
async function signature(file: File): Promise<string> {
  return base64(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
}
export class MultipartUploader {
  constructor(
    private readonly client: PhotoClient,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}
  async upload(
    jobId: string,
    file: File,
    sourceIdempotencyKey: string,
    callbacks: UploadCallbacks = {},
  ): Promise<UploadResult> {
    const input = {
      filename: file.name,
      reportedMime: file.type || "application/octet-stream",
      bytes: file.size,
      sourceIdempotencyKey,
      signatureBase64: await signature(file),
    };
    let session = await this.client.createUpload(
      jobId,
      input,
      callbacks.signal,
    );
    callbacks.onSession?.(session);
    if (session.status === "completed")
      return { assetId: session.assetId, sessionId: session.sessionId };
    try {
      return await this.uploadSession(
        jobId,
        file,
        session,
        callbacks.onProgress ?? (() => {}),
        callbacks.signal,
      );
    } catch (error) {
      if (
        !(error instanceof PhotoClientError) ||
        error.code !== "photo_upload_expired"
      )
        throw error;
      await this.client.abort(jobId, session.sessionId).catch(() => undefined);
      session = await this.client.createUpload(
        jobId,
        {
          ...input,
          sourceIdempotencyKey: `${sourceIdempotencyKey}:replacement:${Date.now()}`,
        },
        callbacks.signal,
      );
      callbacks.onSession?.(session);
      if (session.status === "completed")
        return { assetId: session.assetId, sessionId: session.sessionId };
      return this.uploadSession(
        jobId,
        file,
        session,
        callbacks.onProgress ?? (() => {}),
        callbacks.signal,
      );
    }
  }
  async abort(jobId: string, sessionId: string): Promise<void> {
    await this.client.abort(jobId, sessionId);
  }
  private async uploadSession(
    jobId: string,
    file: File,
    session: PhotoUploadSessionView,
    onProgress: (progress: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<UploadResult> {
    const parts: UploadedPart[] = [];
    let uploadedBytes = 0;
    for (
      let offset = 0, partNumber = 1;
      offset < file.size;
      offset += session.partSize, partNumber += 1
    ) {
      const blob = file.slice(
        offset,
        Math.min(offset + session.partSize, file.size),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const checksumCRC32C = crc32cBase64(bytes);
      const signed = await this.client.signPart(
        jobId,
        session.sessionId,
        partNumber,
        checksumCRC32C,
      );
      const response = await retry(() =>
        this.fetcher(signed.url, {
          method: "PUT",
          body: blob,
          headers: signed.requiredHeaders,
          signal,
        }).then((value) => {
          if (!value.ok)
            throw new PhotoClientError("photo_upload_failed", value.status);
          return value;
        }),
      );
      const etag = response.headers.get("etag");
      if (!etag) throw new PhotoClientError("photo_upload_failed");
      parts.push({ partNumber, etag, checksumCRC32C });
      uploadedBytes += blob.size;
      onProgress({
        uploadedBytes,
        totalBytes: file.size,
        percent: file.size
          ? Math.round((uploadedBytes / file.size) * 100)
          : 100,
      });
    }
    await this.client.complete(jobId, session.sessionId, parts, signal);
    return { assetId: session.assetId, sessionId: session.sessionId };
  }
}
