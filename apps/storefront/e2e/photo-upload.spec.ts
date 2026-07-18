import { expect, test, type Page } from "@playwright/test";

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
