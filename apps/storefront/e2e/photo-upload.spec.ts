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

type MockUploadOptions = {
  expireFirst?: boolean;
  failFirstCompletionBeforeCommit?: boolean;
  providerFailureStatus?: 401 | 403;
};

async function mockUpload(page: Page, options: MockUploadOptions = {}) {
  const uploadRequests: UploadRequest[] = [];
  const sessions: Array<{
    assetId: string;
    expiresAt: string;
    sessionId: string;
    uploadUrl: string;
  }> = [];
  const puts: PutRequest[] = [];
  const completions: Record<string, unknown>[] = [];
  const aborts: string[] = [];
  const completionCommits: string[] = [];
  const sessionsBySource = new Map<string, (typeof sessions)[number]>();
  let completionAttempts = 0;

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
    const existing = sessionsBySource.get(request.sourceIdempotencyKey);
    if (existing) {
      return route.fulfill({
        json: {
          upload: {
            ...existing,
            strategy: "single-put",
            requiredHeaders: { "content-type": "image/jpeg" },
            status: "active",
          },
        },
      });
    }
    const attempt = sessions.length + 1;
    const expired = options.expireFirst === true && sessions.length === 0;
    const providerFailureStatus = attempt === 1
      ? options.providerFailureStatus
      : undefined;
    const session = {
      assetId: `asset_${attempt}`,
      expiresAt: new Date(
        Date.now() + (expired ? -1000 : 60_000),
      ).toISOString(),
      sessionId: `session_${attempt}`,
      uploadUrl: expired
        ? "/signed/photo-put-expired"
        : providerFailureStatus
        ? `/signed/photo-put-auth-${providerFailureStatus}`
        : "/signed/photo-put",
    };
    sessions.push(session);
    sessionsBySource.set(request.sourceIdempotencyKey, session);
    return route.fulfill({
      json: {
        upload: {
          ...session,
          strategy: "single-put",
          requiredHeaders: { "content-type": "image/jpeg" },
          status: "active",
        },
      },
    });
  });
  await page.route("**/signed/photo-put*", async (route) => {
    const url = route.request().url();
    const expired = url.includes("photo-put-expired");
    const providerFailureStatus = url.endsWith("photo-put-auth-401")
      ? 401
      : url.endsWith("photo-put-auth-403")
      ? 403
      : undefined;
    puts.push({
      body: route.request().postDataBuffer() ?? Buffer.alloc(0),
      contentType: await route.request().headerValue("content-type"),
      expired,
      url,
    });
    return route.fulfill(
      providerFailureStatus
        ? { status: providerFailureStatus }
        : expired
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
      completionAttempts += 1;
      if (
        options.failFirstCompletionBeforeCommit === true &&
        completionAttempts === 1
      ) {
        return route.fulfill({
          status: 503,
          json: { code: "photo_upload_completion_unavailable" },
        });
      }
      const session = sessions.find((candidate) =>
        candidate.sessionId === sessionId
      );
      if (session) completionCommits.push(session.assetId);
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
    (route) => {
      const sessionId = new URL(route.request().url()).pathname
        .split("/").at(-2);
      if (sessionId) aborts.push(sessionId);
      return route.fulfill({ json: { upload: { status: "aborted" } } });
    },
  );
  await page.route("**/api/photo-jobs/job_1/assets/asset_*", async (route) =>
    route.fulfill({ json: { asset: { id: "asset_1", status: "deleted" } } }),
  );

  return {
    aborts,
    completionCommits,
    completions,
    puts,
    sessions,
    uploadRequests,
  };
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

test("reload resumes completion after transport failure without a second immutable PUT", async ({
  page,
}) => {
  const state = await mockUpload(page, {
    failFirstCompletionBeforeCommit: true,
  });
  await page.goto("/photo-upload-e2e?locale=en");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "resume.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });

  await expect(page.getByRole("progressbar", {
    name: "resume.jpg: Upload failed",
  })).toBeVisible();
  expect(state.puts).toHaveLength(1);
  expect(state.sessions).toHaveLength(1);
  expect(state.completions).toEqual([{ etag: '"etag-1"' }]);
  expect(state.completionCommits).toHaveLength(0);
  const pending = await page.evaluate(() => {
    const rows = JSON.parse(
      localStorage.getItem("fotomax:photo-queue:job_1") ?? "[]",
    );
    return rows[0];
  });
  expect(pending).toMatchObject({
    assetId: "asset_1",
    sessionId: "session_1",
    completionEtag: '"etag-1"',
  });

  await page.reload();
  await expect(page.getByRole("progressbar", {
    name: "resume.jpg: Upload failed",
  })).toBeVisible();
  await page.locator(".photo-retry-picker input").setInputFiles({
    name: "resume.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });

  await expect(page.getByRole("progressbar", {
    name: "resume.jpg: Uploaded",
  })).toHaveJSProperty("value", 100);
  expect(state.puts).toHaveLength(1);
  expect(state.sessions).toHaveLength(1);
  expect(state.uploadRequests).toHaveLength(2);
  expect(state.uploadRequests[1].sourceIdempotencyKey).toBe(
    state.uploadRequests[0].sourceIdempotencyKey,
  );
  expect(state.completions).toEqual([
    { etag: '"etag-1"' },
    { etag: '"etag-1"' },
  ]);
  expect(state.completionCommits).toEqual(["asset_1"]);
  const terminal = await page.evaluate(() => {
    const rows = JSON.parse(
      localStorage.getItem("fotomax:photo-queue:job_1") ?? "[]",
    );
    return rows[0];
  });
  expect(terminal).not.toHaveProperty("completionEtag");
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
  expect(state.puts.map((put) => put.expired)).toEqual([false]);
  expect(state.aborts).toEqual(["session_1"]);
  expect(state.sessions).toHaveLength(2);
  expect(state.sessions[0].sessionId).not.toBe(state.sessions[1].sessionId);
  expect(state.sessions[0].uploadUrl).not.toBe(state.sessions[1].uploadUrl);
  expect(state.uploadRequests[1].sourceIdempotencyKey).toBe(
    `${state.uploadRequests[0].sourceIdempotencyKey}:replacement:1`,
  );
  expect(state.completions).toEqual([{ etag: '"etag-1"' }]);
});

for (const status of [401, 403] as const) {
  test(`does not replace an active direct grant after provider status ${status}`, async ({
    page,
  }) => {
    const state = await mockUpload(page, { providerFailureStatus: status });
    await page.goto("/photo-upload-e2e?locale=en");
    await page.locator('input[type="file"]').first().setInputFiles({
      name: `unauthorized-${status}.jpg`,
      mimeType: "image/jpeg",
      buffer: jpeg,
    });

    await expect(page.getByRole("progressbar", {
      name: `unauthorized-${status}.jpg: Upload failed`,
    })).toBeVisible();
    expect(state.uploadRequests).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
    expect(state.puts).toHaveLength(1);
    expect(state.completions).toHaveLength(0);
    expect(state.aborts).toHaveLength(0);
  });
}

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
