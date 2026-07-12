import Image from "next/image"
import Link from "next/link"
import React from "react"
import { serviceEntries } from "../content/services"
import type { ProductFilter } from "../lib/catalog-view"
import type { CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"
import { CategoryProductGrid } from "./category-product-grid"

const accents: Record<string, string> = { "photo-print": "#e84855", photobook: "#3f7cac", "personalized-gifts": "#f5a623", "instax-film": "#00a6a6", lifestyle: "#7b61ff", promotions: "#111827" }

export function CategoryPage({ category, products, locale, initialFilter = "all" }: { category: CatalogCategory; products: CatalogProduct[]; locale: Locale; initialFilter?: ProductFilter }) {
  const relatedServices = serviceEntries.filter((entry) => entry.categoryHandle === category.handle)
  const comingSoonLabel = locale === "zh-HK" ? "即將推出" : "Coming soon"
  const comingSoonSummary = locale === "zh-HK" ? "我們正準備這項服務，敬請期待。" : "We're preparing this service for you."
  const heroImage = products.find((product) => product.thumbnail)?.thumbnail

  return <main id="main-content">
    <section className="category-hero" style={{ backgroundColor: accents[category.handle] ?? "#111827" }}>
      {heroImage ? <Image className="category-hero-image" src={heroImage} alt="" fill priority loading="eager" fetchPriority="high" sizes="100vw" /> : null}
      <div className="category-hero-overlay" aria-hidden="true" /><div className="page-shell category-hero-content"><p className="eyebrow">{category.title}</p><h1>{category.title}</h1><p>{category.summary}</p></div>
    </section>
    <section className="page-shell section catalog-section">{products.length > 0 ? <><div className="section-heading catalog-section-heading"><p className="eyebrow">Fotomax</p><h2>{locale === "zh-HK" ? "產品" : "Products"}</h2></div><CategoryProductGrid products={products} locale={locale} initialFilter={initialFilter} /></> : <div className="empty-state"><h2>{locale === "zh-HK" ? "暫未有產品" : "No products yet"}</h2><p>{locale === "zh-HK" ? "請返回首頁查看其他 Fotomax 分類。" : "Return to the homepage to browse other Fotomax categories."}</p><Link className="button primary" href={localeHref(locale, "/")}>{locale === "zh-HK" ? "瀏覽產品分類" : "Browse categories"}</Link></div>}</section>
    {relatedServices.length > 0 ? <section className="page-shell service-strip" aria-label={locale === "zh-HK" ? "相關服務" : "Related services"}>{relatedServices.map((entry) => <Link key={entry.handle} href={localeHref(locale, `/services/${entry.handle}`)}><span>{comingSoonLabel}</span><strong>{entry.title[locale]}</strong><p>{comingSoonSummary}</p></Link>)}</section> : null}
  </main>
}