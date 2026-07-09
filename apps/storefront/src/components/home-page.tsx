import { Camera, Images, Sparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { categories, localize, products, serviceEntries, t, type Locale } from "@fotomax/shared"
import { localeHref } from "../lib/locales"
import { CategoryTile } from "./category-tile"
import { ProductCard } from "./product-card"

export function HomePage({ locale }: { locale: Locale }) {
  const featuredProducts = products.slice(0, 4)

  return (
    <main id="main-content">
      <section className="home-hero">
        <Image
          className="hero-backdrop"
          src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1800&q=80"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="page-shell hero-content">
          <div>
            <p className="eyebrow">Fotomax</p>
            <h1>{locale === "zh-HK" ? "影像生活，由沖印到禮物一站完成。" : "Photo life, from prints to gifts in one modern shop."}</h1>
            <p>
              {locale === "zh-HK"
                ? "快速找到相片沖印、相簿、即影即有菲林及個人化產品，並前往合適的門市取貨服務。"
                : "Browse prints, photobooks, instant film, and personalized products with clear paths to store pickup."}
            </p>
            <div className="hero-actions">
              <Link className="button primary" href={localeHref(locale, "/categories/photo-print")}>
                <Camera size={18} aria-hidden="true" />
                {localize(categories[0].name, locale)}
              </Link>
              <Link className="button secondary" href={localeHref(locale, "/categories/personalized-gifts")}>
                <Sparkles size={18} aria-hidden="true" />
                {localize(categories[2].name, locale)}
              </Link>
            </div>
          </div>
          <div className="hero-panel" aria-label={locale === "zh-HK" ? "Fotomax 精選服務" : "Featured Fotomax services"}>
            <Images size={32} aria-hidden="true" />
            <strong>{locale === "zh-HK" ? "門市取貨及影像服務" : "Store pickup and photo services"}</strong>
            <span>{locale === "zh-HK" ? "更多取貨選項即將推出" : "More pickup options coming soon"}</span>
          </div>
        </div>
      </section>

      <section className="page-shell section">
        <div className="section-heading">
          <p className="eyebrow">{locale === "zh-HK" ? "分類" : "Categories"}</p>
          <h2>{locale === "zh-HK" ? "從你要做的影像任務開始" : "Start with the photo job you need"}</h2>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <CategoryTile key={category.handle} category={category} locale={locale} />
          ))}
        </div>
      </section>

      <section className="page-shell section">
        <div className="section-heading split">
          <div>
            <p className="eyebrow">{locale === "zh-HK" ? "精選" : "Featured"}</p>
            <h2>{locale === "zh-HK" ? "熱門產品及服務" : "Popular products and services"}</h2>
          </div>
          <Link className="text-link" href={localeHref(locale, "/categories/promotions")}>
            {locale === "zh-HK" ? "查看優惠" : "View promotions"}
          </Link>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <ProductCard key={product.handle} product={product} locale={locale} />
          ))}
        </div>
      </section>

      <section className="page-shell service-strip">
        {serviceEntries.map((entry) => (
          <Link key={entry.handle} href={localeHref(locale, `/services/${entry.handle}`)}>
            <span>{t(locale, "nextPhase")}</span>
            <strong>{localize(entry.title, locale)}</strong>
            <p>{localize(entry.summary, locale)}</p>
          </Link>
        ))}
      </section>
    </main>
  )
}
