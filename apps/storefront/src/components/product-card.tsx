import { ShoppingBag } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { formatPrice, localize, type Locale, type Product } from "@fotomax/shared"
import { localeHref } from "../lib/locales"

export function ProductCard({ product, locale }: { product: Product; locale: Locale }) {
  const productName = localize(product.name, locale)

  return (
    <article className="product-card">
      <Link
        href={localeHref(locale, `/products/${product.handle}`)}
        className="product-image"
        aria-label={locale === "zh-HK" ? `查看${productName}` : `View ${productName}`}
      >
        <Image src={product.image} alt="" fill sizes="(max-width: 920px) 100vw, 25vw" />
      </Link>
      <div className="product-card-body">
        <span className="badge">{localize(product.badge, locale)}</span>
        <h3>
          <Link href={localeHref(locale, `/products/${product.handle}`)}>{productName}</Link>
        </h3>
        <p>{localize(product.description, locale)}</p>
        <div className="product-card-footer">
          <strong>{formatPrice(product.priceCents, locale)}</strong>
          <ShoppingBag size={18} aria-hidden="true" />
        </div>
      </div>
    </article>
  )
}
