import Image from "next/image"
import Link from "next/link"
import React from "react"
import { localize, serviceEntries, type Category, type Locale, type Product } from "@fotomax/shared"
import type { ProductFilter } from "../lib/catalog-view"
import { localeHref } from "../lib/locales"
import { CategoryProductGrid } from "./category-product-grid"

export function CategoryPage({
  category,
  products,
  locale,
  initialFilter = "all",
}: {
  category: Category
  products: Product[]
  locale: Locale
  initialFilter?: ProductFilter
}) {
  const relatedServices = serviceEntries.filter((entry) => entry.categoryHandle === category.handle)
  const comingSoonLabel = locale === "zh-HK" ? "即將推出" : "Coming soon"
  const comingSoonSummary = locale === "zh-HK" ? "我們正準備這項服務，敬請期待。" : "We're preparing this service for you."

  return (
    <main id="main-content">
      <section className="category-hero" style={{ backgroundColor: category.accent }}>
        {products[0] ? (
          <Image
            className="category-hero-image"
            src={products[0].image}
            alt=""
            fill
            priority
            sizes="100vw"
          />
        ) : null}
        <div className="category-hero-overlay" aria-hidden="true" />
        <div className="page-shell category-hero-content">
          <p className="eyebrow">{localize(category.name, locale)}</p>
          <h1>{localize(category.hero, locale)}</h1>
          <p>{localize(category.summary, locale)}</p>
        </div>
      </section>

      <section className="page-shell section catalog-section">
        {products.length > 0 ? (
          <>
            <div className="section-heading catalog-section-heading">
              <p className="eyebrow">Fotomax</p>
              <h2>{locale === "zh-HK" ? "產品" : "Products"}</h2>
            </div>
            <CategoryProductGrid products={products} locale={locale} initialFilter={initialFilter} />
          </>
        ) : (
          <div className="empty-state">
            <h2>{locale === "zh-HK" ? "暫未有產品" : "No products yet"}</h2>
            <p>
              {locale === "zh-HK"
                ? "請返回首頁查看其他 Fotomax 分類。"
                : "Return to the homepage to browse other Fotomax categories."}
            </p>
            <Link className="button primary" href={localeHref(locale, "/")}>
              {locale === "zh-HK" ? "瀏覽產品分類" : "Browse categories"}
            </Link>
          </div>
        )}
      </section>

      {relatedServices.length > 0 ? (
        <section className="page-shell service-strip" aria-label={locale === "zh-HK" ? "相關服務" : "Related services"}>
          {relatedServices.map((entry) => (
            <Link key={entry.handle} href={localeHref(locale, `/services/${entry.handle}`)}>
              <span>{comingSoonLabel}</span>
              <strong>{localize(entry.title, locale)}</strong>
              <p>{comingSoonSummary}</p>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  )
}
