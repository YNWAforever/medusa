import { expect, test, type Page } from "@playwright/test";
import { crc32cBase64 } from "../src/lib/photo/uploader";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7]);

async function mockUpload(page: Page) {
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
  await page.route("**/api/photo-jobs/job_1/uploads", async (route) =>
    route.fulfill({
      json: {
        upload: {
          assetId: "asset_1",
          sessionId: "session_1",
          partSize: 6,
          status: "active",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    }),
  );
  await page.route(
    "**/api/photo-jobs/job_1/uploads/session_1/parts",
    async (route) =>
      route.fulfill({
        json: { part: { url: "/signed/photo-part", requiredHeaders: {} } },
      }),
  );
  await page.route("**/signed/photo-part", async (route) =>
    route.fulfill({ status: 200, headers: { etag: '"etag-1"' } }),
  );
  await page.route(
    "**/api/photo-jobs/job_1/uploads/session_1/complete",
    async (route) =>
      route.fulfill({ json: { asset: { id: "asset_1", status: "uploaded" } } }),
  );
  await page.route("**/api/photo-jobs/job_1/assets/asset_1", async (route) =>
    route.fulfill({ json: { asset: { id: "asset_1", status: "deleted" } } }),
  );
}

async function browserPost(page: Page, url: string, data: unknown) {
  return page.evaluate(async ({ url, data }) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await response.json(),
    };
  }, { url, data });
}
test("uploads and restores a photo in the localized workspace", async ({
  page,
}, testInfo) => {
  await mockUpload(page);
  const locale = testInfo.project.name.includes("mobile") ? "zh-HK" : "en";
  await page.goto(`/photo-upload-e2e?locale=${locale}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    locale === "en" ? "Photo workspace" : "相片工作區",
  );
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "holiday.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
    });
  await expect(
    page.getByText(locale === "en" ? "Uploaded" : "已上載"),
  ).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("holiday.jpg")).toBeVisible();
  await expect(
    page.getByText(locale === "en" ? "Uploaded" : "已上載"),
  ).toBeVisible();
  await page.screenshot({
    path: `../../docs/verification/evidence/photo-upload-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("uploads a signed part from the storefront browser origin", async ({
  page,
}) => {
  await page.goto("/en");
  const created = await browserPost(page, "/api/photo-jobs", { locale: "en" });
  const createdPayload = created.payload;
  expect(created.ok, JSON.stringify(createdPayload)).toBe(true);
  const jobId = createdPayload.photo_job.id as string;
  const checksumCRC32C = crc32cBase64(jpeg);
  const started = await browserPost(page, `/api/photo-jobs/${jobId}/uploads`, {
    filename: "cors-probe.jpg",
    reportedMime: "image/jpeg",
    bytes: jpeg.length,
    sourceIdempotencyKey: `cors-${Date.now()}`,
    signatureBase64: jpeg.toString("base64"),
  });
  expect(started.ok, JSON.stringify(started.payload)).toBe(true);
  const upload = started.payload.upload;

  try {
    const signed = await browserPost(
      page,
      `/api/photo-jobs/${jobId}/uploads/${upload.sessionId}/parts`,
      { partNumber: 1, checksumCRC32C },
    );
    expect(signed.ok, JSON.stringify(signed.payload)).toBe(true);
    const part = signed.payload.part;
    const putStatus = await page.evaluate(
      async ({ url, requiredHeaders, bytes }) => {
        const response = await fetch(url, {
          method: "PUT",
          headers: requiredHeaders,
          body: new Uint8Array(bytes),
        });
        return response.status;
      },
      { url: part.url, requiredHeaders: part.requiredHeaders, bytes: [...jpeg] },
    );
    expect(putStatus).toBe(200);
  } finally {
    const aborted = await browserPost(
      page,
      `/api/photo-jobs/${jobId}/uploads/${upload.sessionId}/abort`,
      {},
    );
    expect(aborted.ok, JSON.stringify(aborted.payload)).toBe(true);
  }
});