import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { HomePage } from "./home-page"
import { SiteHeader } from "./site-header"

describe("Fotomax homepage composition", () => {
  it("renders English commerce paths without dead controls", () => {
    const header = renderToStaticMarkup(<SiteHeader locale="en" />)
    const page = renderToStaticMarkup(<HomePage locale="en" />)

    expect(header).toContain('href="/en/categories/photo-print"')
    expect(header).toContain('href="/en/services/store-pickup"')
    expect(header).not.toContain('aria-label="Search"')
    expect(page).toContain("Photo life, from prints to gifts in one modern shop.")
    expect(page).toContain("Popular products and services")
  })

  it("renders Traditional Chinese category and service copy", () => {
    const page = renderToStaticMarkup(<HomePage locale="zh-HK" />)

    expect(page).toContain("影像生活，由沖印到禮物一站完成。")
    expect(page).toContain("熱門產品及服務")
    expect(page).toContain("下一階段推出")
  })
})
