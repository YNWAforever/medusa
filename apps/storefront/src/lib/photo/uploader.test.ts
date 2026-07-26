import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoClientError } from "./contracts";
import {
  crc32cBase64,
  MultipartUploader,
  putFileWithProgress,
  restoreUploads,
  validateSelection,
} from "./uploader";
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7]);
const file = new File([jpeg], "photo.jpg", { type: "image/jpeg" });
function client(overrides: Record<string, unknown> = {}) {
  return {
    createUpload: vi.fn(async () => ({
      assetId: "asset_1",
      sessionId: "session_1",
      strategy: "multipart",
      partSize: 6,
      status: "active",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    })),
    signPart: vi.fn(async () => ({
      url: "https://upload.invalid/part",
      requiredHeaders: {
        "x-amz-checksum-crc32c": "signed",
        "x-amz-sdk-checksum-algorithm": "CRC32C",
      },
    })),
    complete: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    getJob: vi.fn(),
    ...overrides,
  } as any;
}
describe("MultipartUploader", () => {
  it("uploads consecutive parts with every required signed header", async () => {
    const api = client();
    const put = vi.fn(
      async () =>
        new Response(null, { status: 200, headers: { etag: "etag" } }),
    );
    const progress: number[] = [];
    await new MultipartUploader(api, put as any).upload(
      "job_1",
      file,
      "source_1",
      { onProgress: (value) => progress.push(value.percent) },
    );
    expect(api.signPart.mock.calls.map((call: unknown[]) => call[2])).toEqual([
      1, 2,
    ]);
    expect(put).toHaveBeenCalledWith(
      "https://upload.invalid/part",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-amz-sdk-checksum-algorithm": "CRC32C",
        }),
      }),
    );
    expect(api.complete).toHaveBeenCalled();
    expect(progress.at(-1)).toBe(100);
  });
  it("retries a transient part failure without creating another asset", async () => {
    const api = client();
    const put = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(
        new Response(null, { status: 200, headers: { etag: "etag" } }),
      );
    await new MultipartUploader(api, put as any).upload(
      "job_1",
      file,
      "stable-key",
    );
    expect(api.createUpload).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(3);
  });
  it("reconciles a lost completion response without any further upload mutation", async () => {
    const createUpload = vi.fn(async (
      _jobId: string,
      _input: { sourceIdempotencyKey: string },
    ) => ({
      assetId: "asset_1",
      sessionId: "session_1",
      strategy: "single-put",
      status: "completed",
      expiresAt: new Date().toISOString(),
    }));
    const api = client({ createUpload });
    const multipartPut = vi.fn();
    const directPut = vi.fn();

    await expect(
      new MultipartUploader(api, multipartPut as any, directPut).upload(
        "job_1",
        file,
        "stable-key",
      ),
    ).resolves.toEqual({ assetId: "asset_1", sessionId: "session_1" });

    expect(createUpload).toHaveBeenCalledTimes(1);
    expect(createUpload.mock.calls[0]?.[1]).toMatchObject({
      sourceIdempotencyKey: "stable-key",
    });
    expect(api.signPart).not.toHaveBeenCalled();
    expect(multipartPut).not.toHaveBeenCalled();
    expect(directPut).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
    expect(api.abort).not.toHaveBeenCalled();
  });

  it("aborts and replaces an expired session", async () => {
    const api = client({
      signPart: vi
        .fn()
        .mockRejectedValueOnce(
          new PhotoClientError("photo_upload_expired", 409),
        )
        .mockResolvedValue({
          url: "https://upload.invalid/part",
          requiredHeaders: {},
        }),
    });
    const controller = new AbortController();
    const put = vi.fn(
      async () =>
        new Response(null, { status: 200, headers: { etag: "etag" } }),
    );
    await new MultipartUploader(api, put as any).upload(
      "job_1",
      file,
      "source",
      { signal: controller.signal },
    );
    expect(api.abort).toHaveBeenCalledWith("job_1", "session_1");
    expect(api.createUpload).toHaveBeenCalledTimes(2);
    expect(api.createUpload.mock.calls[1]?.[2]).toBe(controller.signal);
    expect(api.signPart.mock.calls[1]?.[4]).toBe(controller.signal);
  });
  it("reports sessions so the UI can abort active uploads", async () => {
    const api = client();
    const sessions: string[] = [];
    const put = vi.fn(
      async () =>
        new Response(null, { status: 200, headers: { etag: "etag" } }),
    );
    await new MultipartUploader(api, put as any).upload(
      "job_1",
      file,
      "source",
      { onSession: (session) => sessions.push(session.sessionId) },
    );
    expect(sessions).toEqual(["session_1"]);
  });
  it("rejects client-known limits before network calls", () => {
    expect(() =>
      validateSelection(
        Array.from({ length: 300 }, () => file),
        Array.from({ length: 201 }, () => ({
          expected_bytes: 12,
          status: "uploading" as const,
        })),
      ),
    ).toThrow("photo_asset_limit_exceeded");
    expect(() => validateSelection([{ size: 51 * 1024 ** 2 } as File])).toThrow(
      "photo_file_too_large",
    );
  });
  it("restores uploaded and failed placeholders", () => {
    expect(
      restoreUploads({
        id: "job",
        locale: "en",
        revision: 1,
        status: "uploading",
        assets: [
          {
            id: "a",
            display_name: "a.jpg",
            expected_bytes: 12,
            status: "uploaded",
          },
        ],
      }),
    ).toEqual([{ id: "a", name: "a.jpg", bytes: 12, status: "uploaded" }]);
  });
  it("computes the standard CRC32C value", () => {
    expect(crc32cBase64(new TextEncoder().encode("123456789"))).toBe(
      "4waSgw==",
    );
  });
  it("cancels an in-flight part PUT with the supplied signal", async () => {
    const api = client();
    const controller = new AbortController();
    const put = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(
      new MultipartUploader(api, put as any).upload("job_1", file, "source", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(put).toHaveBeenCalledTimes(1);
    expect(api.complete).not.toHaveBeenCalled();
  });
});


