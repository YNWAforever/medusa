import { expect, test, type Page } from "@playwright/test";

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7,
]);
const zh = {
  workspace: "\u76f8\u7247\u5de5\u4f5c\u5340",
  uploaded: "\u5df2\u4e0a\u8f09",
};

type UploadRequest = {
  filename: string;
  sourceIdempotencyKey: string;
};

type PutRequest = {
  body: Buffer;
  contentType: string | null;
  expired: boolean;
  url: string;
};

async function mockUpload(page: Page, options: { expireFirst?: boolean } = {}) {
  const uploadRequests: UploadRequest[] = [];
  const sessions: Array<{
    assetId: string;
    sessionId: string;
    uploadUrl: string;
  }> = [];
  const puts: PutRequest[] = [];
  const completions: Record<string, unknown>[] = [];

  await page.route("**/api/photo-jobs/job_1", async (route) =>
    route.fulfill({
      json: {
        photo_job: {
          id: "job_1",
          locale: "en",
          revision: 1,
          status: "uploading",
        },
      },
      headers: { "cache-control": "no-store" },
    }),
  );
  await page.route("**/api/photo-jobs/job_1/uploads", async (route) => {
    const request = await route.request().postDataJSON() as UploadRequest;
    uploadRequests.push(request);
    const attempt = uploadRequests.length;
    const expired = options.expireFirst === true && attempt === 1;
    const session = {
      assetId: `asset_${attempt}`,
      sessionId: `session_${attempt}`,
      uploadUrl: expired ? "/signed/photo-put-expired" : "/signed/photo-put",
    };
    sessions.push(session);
    return route.fulfill({
      json: {
        upload: {
          ...session,
          strategy: "single-put",
          requiredHeaders: { "content-type": "image/jpeg" },
          status: "active",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
  });
  await page.route("**/signed/photo-put*", async (route) => {
    const url = route.request().url();
    const expired = url.includes("photo-put-expired");
    puts.push({
      body: route.request().postDataBuffer() ?? Buffer.alloc(0),
      contentType: await route.request().headerValue("content-type"),
      expired,
      url,
    });
    return route.fulfill(
      expired
        ? { status: 403 }
        : { status: 200, headers: { etag: '"etag-1"' } },
    );
  });
  await page.route(
    "**/api/photo-jobs/job_1/uploads/session_*/complete",
    async (route) => {
      completions.push(
        await route.request().postDataJSON() as Record<string, unknown>,
      );
      const sessionId = new URL(route.request().url()).pathname
        .split("/").at(-2);
      const session = sessions.find((candidate) =>
        candidate.sessionId === sessionId
      );
      return route.fulfill({
        json: {
          asset: {
            id: session?.assetId ?? "asset_1",
            status: "uploaded",
          },
        },
      });
    },
  );
  await page.route(
    "**/api/photo-jobs/job_1/uploads/session_*/abort",
    (route) => route.fulfill({ json: { upload: { status: "aborted" } } }),
  );
  await page.route("**/api/photo-jobs/job_1/assets/asset_*", async (route) =>
    route.fulfill({ json: { asset: { id: "asset_1", status: "deleted" } } }),
  );

  return { completions, puts, sessions, uploadRequests };
}

async function browserJson(
  page: Page,
  method: "POST" | "DELETE",
  url: string,
  data: unknown,
) {
  return page.evaluate(async ({ method, url, data }) => {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await response.json(),
    };
  }, { method, url, data });
}

test("uploads and restores a direct-PUT photo in the localized workspace", async ({
  page,
}, testInfo) => {
  const state = await mockUpload(page);
  const locale = testInfo.project.name.includes("mobile") ? "zh-HK" : "en";
  await page.goto(`/photo-upload-e2e?locale=${locale}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    locale === "en" ? "Photo workspace" : zh.workspace,
  );
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "holiday.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await expect(
    page.getByText(locale === "en" ? "Uploaded" : zh.uploaded),
  ).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByRole("progressbar", {
    name: `holiday.jpg: ${locale === "en" ? "Uploaded" : zh.uploaded}`,
  })).toHaveJSProperty("value", 100);
  expect(state.puts).toHaveLength(1);
  expect(state.puts[0]).toMatchObject({
    body: jpeg,
    contentType: "image/jpeg",
    expired: false,
  });
  expect(state.completions).toEqual([{ etag: '"etag-1"' }]);

  await page.reload();
  await expect(page.getByText("holiday.jpg")).toBeVisible();
  await expect(
    page.getByText(locale === "en" ? "Uploaded" : zh.uploaded),
  ).toBeVisible();
  await page.screenshot({
    path: `../../docs/verification/evidence/photo-upload-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("replaces an expired direct grant and reaches 100 percent", async ({
  page,
}) => {
  const state = await mockUpload(page, { expireFirst: true });
  await page.goto("/photo-upload-e2e?locale=en");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "expired.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });

  await expect(page.getByText("Uploaded")).toBeVisible();
  await expect(page.getByRole("progressbar", {
    name: "expired.jpg: Uploaded",
  })).toHaveJSProperty("value", 100);
  expect(state.puts.map((put) => put.expired)).toEqual([true, false]);
  expect(state.sessions).toHaveLength(2);
  expect(state.sessions[0].sessionId).not.toBe(state.sessions[1].sessionId);
  expect(state.sessions[0].uploadUrl).not.toBe(state.sessions[1].uploadUrl);
  expect(state.uploadRequests[1].sourceIdempotencyKey).toBe(
    `${state.uploadRequests[0].sourceIdempotencyKey}:replacement:1`,
  );
  expect(state.completions).toEqual([{ etag: '"etag-1"' }]);
});

test("uploads and completes a signed direct PUT from the browser origin", async ({
  page,
}) => {
  test.skip(
    process.env.FOTOMAX_E2E_MOCKED === "1",
    "requires the local Medusa and private MinIO services",
  );
  await page.goto("/en");
  const created = await browserJson(page, "POST", "/api/photo-jobs", {
    locale: "en",
  });
  expect(created.ok, JSON.stringify(created.payload)).toBe(true);
  const jobId = created.payload.photo_job.id as string;
  const started = await browserJson(
    page,
    "POST",
    `/api/photo-jobs/${jobId}/uploads`,
    {
      filename: "cors-probe.jpg",
      reportedMime: "image/jpeg",
      bytes: jpeg.length,
      sourceIdempotencyKey: `cors-${Date.now()}`,
      signatureBase64: jpeg.toString("base64"),
    },
  );
  expect(started.ok, JSON.stringify(started.payload)).toBe(true);
  const upload = started.payload.upload;
  expect(upload).toMatchObject({
    strategy: "single-put",
    uploadUrl: expect.any(String),
    requiredHeaders: { "content-type": "image/jpeg" },
  });

  const put = await page.evaluate(
    async ({ url, requiredHeaders, bytes }) => {
      const response = await fetch(url, {
        method: "PUT",
        headers: requiredHeaders,
        body: new Uint8Array(bytes),
      });
      return { status: response.status, etag: response.headers.get("etag") };
    },
    {
      url: upload.uploadUrl,
      requiredHeaders: upload.requiredHeaders,
      bytes: [...jpeg],
    },
  );
  expect(put).toMatchObject({ status: 200, etag: expect.any(String) });
  const completed = await browserJson(
    page,
    "POST",
    `/api/photo-jobs/${jobId}/uploads/${upload.sessionId}/complete`,
    { etag: put.etag },
  );
  expect(completed.ok, JSON.stringify(completed.payload)).toBe(true);
  expect(completed.payload.asset).toMatchObject({
    id: upload.assetId,
    status: "uploaded",
  });
});
