import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const money = (amount: number) => ({ amount, currencyCode: "hkd" });
const emptyCart = {
  id: null,
  currencyCode: "hkd",
  items: [],
  itemCount: 0,
  subtotal: money(0),
  shippingTotal: money(0),
  taxTotal: money(0),
  total: money(0),
  email: null,
};
const mixedCart = {
  ...emptyCart,
  id: "cart_1",
  itemCount: 5,
  subtotal: money(16280),
  total: money(16280),
  items: [
    {
      id: "line_retail",
      kind: "retail",
      variantId: "variant_film",
      title: "Instax Mini Film Pack",
      thumbnail: null,
      quantity: 2,
      unitPrice: money(7800),
      subtotal: money(15600),
      photoJobVersionId: null,
      photoCount: null,
    },
    {
      id: "line_photo",
      kind: "photo_print",
      variantId: "variant_matte",
      title: "Classic 4R Photo Print",
      thumbnail: null,
      quantity: 3,
      unitPrice: money(280),
      subtotal: money(840),
      photoJobVersionId: "version_1",
      photoCount: 1,
    },
  ],
};

async function generatedJpeg() {
  return sharp({
    create: {
      width: 1200,
      height: 1800,
      channels: 3,
      background: { r: 31, g: 121, b: 109 },
    },
  }).jpeg({ quality: 86 }).toBuffer();
}

async function mockPhotoProduction(page: Page) {
  const preview = await generatedJpeg();
  let attached = false;
  let uploadCount = 0;
  const sessions = new Map<string, { assetId: string; filename: string }>();
  const versionBodies: Record<string, unknown>[] = [];
  const job: any = {
    id: "job_1",
    locale: "en",
    status: "processing",
    revision: 3,
    assets: [
      {
        id: "asset_ready",
        display_name: "family.jpg",
        expected_bytes: preview.length,
        status: "ready",
        width: 1200,
        height: 1800,
        quality_band: "caution",
        estimated_ppi: 200,
        warnings: [{ code: "quality_caution", acknowledged: false }],
      },
      {
        id: "asset_failed",
        display_name: "replace-me.jpg",
        expected_bytes: preview.length,
        status: "failed",
        failure_code: "photo_image_decode_failed",
      },
    ],
  };

  await page.route("**/api/photo-jobs/job_1", (route) =>
    route.fulfill({ json: { photo_job: job }, headers: { "cache-control": "no-store" } }),
  );
  await page.route("**/api/photo-jobs/job_1/assets/*/preview", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: preview }),
  );