describe("single-PUT uploader", () => {
  it("sends the whole File exactly once and completes with the provider ETag", async () => {
    const api = client({
      createUpload: vi.fn(async () => ({
        assetId: "asset_1",
        sessionId: "session_1",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/signed",
        requiredHeaders: { "content-type": "image/jpeg" },
        status: "active",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      })),
    });
    const multipartPut = vi.fn();
    const progress: number[] = [];
    const directPut = vi.fn(async (
      url: string,
      body: File,
      headers: Record<string, string>,
      onProgress: (value: { uploadedBytes: number; totalBytes: number; percent: number }) => void,
    ) => {
      expect(url).toBe("https://blob.invalid/signed");
      expect(body).toBe(file);
      expect(headers).toEqual({ "content-type": "image/jpeg" });
      onProgress({ uploadedBytes: 6, totalBytes: 12, percent: 50 });
      onProgress({ uploadedBytes: 12, totalBytes: 12, percent: 100 });
      return '"blob-etag"';
    });

    await new MultipartUploader(api, multipartPut as any, directPut).upload(
      "job_1",
      file,
      "source_1",
      { onProgress: (value) => progress.push(value.percent) },
    );

    expect(directPut).toHaveBeenCalledTimes(1);
    expect(api.signPart).not.toHaveBeenCalled();
    expect(multipartPut).not.toHaveBeenCalled();
    expect(api.complete).toHaveBeenCalledWith(
      "job_1",
      "session_1",
      { strategy: "single-put", etag: '"blob-etag"' },
      undefined,
    );
    expect(progress).toEqual([50, 100]);
  });

  it("replaces an already-expired session before sending provider bytes", async () => {
    const createUpload = vi
      .fn()
      .mockResolvedValueOnce({
        assetId: "asset_expired",
        sessionId: "session_expired",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/expired",
        requiredHeaders: { "content-type": "image/jpeg" },
        status: "active",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      })
      .mockResolvedValueOnce({
        assetId: "asset_replacement",
        sessionId: "session_replacement",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/replacement",
        requiredHeaders: { "content-type": "image/jpeg" },
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    const api = client({ createUpload });
    const directPut = vi.fn(async () => '"replacement-etag"');

    await new MultipartUploader(api, vi.fn() as any, directPut).upload(
      "job_1",
      file,
      "source",
    );

    expect(api.abort).toHaveBeenCalledWith("job_1", "session_expired");
    expect(createUpload).toHaveBeenCalledTimes(2);
    expect(createUpload.mock.calls[1]?.[1]).toMatchObject({
      sourceIdempotencyKey: "source:replacement:1",
    });
    expect(directPut).toHaveBeenCalledTimes(1);
    expect(directPut).toHaveBeenCalledWith(
      "https://blob.invalid/replacement",
      file,
      { "content-type": "image/jpeg" },
      expect.any(Function),
      undefined,
    );
    expect(api.complete).toHaveBeenCalledWith(
      "job_1",
      "session_replacement",
      { strategy: "single-put", etag: '"replacement-etag"' },
      undefined,
    );
  });

  it("recovers when stable create finds an expired idempotent session", async () => {
    const createUpload = vi
      .fn()
      .mockRejectedValueOnce(new PhotoClientError("photo_upload_expired", 409))
      .mockResolvedValueOnce({
        assetId: "asset_replacement",
        sessionId: "session_replacement",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/replacement",
        requiredHeaders: {},
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    const api = client({ createUpload });
    const directPut = vi.fn(async () => '"replacement-etag"');

    await new MultipartUploader(api, vi.fn() as any, directPut).upload(
      "job_1",
      file,
      "source",
    );

    expect(createUpload).toHaveBeenCalledTimes(2);
    expect(createUpload.mock.calls[1]?.[1]).toMatchObject({
      sourceIdempotencyKey: "source:replacement:1",
    });
    expect(api.abort).not.toHaveBeenCalled();
    expect(directPut).toHaveBeenCalledTimes(1);
    expect(api.complete).toHaveBeenCalledWith(
      "job_1",
      "session_replacement",
      { strategy: "single-put", etag: '"replacement-etag"' },
      undefined,
    );
  });

  it("replays the same replacement generation after its response was lost", async () => {
    const createUpload = vi
      .fn()
      .mockRejectedValueOnce(
        new PhotoClientError("photo_upload_not_active", 409),
      )
      .mockRejectedValueOnce(new TypeError("replacement response lost"))
      .mockResolvedValueOnce({
        assetId: "asset_replacement",
        sessionId: "session_replacement",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/replacement",
        requiredHeaders: {},
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    const api = client({ createUpload });
    const directPut = vi.fn(async () => '"replacement-etag"');

    await new MultipartUploader(api, vi.fn() as any, directPut).upload(
      "job_1",
      file,
      "source",
    );

    expect(
      createUpload.mock.calls.map((call: unknown[]) => {
        const input = call[1] as { sourceIdempotencyKey: string };
        return input.sourceIdempotencyKey;
      }),
    ).toEqual([
      "source",
      "source:replacement:1",
      "source:replacement:1",
    ]);
    expect(api.abort).not.toHaveBeenCalled();
    expect(directPut).toHaveBeenCalledTimes(1);
    expect(api.complete).toHaveBeenCalledWith(
      "job_1",
      "session_replacement",
      { strategy: "single-put", etag: '"replacement-etag"' },
      undefined,
    );
  });

  it("reconciles an elapsed completed replacement without aborting or advancing", async () => {
    const createUpload = vi
      .fn()
      .mockRejectedValueOnce(
        new PhotoClientError("photo_upload_not_active", 409),
      )
      .mockResolvedValueOnce({
        assetId: "asset_completed",
        sessionId: "session_completed",
        strategy: "single-put",
        status: "completed",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
    const api = client({ createUpload });
    const directPut = vi.fn();

    await expect(
      new MultipartUploader(api, vi.fn() as any, directPut).upload(
        "job_1",
        file,
        "source",
      ),
    ).resolves.toEqual({
      assetId: "asset_completed",
      sessionId: "session_completed",
    });

    expect(
      createUpload.mock.calls.map((call: unknown[]) => {
        const input = call[1] as { sourceIdempotencyKey: string };
        return input.sourceIdempotencyKey;
      }),
    ).toEqual(["source", "source:replacement:1"]);
    expect(api.abort).not.toHaveBeenCalled();
    expect(directPut).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("advances to the next deterministic generation when a replacement expired", async () => {
    const createUpload = vi
      .fn()
      .mockRejectedValueOnce(
        new PhotoClientError("photo_upload_not_active", 409),
      )
      .mockRejectedValueOnce(new PhotoClientError("photo_upload_expired", 409))
      .mockResolvedValueOnce({
        assetId: "asset_replacement_2",
        sessionId: "session_replacement_2",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/replacement-2",
        requiredHeaders: {},
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    const api = client({ createUpload });
    const directPut = vi.fn(async () => '"replacement-2-etag"');

    await new MultipartUploader(api, vi.fn() as any, directPut).upload(
      "job_1",
      file,
      "source",
    );

    expect(
      createUpload.mock.calls.map((call: unknown[]) => {
        const input = call[1] as { sourceIdempotencyKey: string };
        return input.sourceIdempotencyKey;
      }),
    ).toEqual([
      "source",
      "source:replacement:1",
      "source:replacement:2",
    ]);
    expect(api.abort).not.toHaveBeenCalled();
    expect(directPut).toHaveBeenCalledWith(
      "https://blob.invalid/replacement-2",
      file,
      {},
      expect.any(Function),
      undefined,
    );
  });

  it("does not advance generations after arbitrary transient create failures", async () => {
    const transient = new PhotoClientError("photo_job_unavailable", 503);
    const createUpload = vi
      .fn()
      .mockRejectedValueOnce(
        new PhotoClientError("photo_upload_not_active", 409),
      )
      .mockRejectedValue(transient);
    const api = client({ createUpload });

    await expect(
      new MultipartUploader(api, vi.fn() as any, vi.fn()).upload(
        "job_1",
        file,
        "source",
      ),
    ).rejects.toBe(transient);

    expect(
      createUpload.mock.calls.map((call: unknown[]) => {
        const input = call[1] as { sourceIdempotencyKey: string };
        return input.sourceIdempotencyKey;
      }),
    ).toEqual([
      "source",
      "source:replacement:1",
      "source:replacement:1",
      "source:replacement:1",
    ]);
    expect(api.abort).not.toHaveBeenCalled();
  });

  it("fails stably when every bounded replacement generation is unavailable", async () => {
    const createUpload = vi
      .fn()
      .mockRejectedValue(
        new PhotoClientError("photo_upload_not_active", 409),
      );
    const api = client({ createUpload });

    await expect(
      new MultipartUploader(api, vi.fn() as any, vi.fn()).upload(
        "job_1",
        file,
        "source",
      ),
    ).rejects.toMatchObject({ code: "photo_upload_failed" });

    expect(
      createUpload.mock.calls.map((call: unknown[]) => {
        const input = call[1] as { sourceIdempotencyKey: string };
        return input.sourceIdempotencyKey;
      }),
    ).toEqual([
      "source",
      "source:replacement:1",
      "source:replacement:2",
      "source:replacement:3",
      "source:replacement:4",
      "source:replacement:5",
    ]);
    expect(api.abort).not.toHaveBeenCalled();
  });
  it("does not replace a generic direct PUT failure for an active grant", async () => {
    const api = client({
      createUpload: vi.fn(async () => ({
        assetId: "asset_1",
        sessionId: "session_1",
        strategy: "single-put",
        uploadUrl: "https://blob.invalid/signed",
        requiredHeaders: {},
        status: "active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
    });
    const failure = new PhotoClientError("photo_upload_failed", 503);
    const directPut = vi.fn(async () => {
      throw failure;
    });

    await expect(
      new MultipartUploader(api, vi.fn() as any, directPut).upload(
        "job_1",
        file,
        "source",
      ),
    ).rejects.toBe(failure);

    expect(api.createUpload).toHaveBeenCalledTimes(1);
    expect(api.abort).not.toHaveBeenCalled();
    expect(directPut).toHaveBeenCalledTimes(1);
    expect(api.complete).not.toHaveBeenCalled();
  });
  it("retains the CRC32C multipart completion path", async () => {
    const api = client();
    const multipartPut = vi.fn(async () =>
      new Response(null, { status: 200, headers: { etag: "part-etag" } }),
    );

    await new MultipartUploader(api, multipartPut as any, vi.fn()).upload(
      "job_1",
      file,
      "source_1",
    );

    expect(api.complete).toHaveBeenCalledWith(
      "job_1",
      "session_1",
      {
        strategy: "multipart",
        parts: [
          { partNumber: 1, etag: "part-etag", checksumCRC32C: expect.any(String) },
          { partNumber: 2, etag: "part-etag", checksumCRC32C: expect.any(String) },
        ],
      },
      undefined,
    );
  });
});

type ProgressHandler = ((event: { loaded: number; total: number }) => void) | null;
type EventHandler = (() => void) | null;

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  readonly upload = { onprogress: null as ProgressHandler };
  readonly open = vi.fn();
  readonly setRequestHeader = vi.fn();
  readonly send = vi.fn();
  readonly abort = vi.fn(() => this.onabort?.());
  status = 0;
  etag: string | null = null;
  onload: EventHandler = null;
  onerror: EventHandler = null;
  ontimeout: EventHandler = null;
  onabort: EventHandler = null;

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === "etag" ? this.etag : null;
  }
}

describe("putFileWithProgress", () => {
  afterEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sets only required headers, sends once, and reports monotonic progress", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const progress: Array<{ uploadedBytes: number; totalBytes: number; percent: number }> = [];

    const result = putFileWithProgress(
      "https://blob.invalid/signed",
      file,
      { "content-type": "image/jpeg", "x-required": "signed-value" },
      (value) => progress.push(value),
      controller.signal,
    );
    const xhr = FakeXMLHttpRequest.instances[0]!;
    xhr.upload.onprogress?.({ loaded: 6, total: 12 });
    xhr.upload.onprogress?.({ loaded: 3, total: 12 });
    xhr.upload.onprogress?.({ loaded: 12, total: 12 });
    xhr.status = 201;
    xhr.etag = '"blob-etag"';
    xhr.onload?.();

    await expect(result).resolves.toBe('"blob-etag"');
    expect(xhr.open).toHaveBeenCalledWith("PUT", "https://blob.invalid/signed");
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ["content-type", "image/jpeg"],
      ["x-required", "signed-value"],
    ]);
    expect(xhr.send).toHaveBeenCalledTimes(1);
    expect(xhr.send).toHaveBeenCalledWith(file);
    expect(progress.map((value) => value.uploadedBytes)).toEqual([6, 6, 12]);
    expect(progress.map((value) => value.percent)).toEqual([50, 50, 100]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not report 100 percent before all bytes are uploaded", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const nearCompleteFile = new File(
      [new Uint8Array(1000)],
      "near-complete.jpg",
      { type: "image/jpeg" },
    );
    const progress: Array<{ uploadedBytes: number; totalBytes: number; percent: number }> = [];
    const result = putFileWithProgress(
      "https://blob.invalid/signed",
      nearCompleteFile,
      {},
      (value) => progress.push(value),
    );
    const xhr = FakeXMLHttpRequest.instances[0]!;

    xhr.upload.onprogress?.({ loaded: 995, total: 1000 });
    xhr.status = 200;
    xhr.etag = '"blob-etag"';
    xhr.onload?.();

    await expect(result).resolves.toBe('"blob-etag"');
    expect(progress).toEqual([
      { uploadedBytes: 995, totalBytes: 1000, percent: 99 },
      { uploadedBytes: 1000, totalBytes: 1000, percent: 100 },
    ]);
  });
  it.each([
    { status: 204, etag: " " },
    { status: 500, etag: '"blob-etag"' },
  ])("rejects invalid status or ETag with the stable failure code", async ({ status, etag }) => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = putFileWithProgress(
      "https://blob.invalid/signed",
      file,
      {},
      vi.fn(),
      controller.signal,
    );
    const xhr = FakeXMLHttpRequest.instances[0]!;
    xhr.status = status;
    xhr.etag = etag;
    xhr.onload?.();

    await expect(result).rejects.toMatchObject({ code: "photo_upload_failed" });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each(["onerror", "ontimeout"] as const)(
    "rejects %s and removes the abort listener",
    async (eventName) => {
      vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const result = putFileWithProgress(
        "https://blob.invalid/signed",
        file,
        {},
        vi.fn(),
        controller.signal,
      );
      const xhr = FakeXMLHttpRequest.instances[0]!;
      xhr[eventName]?.();

      await expect(result).rejects.toMatchObject({ code: "photo_upload_failed" });
      expect(remove).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects an already-aborted signal without starting an XHR", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const controller = new AbortController();
    controller.abort();

    await expect(putFileWithProgress(
      "https://blob.invalid/signed",
      file,
      {},
      vi.fn(),
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXMLHttpRequest.instances).toHaveLength(0);
  });

  it("aborts mid-flight once and removes the listener before later events", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = putFileWithProgress(
      "https://blob.invalid/signed",
      file,
      {},
      vi.fn(),
      controller.signal,
    );
    const xhr = FakeXMLHttpRequest.instances[0]!;

    controller.abort();
    xhr.status = 200;
    xhr.etag = '"late-etag"';
    xhr.onload?.();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
