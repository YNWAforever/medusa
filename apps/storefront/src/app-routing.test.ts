import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const appUrl = new URL("../app/", import.meta.url)

function readAppFile(path: string) {
  return readFileSync(new URL(path, appUrl), "utf8")
}

describe("App Router document boundaries", () => {
  it("uses the localized segment as a dynamic root document", () => {
    const localeLayout = readAppFile("[locale]/layout.tsx")

    expect(existsSync(new URL("layout.tsx", appUrl))).toBe(false)
    expect(localeLayout).toContain("<html lang={locale}>")
    expect(localeLayout).toContain("<body>")
    expect(localeLayout).toContain("<CartProvider>")
  })

  it("preserves the root redirect in its own complete root layout", () => {
    const rootLayout = readAppFile("(root)/layout.tsx")
    const rootPage = readAppFile("(root)/page.tsx")

    expect(rootLayout).toContain('<html lang="zh-HK">')
    expect(rootLayout).toContain("<body>{children}</body>")
    expect(rootPage).toContain("redirect(`/${defaultLocale}`)")
  })

  it("uses a full-document global fallback while retaining localized not-found routing", () => {
    const globalNotFound = readAppFile("global-not-found.tsx")
    const localeCatchAll = readAppFile("[locale]/[...path]/page.tsx")
    const localeNotFound = readAppFile("[locale]/not-found.tsx")
    const nextConfig = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8")

    expect(globalNotFound).toContain('<html lang="zh-HK">')
    expect(globalNotFound).toContain('href="/en"')
    expect(globalNotFound).toContain('href="/zh-HK"')
    expect(localeCatchAll).toContain("notFound()")
    expect(localeNotFound).toContain("<LocalizedNotFound locale={locale} />")
    expect(nextConfig).toContain("globalNotFound: true")
  })
})
