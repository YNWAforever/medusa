import { CheckCircle2, Store } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { formatPrice, localize, type Category, type Locale, type Product } from "@fotomax/shared"
import { localeHref } from "../lib/locales"
import { AddToCartButton } from "./add-to-cart-button"

export function ProductDetail({ product, category, locale }: { product: Product; category: Category; locale: Locale }) {
  const productName = localize(product.name, locale)

  return (
    <main id="main-content" className="page-shell product-detail">
      <div className="product-gallery">
        <Image
          className="product-detail-image"
          src={product.image}
          alt={productName}
          fill
          priority
          loading="eager"
          fetchPriority="high"
          sizes="(max-width: 920px) 100vw, 60vw"
        />
      </div>
      <section className="product-info">
        <Link className="text-link" href={localeHref(locale, `/categories/${category.handle}`)}>
          {localize(category.name, locale)}
        </Link>
        <span className="badge">{localize(product.badge, locale)}</span>
        <h1>{productName}</h1>
        <p>{localize(product.description, locale)}</p>
        <strong className="price">{formatPrice(product.priceCents, locale)}</strong>
        <p className="option-note">
          {locale === "zh-HK"
            ? "以下選項只供參考；網上訂購即將推出。"
            : "Options are shown for reference; online ordering is coming soon."}
        </p>
        <section className="option-stack" aria-labelledby="product-details-heading">
          <h2 id="product-details-heading">{locale === "zh-HK" ? "產品資料" : "Product details"}</h2>
          <dl className="option-list">
            {product.options.map((option) => (
              <div className="option-group" key={localize(option.name, "en")}>
                <dt>{localize(option.name, locale)}</dt>
                <dd>
                  <ul className="option-values">
                    {option.values.map((value) => (
                      <li key={localize(value, "en")}>{localize(value, locale)}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="availability-note">
          <AddToCartButton product={product} locale={locale} />
        </p>
        <div className="detail-notes">
          <p>
            <Store size={18} aria-hidden="true" />
            {locale === "zh-HK" ? "門市取貨詳情即將推出。" : "Store pickup details are coming soon."}
          </p>
          <p>
            <CheckCircle2 size={18} aria-hidden="true" />
            {locale === "zh-HK" ? "所有價格均以港幣顯示。" : "All prices are shown in Hong Kong dollars."}
          </p>
        </div>
      </section>
    </main>
  )
}
