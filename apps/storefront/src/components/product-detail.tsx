import { CheckCircle2, Store } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import type { CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"
import { ProductPurchasePanel } from "./product-purchase-panel"

export function ProductDetail({
  product,
  category,
  locale,
}: {
  product: CatalogProduct
  category: CatalogCategory
  locale: Locale
}) {
  return (
    <main id="main-content" className="page-shell product-detail">
      <div className="product-gallery">
        {product.thumbnail ? (
          <Image
            className="product-detail-image"
            src={product.thumbnail}
            alt={product.title}
            fill
            priority
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 920px) 100vw, 60vw"
          />
        ) : (
          <div className="product-image-placeholder" aria-hidden="true" />
        )}
      </div>
      <section className="product-info">
        <Link className="text-link" href={localeHref(locale, "/categories/" + category.handle)}>
          {category.title}
        </Link>
        {product.badge ? <span className="badge">{product.badge}</span> : null}
        <h1>{product.title}</h1>
        <p>{product.description}</p>
        <ProductPurchasePanel
          product={product}
          locale={locale}
          photoPrintEnabled={process.env.NEXT_PUBLIC_PHOTO_PRINT_ENABLED === "true"}
        />
        <div className="detail-notes">
          <p>
            <Store size={18} aria-hidden="true" />
            {locale === "zh-HK"
              ? "門市取貨狀況目前使用測試資料。"
              : "Pickup availability currently uses staging test data."}
          </p>
          <p>
            <CheckCircle2 size={18} aria-hidden="true" />
            {locale === "zh-HK"
              ? "所有價格均以港幣顯示。"
              : "All prices are shown in Hong Kong dollars."}
          </p>
        </div>
      </section>
    </main>
  )
}
