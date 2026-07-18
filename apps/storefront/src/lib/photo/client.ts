import {
  PhotoClientError,
  type PhotoJobView,
  type PhotoUploadSessionView,
  type SignedUploadPart,
  type UploadedPart,
} from "./contracts";

type Fetcher = typeof fetch;

async function json<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string };
  } & T;
  if (!response.ok)
    throw new PhotoClientError(
      body.error?.code ?? "photo_job_unavailable",
      response.status,
    );
  return body;
}

export function createPhotoClient(fetcher: Fetcher = fetch) {
  return {
    async getJob(jobId: string): Promise<PhotoJobView> {
      const body = await json<{ photo_job?: PhotoJobView; job?: PhotoJobView }>(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}`,
      );
      return body.photo_job ?? body.job ?? (body as unknown as PhotoJobView);
    },
    async createUpload(
      jobId: string,
      input: {
        filename: string;
        reportedMime: string;
        bytes: number;
        sourceIdempotencyKey: string;
        signatureBase64: string;
      },
      signal?: AbortSignal,
    ): Promise<PhotoUploadSessionView> {
      const body = await json<{ upload: PhotoUploadSessionView }>(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}/uploads`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal,
        },
      );
      return body.upload;
    },
    async signPart(
      jobId: string,
      sessionId: string,
      partNumber: number,
      checksumCRC32C: string,
      signal?: AbortSignal,
    ): Promise<SignedUploadPart> {
      const body = await json<{ part: SignedUploadPart }>(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}/uploads/${encodeURIComponent(sessionId)}/parts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ partNumber, checksumCRC32C }),
          signal,
        },
      );
      return body.part;
    },
    async complete(
      jobId: string,
      sessionId: string,
      parts: UploadedPart[],
      signal?: AbortSignal,
    ): Promise<void> {
      await json(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}/uploads/${encodeURIComponent(sessionId)}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parts }),
          signal,
        },
      );
    },
    async deleteAsset(jobId: string, assetId: string): Promise<void> {
      await json(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
    },
    async abort(jobId: string, sessionId: string): Promise<void> {
      await json(
        fetcher,
        `/api/photo-jobs/${encodeURIComponent(jobId)}/uploads/${encodeURIComponent(sessionId)}/abort`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
    },
  };
}

export type PhotoClient = ReturnType<typeof createPhotoClient>;
