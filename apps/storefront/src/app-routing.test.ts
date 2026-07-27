import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname } from "node:path"
import { describe, expect, it } from "vitest"

const appUrl = new URL("../app/", import.meta.url)

function readAppFile(path: string) {
  return readFileSync(new URL(path, appUrl), "utf8")
}

const forbiddenSharedCatalogValues = new Set(["products", "categories", "serviceEntries"])

function runtimeSourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = new URL(entry.name, directory)

    if (entry.isDirectory()) {
      return runtimeSourceFiles(new URL(`${entry.name}/`, directory))
    }

    if (
      (extname(entry.name) === ".ts" || extname(entry.name) === ".tsx")
      && !entry.name.includes(".test.")
    ) {
      return [file]
    }

    return []
  })
}

function sharedCatalogValueImports(file: URL): string[] {
  const source = readFileSync(file, "utf8")
  const importedNames = Array.from(
    source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*["']@fotomax\/shared["']/g),
  ).flatMap((match) => match[1].split(","))

  return importedNames
    .map((value) => value.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter((value) => forbiddenSharedCatalogValues.has(value))
}

describe("App Router document boundaries", () => {
  it("keeps shared catalog fixtures out of the storefront runtime", () => {
    const runtimeFiles = [
      ...runtimeSourceFiles(new URL("../app/", import.meta.url)),
      ...runtimeSourceFiles(new URL("./", import.meta.url)),
    ]
    const violations = runtimeFiles.flatMap((file) =>
      sharedCatalogValueImports(file).map((value) => `${file.pathname}: ${value}`),
    )

    expect(violations).toEqual([])
  })

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

  it("catches a locale-layout throw in a full-document error boundary", () => {
    const globalError = readAppFile("global-error.tsx")

    // The catalog fetch lives in [locale]/layout.tsx, so only a global boundary
    // rendering its own document can catch it.
    expect(globalError).toContain('"use client"')
    expect(globalError).toContain('<html lang="zh-HK">')
    expect(globalError).toContain("<body>")
    expect(globalError).toContain("reset()")
    expect(globalError).toContain('href="/zh-HK"')
    expect(globalError).toContain('href="/en"')

    // Never surface Medusa internals or a stack digest to the shopper.
    expect(globalError).not.toContain("error.message")
    expect(globalError).not.toContain("error.digest")
  })
})
