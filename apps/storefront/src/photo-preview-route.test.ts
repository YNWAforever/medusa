import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/photo-jobs/[jobId]/assets/[assetId]/preview/route";

vi.mock("server-only", () => ({}));

describe("photo preview BFF", () => {
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.test";
    process.env.MEDUSA_PUBLISHABLE_KEY = "pk_test";
    process.env.STOREFRONT_SESSION_SECRET = "test-secret";
    process.env.STOREFRONT_ORIGIN = "https://storefront.test";
    vi.restoreAllMocks();
  });

  it("forwards only a private no-store redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://signed.test/preview?secret=1" },
          }),
      ),
    );
    const response = await GET(
      new NextRequest(
        "https://storefront.test/api/photo-jobs/job_1/assets/asset_1/preview",
      ),
      { params: Promise.resolve({ jobId: "job_1", assetId: "asset_1" }) },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://signed.test/preview?secret=1",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [upstreamUrl, upstreamInit] = vi.mocked(fetch).mock.calls[0];
    expect(upstreamUrl.toString()).toBe(
      "https://medusa.test/store/photo-jobs/job_1/assets/asset_1/preview",
    );
    expect(upstreamInit).toEqual({
      cache: "no-store",
      headers: { "x-publishable-api-key": "pk_test" },
      redirect: "manual",
    });
  });

  it("does not forward malformed upstream redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 302 })),
    );
    const response = await GET(
      new NextRequest(
        "https://storefront.test/api/photo-jobs/job_1/assets/asset_1/preview",
      ),
      { params: Promise.resolve({ jobId: "job_1", assetId: "asset_1" }) },
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
