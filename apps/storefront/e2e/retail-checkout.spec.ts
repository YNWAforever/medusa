import { expect, test, type Page } from "@playwright/test"

const locales = ["en", "zh-HK"] as const
type Locale = (typeof locales)[number]

const copy = {
  en: {
    add: /Add to cart|Add another/,
    cart: /Open cart|Cart \(/,
    viewCart: "View cart",
    checkout: "Go to checkout",
    heading: "Checkout",
    contact: "Contact details",
    delivery: "Hong Kong delivery",
    pickup: "Store pickup",
    review: "Review order",
    payment: "Payment",
    continueFulfillment: "Continue to fulfillment",
    continueReview: "Review order",
    continuePayment: "Continue to payment",
    complete: "Complete order",
    confirmed: "Order confirmed",
    unavailable: "Checkout is unavailable",
    expired: "Confirmation unavailable",
  },
  "zh-HK": {
    add: /加入購物車|再加一件/,
    cart: /展開購物車|購物車/,
    viewCart: "查看購物車",
    checkout: "前往結帳",
    heading: "結帳",
    contact: "聯絡資料",
    delivery: "香港送貨",
    pickup: "門市取貨",
    review: "確認訂單",
    payment: "付款",
    continueFulfillment: "繼續選擇取貨方式",
    continueReview: "檢查訂單",
    continuePayment: "繼續付款",
    complete: "完成訂單",
    confirmed: "訂單已確認",
    unavailable: "購物車暫時無法結帳",
    expired: "確認資料已失效",
  },
} as const

async function addRetailItem(page: Page, locale: Locale) {
  await page.goto(`/${locale}/products/instax-mini-film-pack`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const addButton = page.getByRole("button", { name: copy[locale].add }).first()
  await expect(addButton).toBeEnabled()
  await addButton.click()
  await expect(page.getByRole("status")).toContainText(locale === "en" ? "Added to cart" : "已加入購物車")
}

async function openCheckout(page: Page, locale: Locale) {
  await page.getByRole("button", { name: copy[locale].cart }).first().click()
  await page.getByRole("link", { name: copy[locale].viewCart }).click()
  await page.getByRole("link", { name: copy[locale].checkout }).click()
  await expect(page.locator("[data-checkout-flow]")).toHaveAttribute("data-checkout-flow", "contact")
}

async function fillContact(page: Page, locale: Locale, email: string) {
  await page.getByLabel(locale === "en" ? "First name" : "名字").fill("Fotomax")
  await page.getByLabel(locale === "en" ? "Last name" : "姓氏").fill("Tester")
  await page.getByLabel(locale === "en" ? "Email" : "電郵地址").fill(email)
  await page.getByLabel(locale === "en" ? "Phone" : "電話").fill("51234567")
  await page.getByLabel(locale === "en" ? "Address" : "地址").fill("Test address")
  await page.getByLabel(locale === "en" ? "City" : "地區").fill("Hong Kong")
  await page.getByLabel(locale === "en" ? "Postal code" : "郵政編碼").fill("000000")
}

async function completeDelivery(page: Page, locale: Locale, email: string) {
  await fillContact(page, locale, email)
  await page.getByRole("button", { name: copy[locale].continueFulfillment }).click()
  await expect(page.locator("[data-checkout-flow]")).toHaveAttribute("data-checkout-flow", "fulfillment")
  await page.getByRole("button", { name: copy[locale].delivery }).click()
  const deliveryOption = page.locator('input[type="radio"]:not(:disabled)').first()
  await expect(deliveryOption).toBeEnabled()
  await deliveryOption.check()
  await page.getByRole("button", { name: copy[locale].continueReview }).click()
  await expect(page.locator("[data-checkout-flow]")).toHaveAttribute("data-checkout-flow", "review")
  await page.getByRole("button", { name: copy[locale].continuePayment }).click()
  await expect(page.locator("[data-checkout-flow]")).toHaveAttribute("data-checkout-flow", "payment")
  await page.getByRole("button", { name: copy[locale].complete }).click()
  await expect(page).toHaveURL(new RegExp(`/${locale}/checkout/confirmation`))
  await expect(page.getByRole("heading", { name: copy[locale].confirmed })).toBeVisible()
}

async function assertPageHealth(page: Page, path: string) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedMedia: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("requestfailed", (request) => {
    if (/\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i.test(request.url())) failedMedia.push(request.url())
  })

  await page.goto(path)
  await page.waitForLoadState("networkidle")
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(/en|zh-HK/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
  expect(failedMedia).toEqual([])
}

test.describe("Fotomax retail storefront", () => {
  test("serves the live catalog and selects a retail variant", async ({ page }) => {
    for (const locale of locales) {
      await page.goto(`/${locale}/products/instax-mini-film-pack`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expect(page.getByText(/HK\$78\.00|HK\$78\.00/)).toBeVisible()
      await expect(page.getByText(locale === "en" ? "In stock" : "有貨")).toBeVisible()
      await expect(page.getByRole("button", { name: copy[locale].add }).first()).toBeEnabled()
    }
  })

  test("persists the retail cart across a reload", async ({ page }) => {
    for (const locale of locales) {
      await addRetailItem(page, locale)
      await page.reload()
      await expect(page.getByRole("button", { name: copy[locale].cart }).first()).toBeVisible()
      await page.getByRole("button", { name: copy[locale].cart }).first().click()
      await expect(page.getByRole("complementary", { name: locale === "en" ? "Cart" : "購物車" })).toBeVisible()
    }
  })

  test("completes a guest delivery checkout and shows confirmation", async ({ page }) => {
    for (const locale of locales) {
      await addRetailItem(page, locale)
      await openCheckout(page, locale)
      await completeDelivery(page, locale, `guest-${locale}-${Date.now()}@fotomax.test`)
    }
  })

  test("completes guest pickup at a compatible staging branch", async ({ page }) => {
    for (const locale of locales) {
      await addRetailItem(page, locale)
      await openCheckout(page, locale)
      await fillContact(page, locale, `pickup-${locale}-${Date.now()}@fotomax.test`)
      await page.getByRole("button", { name: copy[locale].continueFulfillment }).click()
      await page.getByRole("button", { name: copy[locale].pickup }).click()
      const pickupOption = page.locator('input[type="radio"]:not(:disabled)').first()
      await expect(pickupOption).toBeEnabled()
      await pickupOption.check()
      await page.getByRole("button", { name: copy[locale].continueReview }).click()
      await expect(page.locator("[data-checkout-flow]")).toHaveAttribute("data-checkout-flow", "review")
    }
  })

  test("covers account registration, checkout, logout, login, and order history", async ({ page }) => {
    const email = `account-${Date.now()}@fotomax.test`
    await page.goto("/en/account/register")
    await page.getByLabel("First name").fill("Fotomax")
    await page.getByLabel("Last name").fill("Account")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill("Fotomax-test-123")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/en\/account\/orders/)

    await addRetailItem(page, "en")
    await openCheckout(page, "en")
    await completeDelivery(page, "en", email)
    await page.getByRole("link", { name: "View orders" }).click()
    await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible()
    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/en\/account\/login/)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill("Fotomax-test-123")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/en\/account\/orders/)
    await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible()
  })

  test("shows a disabled pickup branch with an out-of-stock reason", async ({ page }) => {
    await page.route("**/api/branches?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        branches: [{
          id: "branch_out_of_stock",
          handle: "central",
          name: "Central",
          district: "Central",
          leadTimeBusinessDays: 1,
          compatible: false,
          reasonCode: "retail_out_of_stock",
          shippingOptionId: "so_test_pickup",
          stagingLabel: "Staging test data",
        }],
      }),
    }))
    await addRetailItem(page, "en")
    await expect(page.getByText("Unavailable for this cart")).toBeVisible()
  })

  test("recovers from Medusa unavailability and expired-cart responses", async ({ page }) => {
    await page.route("**/api/checkout?*", (route) => route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "checkout_unavailable" } }),
    }))
    await page.goto("/en/checkout")
    await expect(page.getByRole("heading", { name: copy.en.unavailable })).toBeVisible()

    await page.unrouteAll()
    await page.route("**/api/checkout/confirmation", (route) => route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "confirmation_expired" } }),
    }))
    await page.goto("/en/checkout/confirmation")
    await expect(page.getByRole("heading", { name: copy.en.expired })).toBeVisible()
  })

  test("keeps both locales free of overflow, uncaught exceptions, and failed media", async ({ page }) => {
    for (const locale of locales) {
      await assertPageHealth(page, `/${locale}`)
      await assertPageHealth(page, `/${locale}/cart`)
      await assertPageHealth(page, `/${locale}/account/login`)
    }
  })
})
