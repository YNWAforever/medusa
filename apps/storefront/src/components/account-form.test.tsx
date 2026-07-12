import { readFileSync } from "node:fs"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { AccountForm } from "./account-form"
import { OrderHistoryView } from "./order-history"
import { SiteHeader } from "./site-header"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

describe("localized customer account UI", () => {
  it.each([
    ["en", "Email", "Password", "Sign in"],
    ["zh-HK", "電郵地址", "密碼", "登入"],
  ] as const)("renders an accessible login form in %s", (locale, email, password, submit) => {
    const markup = renderToStaticMarkup(<AccountForm locale={locale} mode="login" />)
    expect(markup).toContain('<form class="account-form"')
    expect(markup).toContain(`<label for="account-email">${email}</label>`)
    expect(markup).toContain(`<label for="account-password">${password}</label>`)
    expect(markup).toContain('type="email"')
    expect(markup).toContain('autoComplete="email"')
    expect(markup).toContain('autoComplete="current-password"')
    expect(markup).toContain(`>${submit}</button>`)
  })

  it.each([
    ["en", "First name", "Last name", "Create account"],
    ["zh-HK", "名字", "姓氏", "建立帳戶"],
  ] as const)("renders registration-only identity fields in %s", (locale, firstName, lastName, submit) => {
    const markup = renderToStaticMarkup(<AccountForm locale={locale} mode="register" />)
    expect(markup).toContain(firstName)
    expect(markup).toContain(lastName)
    expect(markup).toContain('autoComplete="new-password"')
    expect(markup).toContain(`>${submit}</button>`)
  })

  it("implements inline validation, an accessible error summary, and same-origin auth requests", () => {
    const source = readFileSync(new URL("./account-form.tsx", import.meta.url), "utf8")
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-describedby')
    expect(source).toContain("fieldErrors")
    expect(source).toContain('mode === "login" ? "/api/auth/login" : "/api/auth/register"')
    expect(source).toContain('credentials: "same-origin"')
    expect(source).toContain("isSubmitting")
    expect(source).toContain('router.replace(localeHref(locale, "/account/orders"))')
  })

  it("renders distinct loading, empty, expired, error, and populated order states", () => {
    const loading = renderToStaticMarkup(<OrderHistoryView locale="en" state={{ status: "loading" }} />)
    const empty = renderToStaticMarkup(<OrderHistoryView locale="en" state={{ status: "ready", orders: [] }} />)
    const expired = renderToStaticMarkup(<OrderHistoryView locale="en" state={{ status: "expired" }} />)
    const error = renderToStaticMarkup(<OrderHistoryView locale="zh-HK" state={{ status: "error" }} />)
    const ready = renderToStaticMarkup(<OrderHistoryView locale="en" state={{ status: "ready", orders: [{
      id: "order_123", displayId: 42, createdAt: "2026-07-12T10:00:00.000Z",
      total: { amount: 7800, currencyCode: "hkd" }, status: "completed", fulfillmentStatus: "fulfilled",
    }] }} />)

    expect(loading).toContain("Loading your orders")
    expect(empty).toContain("You have no orders yet")
    expect(expired).toContain("Your session has expired")
    expect(expired).toContain('href="/en/account/login"')
    expect(error).toContain("暫時未能載入訂單")
    expect(ready).toContain("#42")
    expect(ready).toContain("HK$78.00")
    expect(ready).toContain("Completed")
    expect(ready).toContain("Fulfilled")
  })

  it("wires account pages and a localized header destination", () => {
    const loginPage = readFileSync(new URL("../../app/[locale]/account/login/page.tsx", import.meta.url), "utf8")
    const registerPage = readFileSync(new URL("../../app/[locale]/account/register/page.tsx", import.meta.url), "utf8")
    const ordersPage = readFileSync(new URL("../../app/[locale]/account/orders/page.tsx", import.meta.url), "utf8")
    const header = renderToStaticMarkup(<SiteHeader locale="zh-HK" />)

    expect(loginPage).toContain('<AccountForm locale={locale} mode="login" />')
    expect(registerPage).toContain('<AccountForm locale={locale} mode="register" />')
    expect(ordersPage).toContain("<OrderHistory locale={locale} />")
    expect(header).toContain('href="/zh-HK/account/login"')
    expect(header).toContain('aria-label="帳戶"')
  })
})
