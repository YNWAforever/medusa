import { expect, test } from "@playwright/test"

test("locale routes render the correct language in initial HTML without hydration errors", async ({ page }) => {
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text())
    }
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))

  for (const locale of ["en", "zh-HK"] as const) {
    const response = await page.goto(`/${locale}`)
    const initialHtml = (await response?.text()) ?? ""

    expect(initialHtml).toMatch(new RegExp(`<html[^>]*lang="${locale}"`))
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe(locale)
  }

  expect(browserErrors).toEqual([])
})

test("homepage exposes bilingual commerce navigation", async ({ page }) => {
  await page.goto("/zh-HK")
  await expect(page.getByRole("link", { name: "Fotomax" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "相片沖印" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "個人化禮品" }).first()).toBeVisible()

  await page.getByRole("link", { name: "English" }).click()
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.getByRole("link", { name: "Photo Print" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Personalized Gifts" }).first()).toBeVisible()
})

test("category filters persist in the URL and recover from an empty state", async ({ page }) => {
  await page.goto("/en/categories/photo-print")
  await expect(page.getByRole("heading", { level: 1, name: "Photo Print" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Classic 4R Photo Print", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Available" }).click()
  await expect(page).toHaveURL(/filter=available/)
  await expect(page.getByRole("button", { name: "Available" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("link", { name: "Classic 4R Photo Print", exact: true })).toBeVisible()

  await page.goto("/en/categories/personalized-gifts")
  await expect(page.getByRole("heading", { level: 1, name: "Personalized Gifts" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "No products yet" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Browse categories" })).toHaveAttribute("href", "/en")
})

test("product cart actions announce quantity and restore focus", async ({ page }) => {
  const performanceWarnings: string[] = []
  page.on("console", (message) => {
    if (/Largest Contentful Paint|loading="eager"/i.test(message.text())) {
      performanceWarnings.push(message.text())
    }
  })

  await page.goto("/en/products/instax-mini-film-pack")
  await expect(page.getByRole("heading", { name: "Instax Mini Film Pack" })).toBeVisible()

  const addButton = page.getByRole("button", { name: "Add to cart" })
  const status = page.locator("main .cart-command-status")
  const cart = page.getByRole("complementary", { name: "Cart" })
  await expect(addButton).toBeVisible()
  await expect(status).toBeEmpty()

  await addButton.click()
  await expect(page.getByRole("button", { name: "Add another" })).toBeVisible()
  await expect(status).toHaveText("Added to cart, 1 item")
  await expect(page.getByRole("button", { name: "Open cart, 1 item" })).toBeVisible()

  await page.getByRole("button", { name: "Add another" }).click()
  await expect(status).toHaveText("Added to cart, 2 items")

  const reopen = page.getByRole("button", { name: "Open cart, 2 items" })
  await reopen.click()
  await expect(page.getByRole("button", { name: "Collapse cart" })).toBeFocused()
  await expect(cart).toContainText("Instax Mini Film Pack")
  await expect(cart).toContainText("2 x")

  await page.getByRole("button", { name: "Collapse cart" }).click()
  await expect(reopen).toBeFocused()
  await reopen.click()
  await expect(page.getByRole("button", { name: "Collapse cart" })).toBeFocused()

  const clearOptions = page.getByRole("button", { name: "Clear cart options" })
  await clearOptions.click()
  await page.getByRole("button", { name: "Keep items" }).click()
  await expect(clearOptions).toBeFocused()
  await clearOptions.click()
  await page.getByRole("button", { name: "Clear cart", exact: true }).click()
  await expect(page.locator("#header-cart-link")).toBeFocused()
  await expect(cart).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible()
  await expect(status).toBeEmpty()

  await addButton.click()
  await expect(status).toHaveText("Added to cart, 1 item")
  await expect(cart).toBeVisible()
  await page.locator("#cart-collapse-button").click()
  await expect(page.getByRole("button", { name: "Open cart, 1 item" })).toBeVisible()

  await page.getByRole("button", { name: "Add another" }).click()
  await expect(status).toHaveText("Added to cart, 2 items")
  await expect(page.getByRole("button", { name: "Open cart, 2 items" })).toBeVisible()
  await expect(cart).toHaveCount(0)
  expect(performanceWarnings).toEqual([])
})

test("upload service communicates an honest coming-soon state", async ({ page }) => {
  await page.goto("/en/services/upload-photo-print")
  await expect(page.getByRole("heading", { name: "Upload Photo Print Order" })).toBeVisible()
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/next phase|Medusa/i)
})

test("store pickup navigation resolves to an honest coming-soon state", async ({ page }) => {
  await page.goto("/en")
  await page.getByRole("link", { name: "Store pickup", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Store Pickup & Collection" })).toBeVisible()
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/next phase|Medusa/i)
})

test("unknown service keeps locale-aware recovery", async ({ page }) => {
  await page.goto("/en/services/not-a-service")
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Back to homepage" })).toHaveAttribute("href", "/en")
})

test("unknown nested locale routes keep nearest localized recovery", async ({ page }) => {
  const cases = [
    {
      path: "/zh-HK/does-not-exist",
      heading: "找不到頁面",
      link: "返回首頁",
      href: "/zh-HK",
    },
    {
      path: "/en/does-not-exist",
      heading: "Page not found",
      link: "Back to homepage",
      href: "/en",
    },
  ]

  for (const localeCase of cases) {
    const response = await page.goto(localeCase.path)

    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: localeCase.heading, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: localeCase.link, exact: true })).toHaveAttribute(
      "href",
      localeCase.href,
    )
    await expect(page.getByRole("heading", { name: "Page not found / 找不到頁面", exact: true })).toHaveCount(0)
  }
})

test("cart route opens the live checkout flow", async ({ page }) => {
  await page.goto("/en/cart")
  await expect(page.getByRole("heading", { name: "Ready to checkout" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Go to checkout" })).toHaveAttribute("href", "/en/checkout")
})
