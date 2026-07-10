import { expect, test } from "@playwright/test"

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
  await expect(page.getByRole("heading", { name: /Turn camera-roll moments/i })).toBeVisible()
  await expect(page.getByRole("link", { name: "Classic 4R Photo Print", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Available" }).click()
  await expect(page).toHaveURL(/filter=available/)
  await expect(page.getByRole("button", { name: "Available" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("No products match this filter yet.")).toBeVisible()

  await page.getByRole("button", { name: "Show all" }).click()
  await expect(page).not.toHaveURL(/filter=/)
  await expect(page.getByRole("link", { name: "Classic 4R Photo Print", exact: true })).toBeVisible()
})

test("product cart actions announce quantity and restore focus", async ({ page }) => {
  await page.goto("/en/products/classic-4r-photo-print")
  await expect(page.getByRole("heading", { name: "Classic 4R Photo Print" })).toBeVisible()

  const addButton = page.getByRole("button", { name: "Add to cart" })
  const status = page.getByRole("status")
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

  const cart = page.getByRole("complementary", { name: "Cart" })
  await expect(cart).toContainText("Classic 4R Photo Print")
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
  await expect(page.getByRole("complementary", { name: "Cart" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible()
  await expect(status).toBeEmpty()
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

test("cart route explains the upcoming checkout flow", async ({ page }) => {
  await page.goto("/en/cart")
  await expect(page.getByRole("heading", { name: "Your cart is ready" })).toBeVisible()
  await expect(page.getByText(/checkout, payment, and order confirmation are coming soon/i)).toBeVisible()
})