await page.route("**/api/photo-jobs/job_1/uploads", async (route) => {
    uploadCount += 1;
    const input = await route.request().postDataJSON() as { filename: string };
    const assetId = `asset_upload_${uploadCount}`;
    const sessionId = `session_${uploadCount}`;
    sessions.set(sessionId, { assetId, filename: input.filename });
    return route.fulfill({
      json: {
        upload: {
          assetId,
          sessionId,
          partSize: preview.length + 1,
          status: "active",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
  });
  await page.route("**/api/photo-jobs/job_1/uploads/session_*/parts", (route) =>
    route.fulfill({ json: { part: { url: "/signed/photo-part", requiredHeaders: {} } } }),
  );
  await page.route("**/signed/photo-part", (route) =>
    route.fulfill({ status: 200, headers: { etag: '"generated-etag"' } }),
  );
  await page.route("**/api/photo-jobs/job_1/uploads/session_*/complete", (route) => {
    const sessionId = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
    const upload = sessions.get(sessionId)!;
    if (upload.filename === "replace-me.jpg") {
      job.assets = job.assets.filter((asset: { id: string }) => asset.id !== "asset_failed");
    }
    job.assets.push({
      id: upload.assetId,
      display_name: upload.filename,
      expected_bytes: preview.length,
      status: "ready",
      width: 1200,
      height: 1800,
      quality_band: "good",
      estimated_ppi: 300,
      warnings: [],
    });
    return route.fulfill({ json: { asset: { id: upload.assetId, status: "uploaded" } } });
  });
  await page.route("**/api/photo-jobs/job_1/versions", async (route) => {
    versionBodies.push((await route.request().postDataJSON()) as Record<string, unknown>);
    return route.fulfill({ json: { version: { id: "version_1" }, items: [], jobRevision: 4 } });
  });
  await page.route("**/api/photo-jobs/job_1/quote", (route) =>
    route.fulfill({
      json: {
        quote: {
          versionId: "version_1",
          subtotal: 840,
          currencyCode: "hkd",
          quotedAt: new Date().toISOString(),
          quoteExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          manifestDigest: "generated-manifest-digest",
        },
      },
    }),
  );
  await page.route("**/api/photo-jobs/job_1/cart", (route) => {
    attached = true;
    return route.fulfill({ json: { cart: mixedCart } });
  });
  await page.route("**/api/cart", (route) =>
    route.fulfill({ json: { cart: attached ? mixedCart : emptyCart } }),
  );

  return { preview, versionBodies };
}

for (const locale of ["en", "zh-HK"] as const) {
  test(`${locale} photo production editor reaches a grouped mixed cart`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedPreviews: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.url().includes("/preview") && !response.ok()) failedPreviews.push(response.url());
    });
    const { preview, versionBodies } = await mockPhotoProduction(page);

    await page.goto(`/photo-upload-e2e?locale=${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "en" ? "Photo workspace" : "相片工作區",
    );
    await expect(page.getByText(locale === "en" ? "Upload failed" : "上載失敗")).toBeVisible();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "generated-device-photo.jpg",
      mimeType: "image/jpeg",
      buffer: preview,
    });
    await expect(page.getByText("generated-device-photo.jpg")).toBeVisible();
    await expect(page.getByText(locale === "en" ? "Uploaded" : "已上載").last()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: `generated-device-photo.jpg: ${locale === "en" ? "Uploaded" : "已上載"}` }))
      .toHaveJSProperty("value", 100);

    const retryPicker = page.locator('.photo-retry-picker input[type="file"]');
    await retryPicker.setInputFiles({
      name: "replace-me.jpg",
      mimeType: "image/jpeg",
      buffer: preview,
    });
    await expect(page.getByRole("progressbar", { name: `replace-me.jpg: ${locale === "en" ? "Uploaded" : "已上載"}` }))
      .toHaveJSProperty("value", 100);

    await page.getByRole("button", { name: locale === "en" ? "Select ready" : "選擇可沖印" }).click();
    const cropGroup = page.getByRole("group", { name: locale === "en" ? "Crop mode" : "裁切模式" });
    const fit = cropGroup.getByRole("button", { name: locale === "en" ? "Fit" : "完整" });
    await fit.click();
    await expect(fit).toHaveAttribute("aria-pressed", "true");
    await expect(fit).toBeFocused();

    const finishGroup = page.getByRole("group", { name: locale === "en" ? "Finish" : "相紙" });
    await finishGroup.getByRole("button", { name: locale === "en" ? "Matte" : "啞面" }).click();
    await page.getByLabel(locale === "en" ? "Quantity" : "數量").last().fill("3");
    await page.getByLabel(locale === "en" ? "I understand and accept this print notice" : "我已了解並接受此沖印提示").check();
    await page.getByLabel(locale === "en" ? "Filter" : "篩選").selectOption("warning");
    await expect(page.getByText("family.jpg").last()).toBeVisible();

    await page.getByRole("button", { name: locale === "en" ? "Review quote" : "檢視報價" }).click();
    await expect(page.getByText(locale === "en" ? "Print subtotal" : "沖印小計")).toBeVisible();
    await expect(page.getByText(/HK\$8\.40/)).toBeVisible();
    expect(versionBodies.at(-1)).toMatchObject({
      defaults: { cropMode: "fit", finish: "matte" },
      warningAcknowledgements: [{ assetId: "asset_ready", code: "quality_caution" }],
    });

    await page.getByRole("button", { name: locale === "en" ? "Add to cart" : "加入購物車" }).click();
    await expect(page.getByText("Instax Mini Film Pack")).toBeVisible();
    await expect(page.getByText("Classic 4R Photo Print")).toBeVisible();

    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect.poll(() => page.evaluate(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(failedPreviews).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
